import { AUDIO } from "./Tuning";
import type { OutcomeKind, Question } from "./types";

/**
 * The sound of Galaxia. Every cue is synthesised at runtime through the Web
 * Audio API, so nothing is downloaded, nothing is decoded and no asset can
 * drift out of step with the visuals it belongs to.
 *
 * The thing that decides whether synthesis sounds built or sounds cheap is
 * not the oscillators, it is everything around them:
 *
 *   layers    a crash is a crack, a mass, a hull ringing and debris coming
 *             off, not one noise burst. Each layer has its own envelope, and
 *             the inharmonic ratios in the ring are what make it read as
 *             metal rather than as a note
 *   movement  passes sweep their filter up and back down and cross the
 *             stereo field with it, so a rock goes past rather than plays
 *   drive     impacts run through a soft-clip curve, which is what gives
 *             them grit instead of politeness
 *   space     one convolution reverb, fed by a send from every cue. Dry
 *             one-shots always sound like a browser making beeps
 *   glue      a duck on the music and engine under each hit, and a limiter
 *             across the master so the mix never clips
 *
 * Over that sit the continuous layers: the engine drone and rushing-air bed,
 * both tracking the same 0..1 speed ratio the FOV and the streaks use, and a
 * generative music loop whose tempo and brightness ride it too.
 *
 * Nothing in here is load-bearing. Browsers block audio until a gesture,
 * some devices have no output at all and AudioContext can simply throw, so
 * every entry point is a no-op when the context is missing and the whole
 * class can be constructed and called on a machine that never makes a sound.
 */

/** Web Audio cannot ramp to zero on an exponential curve. This is silence. */
const SILENT = 0.0001;

/**
 * Which bed the music loop is playing. One scheduler, two tables of notes and
 * gains in `AUDIO.music`: the run is flown to `cruise`, the alien stage to
 * `dread`.
 */
export type MusicMood = "cruise" | "dread";

/** Options shared by every one-shot voice. */
interface VoiceOptions {
  duration: number;
  gain: number;
  /** Seconds to reach full gain. Short is a hit, long is a swell. */
  attack?: number;
  /** Seconds to wait before the voice starts. */
  delay?: number;
  /** How much of this voice goes to the reverb, 0..1. */
  send?: number;
  /** Run it through the soft-clip curve. Grit, for impacts. */
  drive?: boolean;
  /** Pan start and end, -1..1. The voice travels between them. */
  pan?: [number, number];
  bus?: GainNode | null;
}

interface ToneOptions extends VoiceOptions {
  type?: OscillatorType;
  /** Glide to this frequency across the voice. */
  sweepTo?: number;
  filterHz?: number;
  filterQ?: number;
  detune?: number;
}

interface NoiseOptions extends VoiceOptions {
  type: BiquadFilterType;
  from: number;
  to: number;
  /**
   * Frequency to pass through on the way, reached at `peakAt` of the
   * duration. This is what turns a sweep into something going past.
   */
  peak?: number;
  peakAt?: number;
  q?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private engineBus: GainNode | null = null;
  /** Send into the reverb. Voices tap this rather than owning a convolver. */
  private reverbSend: GainNode | null = null;
  /** Shared soft-clip curve. Voices that want drive wear their own node. */
  private driveCurve: Float32Array | null = null;

  /** The drone: two detuned saws through a lowpass, plus filtered noise. */
  private drone: OscillatorNode[] = [];
  private droneFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private airSource: AudioBufferSourceNode | null = null;
  private airFilter: BiquadFilterNode | null = null;
  private airGain: GainNode | null = null;

  /** One noise buffer, shared by the air bed and every noise-based cue. */
  private noise: AudioBuffer | null = null;

  /** Music scheduler. */
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;
  private mood: MusicMood = "cruise";

  /** Smoothed 0..1 speed ratio, what every layer reads. */
  private intensity = 0;
  private warningTimer = 0;

  private running = false;
  private muted: boolean;
  private disposed = false;
  private unlockBound = false;

  constructor(muted = false) {
    this.muted = muted;
  }

  // --------------------------------------------------------------- lifecycle

  /**
   * Build the graph. Safe to call more than once and safe to call before any
   * gesture: the context simply starts suspended and the first tap resumes it.
   */
  init(): void {
    if (this.ctx || this.disposed || typeof window === "undefined") return;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      // No output device, or a policy that refuses a context outright.
      return;
    }
    this.ctx = ctx;

    // Master into a limiter: the cues are layered and overlapping, and a
    // crash landing on the music would otherwise clip the output. The attack
    // has to be fast enough to catch the crack, which is the sharpest
    // transient in the game and the one that was getting through.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 4;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? SILENT : AUDIO.master;
    this.master.connect(limiter);

    this.musicBus = this.bus(AUDIO.musicBus);
    this.sfxBus = this.bus(AUDIO.sfxBus);
    this.engineBus = this.bus(AUDIO.engineBus);

    // The room. One convolver, fed by sends, so the cost is paid once
    // however many voices are ringing.
    const convolver = ctx.createConvolver();
    convolver.buffer = buildImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = AUDIO.reverb.wet;
    convolver.connect(wet);
    wet.connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(convolver);

    this.driveCurve = buildDriveCurve();

    this.noise = buildNoise(ctx);
    this.buildDrone();
    this.bindUnlock();
    void this.resume();
  }

  private bus(level: number): GainNode {
    const ctx = this.ctx as AudioContext;
    const gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(this.master as GainNode);
    return gain;
  }

  /**
   * Autoplay policy: a context created without a gesture starts suspended and
   * stays that way until one arrives. The listeners are cheap and remove
   * themselves as soon as the context is actually running.
   */
  private bindUnlock(): void {
    if (this.unlockBound || typeof window === "undefined") return;
    this.unlockBound = true;
    window.addEventListener("pointerdown", this.onGesture, { passive: true });
    window.addEventListener("keydown", this.onGesture, { passive: true });
    window.addEventListener("touchstart", this.onGesture, { passive: true });
  }

  private unbindUnlock(): void {
    if (!this.unlockBound || typeof window === "undefined") return;
    this.unlockBound = false;
    window.removeEventListener("pointerdown", this.onGesture);
    window.removeEventListener("keydown", this.onGesture);
    window.removeEventListener("touchstart", this.onGesture);
  }

  private onGesture = (): void => {
    void this.resume();
  };

  private async resume(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    if (isRunning(ctx)) {
      this.unbindUnlock();
      return;
    }
    try {
      await ctx.resume();
      if (isRunning(ctx)) this.unbindUnlock();
    } catch {
      // Still no gesture. The next one tries again.
    }
  }

  /** Start or stop the whole soundtrack. Called on pause and on resume. */
  setRunning(running: boolean): void {
    if (this.disposed || this.running === running) return;
    this.running = running;
    if (running) {
      this.init();
      void this.resume();
      this.startMusic();
    } else {
      this.stopMusic();
    }
    this.applyLevel();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted) {
      this.init();
      void this.resume();
      if (this.running) this.startMusic();
    } else {
      this.stopMusic();
    }
    this.applyLevel();
  }

  /** One fade covers mute, unmute, pause and resume. */
  private applyLevel(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const target = this.muted || !this.running ? SILENT : AUDIO.master;
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, SILENT), now);
    this.master.gain.exponentialRampToValueAtTime(target, now + AUDIO.fadeSeconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.stopMusic();
    this.unbindUnlock();

    for (const osc of this.drone) {
      try {
        osc.stop();
      } catch {
        // Already stopped with the context.
      }
    }
    this.drone = [];
    try {
      this.airSource?.stop();
    } catch {
      // As above.
    }
    this.airSource = null;

    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.musicBus = this.sfxBus = this.engineBus = null;
    this.reverbSend = null;
    this.driveCurve = null;
    void ctx?.close().catch(() => {});
  }

  // ------------------------------------------------------------- engine bed

  private buildDrone(): void {
    const ctx = this.ctx;
    if (!ctx || !this.engineBus || !this.noise) return;
    const cfg = AUDIO.engine;

    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = cfg.filterHz[0];
    this.droneFilter.Q.value = 6;

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = cfg.gain[0];
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.engineBus);

    for (const detune of [-cfg.detuneCents, cfg.detuneCents]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = cfg.baseHz;
      osc.detune.value = detune;
      osc.connect(this.droneFilter);
      osc.start();
      this.drone.push(osc);
    }

    // Rushing air: the same noise buffer on a loop, bandpassed. It is what
    // makes speed audible; the drone alone reads as an idling engine.
    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = "bandpass";
    this.airFilter.frequency.value = cfg.airHz[0];
    this.airFilter.Q.value = 0.7;

    this.airGain = ctx.createGain();
    this.airGain.gain.value = cfg.airGain[0];
    this.airFilter.connect(this.airGain);
    this.airGain.connect(this.engineBus);

    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    air.connect(this.airFilter);
    air.start();
    this.airSource = air;
  }

  /**
   * Per frame. `ratio` is the same 0..1 visual speed the FOV and streaks
   * ride; `thrust` and `open` drive the low-thrust warning tick.
   */
  update(dt: number, ratio: number, thrust: number, open: boolean): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || !this.running) return;

    // Follow speed rather than snap to it: velocity steps on every impulse,
    // and a drone that jumped with it would read as a glitch.
    const follow = 1 - Math.exp(-dt / Math.max(AUDIO.engine.glide, 1e-3));
    this.intensity += (clamp01(ratio) - this.intensity) * follow;

    const cfg = AUDIO.engine;
    const t = this.intensity;
    const ramp = ctx.currentTime + cfg.glide;

    for (const osc of this.drone) {
      osc.frequency.linearRampToValueAtTime(lerp(cfg.baseHz, cfg.maxHz, t), ramp);
    }
    this.droneFilter?.frequency.linearRampToValueAtTime(
      lerp(cfg.filterHz[0], cfg.filterHz[1], t),
      ramp,
    );
    this.droneGain?.gain.linearRampToValueAtTime(lerp(cfg.gain[0], cfg.gain[1], t), ramp);
    this.airFilter?.frequency.linearRampToValueAtTime(lerp(cfg.airHz[0], cfg.airHz[1], t), ramp);
    this.airGain?.gain.linearRampToValueAtTime(lerp(cfg.airGain[0], cfg.airGain[1], t), ramp);

    this.updateWarning(dt, thrust, open);
  }

  /** Thrust is the answer timer; the tick is how it sounds running out. */
  private updateWarning(dt: number, thrust: number, open: boolean): void {
    const cfg = AUDIO.warning;
    if (!open || thrust > cfg.from) {
      this.warningTimer = 0;
      return;
    }
    const urgency = 1 - clamp01(thrust / Math.max(cfg.from, 1e-3));
    this.warningTimer -= dt;
    if (this.warningTimer > 0) return;
    this.warningTimer = lerp(cfg.maxInterval, cfg.minInterval, urgency);

    // A muted wooden tick rather than a beep: it reads as a countdown without
    // sitting on top of the music the way a square wave does.
    const gain = cfg.gain * (0.55 + 0.45 * urgency);
    this.tone(cfg.hz * (1 + 0.25 * urgency), 0, {
      duration: 0.09,
      gain,
      type: "triangle",
      sweepTo: cfg.hz * 0.55,
      filterHz: 2400,
      send: 0.15,
    });
    this.noiseVoice(0, {
      duration: 0.035,
      gain: gain * 0.5,
      type: "highpass",
      from: 2600,
      to: 1800,
    });
  }

  /** Spike the engine, e.g. when the exhaust pulses on a burst. */
  private pulseEngine(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneGain) return;
    const now = ctx.currentTime;
    const base = lerp(AUDIO.engine.gain[0], AUDIO.engine.gain[1], this.intensity);
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setValueAtTime(base * (1 + 0.8 * strength), now);
    this.droneGain.gain.linearRampToValueAtTime(base, now + 0.5 + 0.2 * strength);
  }

  /**
   * Sidechain the bed under a cue. The music and the engine dip fast and
   * come back slowly, which is what leaves a hit room to land in.
   */
  private duck(amount: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const cfg = AUDIO.duck;
    const now = ctx.currentTime;
    for (const [bus, level] of [
      [this.musicBus, AUDIO.musicBus],
      [this.engineBus, AUDIO.engineBus],
    ] as const) {
      if (!bus) continue;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(level * (1 - amount), now + cfg.attack);
      bus.gain.linearRampToValueAtTime(level, now + cfg.attack + cfg.release);
    }
  }

  // ----------------------------------------------------------------- music

  private startMusic(): void {
    if (this.musicTimer !== null || this.muted || !this.running) return;
    const ctx = this.ctx;
    if (!ctx) return;
    this.nextStepTime = ctx.currentTime + 0.08;
    this.musicTimer = setInterval(() => this.scheduleMusic(), AUDIO.music.tickSeconds * 1000);
  }

  private stopMusic(): void {
    if (this.musicTimer === null) return;
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  /**
   * Turn the bed. The step counter resets so the new key starts at bar 0
   * rather than landing halfway through a progression it was never written
   * for, and the crossfade comes for free: the outgoing bar's pad is nearly a
   * bar long and rings over the first bar of the new mood.
   *
   * Deliberately NOT a ramp on `musicBus.gain`: `duck` writes that gain back
   * to `AUDIO.musicBus` on every impact and would wipe it out.
   */
  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.step = 0;
  }

  /**
   * Lookahead scheduler: a timer this coarse cannot place a note accurately,
   * so it only queues the notes falling inside the next lookahead window and
   * the audio clock does the timing.
   */
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || !this.running) return;
    const cfg = AUDIO.music;
    const mood = AUDIO.music[this.mood];

    while (this.nextStepTime < ctx.currentTime + cfg.lookahead) {
      const stepSeconds = 60 / lerp(mood.bpm[0], mood.bpm[1], this.intensity) / 2;
      this.playStep(this.step, this.nextStepTime, stepSeconds);
      this.nextStepTime += stepSeconds;
      this.step = (this.step + 1) % (cfg.steps * mood.roots.length);
    }
  }

  private playStep(step: number, when: number, stepSeconds: number): void {
    const cfg = AUDIO.music;
    const mood = AUDIO.music[this.mood];
    const bar = Math.floor(step / cfg.steps);
    const beat = step % cfg.steps;
    const root = mood.roots[bar] ?? mood.roots[0];
    const t = this.intensity;

    // Bass on the downbeat and the half bar: the pulse the run is flown to.
    // Driven, so it has some weight on a phone speaker.
    if (beat === 0 || beat === 4) {
      this.tone(root * cfg.octaves.bass, when, {
        duration: stepSeconds * 1.6,
        gain: mood.bassGain,
        type: "triangle",
        attack: 0.012,
        filterHz: 520,
        drive: true,
        bus: this.musicBus,
      });
    }

    // Sub: one long note under the whole bar, the part of the bed that is
    // felt rather than heard. Undriven on purpose, so unlike the bass it
    // stays on the music bus and ducks out of the way of an impact.
    if (beat === 0 && mood.subGain > 0) {
      this.tone(root / 2, when, {
        duration: stepSeconds * cfg.steps * 1.1,
        gain: mood.subGain,
        type: "sine",
        attack: stepSeconds * 2,
        bus: this.musicBus,
      });
    }

    // Pad: two detuned sines across the whole bar, holding the chord under
    // everything else so the loop never sounds like four separate blips.
    // `padSecond` stacks a third voice a semitone or two above them, which
    // is what stops the chord sitting still.
    if (beat === 0) {
      const barSeconds = stepSeconds * cfg.steps;
      for (const detune of [-mood.padDetune, mood.padDetune]) {
        this.tone(root * cfg.octaves.pad, when, {
          duration: barSeconds * 0.95,
          gain: mood.padGain,
          type: "sine",
          attack: barSeconds * 0.25,
          detune,
          send: cfg.send,
          bus: this.musicBus,
        });
      }
      if (mood.padSecond > 0) {
        this.tone(root * cfg.octaves.pad * Math.pow(2, mood.padSecond / 12), when, {
          duration: barSeconds * 0.8,
          gain: mood.padGain * 0.7,
          type: "sine",
          attack: barSeconds * 0.4,
          send: cfg.send,
          bus: this.musicBus,
        });
      }
    }

    // Arpeggio: the melody, climbing the scale and reaching an octave higher
    // the faster the ship is going. Triangle through a resonant lowpass with
    // a tail on it, rather than a bare square: the same line, without the
    // toy. `arpEvery` thins it out, because a bed meant to unsettle needs
    // more space in it than a bed meant to drive.
    if (beat % mood.arpEvery === 0) {
      const degree = (ARP[beat % ARP.length] ?? 0) + (t > 0.55 && beat % 2 === 1 ? 5 : 0);
      const semitones =
        (mood.scale[degree % mood.scale.length] ?? 0) + 12 * Math.floor(degree / mood.scale.length);
      const note = root * cfg.octaves.arp * Math.pow(2, semitones / 12);
      this.tone(note, when, {
        duration: stepSeconds * 0.9,
        gain: lerp(mood.arpGain[0], mood.arpGain[1], t),
        type: "triangle",
        attack: 0.006,
        filterHz: lerp(mood.arpFilterHz[0], mood.arpFilterHz[1], t),
        filterQ: 3,
        send: cfg.send,
        bus: this.musicBus,
      });

      // Sparkle: the same note an octave up, fading in with speed. It is what
      // makes the loop lift as the run gets fast rather than just quicken.
      // A mood can have none: dread should not lift.
      if (t > 0.25 && mood.sparkleGain > 0) {
        this.tone((note * cfg.octaves.sparkle) / cfg.octaves.arp, when, {
          duration: stepSeconds * 0.55,
          gain: mood.sparkleGain * clamp01((t - 0.25) / 0.5),
          type: "triangle",
          attack: 0.004,
          send: cfg.send,
          bus: this.musicBus,
        });
      }
    }

    // Hat: an offbeat tick. It is what makes the tempo readable at low
    // volume on a phone speaker, and the first thing to go when the bed
    // should stop sounding like an arcade.
    if (beat % 2 === 1 && mood.hatGain[1] > 0) {
      this.noiseVoice(when, {
        duration: 0.04,
        gain: lerp(mood.hatGain[0], mood.hatGain[1], t),
        type: "highpass",
        from: 7000,
        to: 9500,
        bus: this.musicBus,
      });
    }
  }

  // ------------------------------------------------------------------- cues

  /** A new encounter is called. */
  encounter(question: Question): void {
    if (question.type === "earth") {
      // The station is the odd one out on screen, so it is the odd one out
      // here too: a violet shimmer rather than the usual alert.
      this.tone(220, 0, {
        duration: 1.6,
        gain: 0.07,
        type: "sine",
        attack: 0.5,
        sweepTo: 330,
        send: 0.7,
      });
      this.tone(330, 0, {
        duration: 1.6,
        gain: 0.055,
        type: "sine",
        attack: 0.6,
        detune: 8,
        send: 0.7,
      });
      return;
    }
    if (question.type === "vector") {
      // The scout is already out there and the shot is the player's to take,
      // so this opens lower and slower than a lane: a held note rather than
      // a call to act.
      this.tone(49, 0, {
        duration: 1.8,
        gain: 0.2,
        type: "sine",
        attack: 0.55,
        sweepTo: 41,
        send: 0.55,
      });
      this.noiseVoice(0, {
        duration: 1.4,
        gain: 0.05,
        type: "bandpass",
        from: 900,
        to: 260,
        q: 3,
        attack: 0.5,
        send: 0.6,
      });
      return;
    }
    // A sub swell with a breath of air over it: something large is coming,
    // and the lanes are open.
    const cluster = question.type === "cluster";
    this.tone(cluster ? 82 : 66, 0, {
      duration: 0.9,
      gain: 0.22,
      type: "sine",
      attack: 0.08,
      sweepTo: cluster ? 120 : 98,
      send: 0.3,
    });
    this.noiseVoice(0, {
      duration: 0.8,
      gain: 0.08,
      type: "bandpass",
      from: 400,
      to: 1500,
      q: 1.4,
      attack: 0.2,
      send: 0.5,
    });
  }

  /**
   * The scout warps in at the waypoint. Layered like an impact, because that
   * is what it is: a sub falling away, an inharmonic cluster ringing over it
   * and a rush of air closing in behind. It ducks the bed, which is also
   * what covers the seam where the music changes key under it.
   */
  alienArrival(): void {
    const cfg = AUDIO.alienArrival;
    this.duck(AUDIO.duck.burn);

    this.tone(cfg.subFrom, 0, {
      duration: cfg.subSeconds,
      gain: cfg.subGain,
      type: "sine",
      attack: 0.05,
      sweepTo: cfg.subTo,
      drive: true,
      send: 0.3,
    });

    // Inharmonic, not a chord: ratios that do not belong to one fundamental
    // are what make a thing read as a hull rather than as a note.
    for (const [i, ratio] of cfg.ringRatios.entries()) {
      this.tone(cfg.ringHz * ratio, 0, {
        duration: cfg.ringSeconds,
        gain: cfg.ringGain / (i + 1),
        type: "sine",
        attack: 0.35 + i * 0.12,
        delay: i * 0.06,
        send: cfg.send,
      });
    }

    this.noiseVoice(0, {
      duration: cfg.rushSeconds,
      gain: cfg.rushGain,
      type: "bandpass",
      from: cfg.rushFrom,
      to: cfg.rushTo,
      q: 1.6,
      attack: cfg.rushSeconds * 0.75,
      send: cfg.send,
      pan: [0.6, -0.15],
    });
  }

  /** PLASMA collected. The pitch climbs with the charge in the reactor. */
  collect(charge: number): void {
    const step = Math.max(charge - 1, 0);
    const root = 620 * Math.pow(2, step / 6);
    // FM bells, not square blips: a struck ring with a tail, arpeggiated
    // upward so the pod reads as gained.
    for (const [i, semitones] of [0, 7, 12].entries()) {
      this.bell(root * Math.pow(2, semitones / 12), {
        duration: AUDIO.bell.seconds * (i === 2 ? 1.3 : 1),
        gain: AUDIO.bell.gain * (i === 2 ? 0.8 : 1),
        delay: i * 0.05,
      });
    }
    // The pod itself going through the ship: a short rush of air.
    this.noiseVoice(0, {
      duration: 0.3,
      gain: 0.09,
      type: "bandpass",
      from: 900,
      to: 4200,
      peak: 5200,
      peakAt: 0.4,
      q: 3,
      pan: [-0.3, 0.3],
      send: 0.4,
    });
    this.pulseEngine(0.3 + 0.2 * step);
  }

  /** The verdict is on its way down the lane. */
  strike(): void {
    // Approach: a low bandpass rising as the thing closes. It sets up the
    // contact rather than being an event of its own.
    this.noiseVoice(0, {
      duration: 0.5,
      gain: 0.1,
      type: "bandpass",
      from: 160,
      to: 700,
      q: 2.2,
      attack: 0.25,
      send: 0.3,
    });
  }

  /**
   * A gun going off. Four layers in one instant: see `AUDIO.laser`.
   *
   * Fired by the ship when the vector shot is taken, and by the scout when
   * it shoots back. `pitch` is the whole cue transposed, which is the one
   * thing that separates the two: ours is bright and tight, theirs is the
   * same discharge from something bigger and further away.
   */
  laser(pitch = 1): void {
    const cfg = AUDIO.laser;
    this.duck(cfg.duck);

    // The capacitor letting go. Nothing else here is this short, and it is
    // what puts the "sudden" in the shot.
    this.noiseVoice(0, {
      duration: cfg.crack.seconds,
      gain: cfg.crack.gain,
      type: "bandpass",
      from: cfg.crack.hz[0]! * pitch,
      to: cfg.crack.hz[1]! * pitch,
      q: cfg.crack.q,
      drive: true,
      send: cfg.send,
    });

    // The discharge: two saws falling the whole range, beating against each
    // other on the way down.
    for (const detune of [-cfg.body.detuneCents, cfg.body.detuneCents]) {
      this.tone(cfg.body.hz[0]! * pitch, 0, {
        duration: cfg.body.seconds,
        gain: cfg.body.gain * 0.5,
        type: "sawtooth",
        sweepTo: cfg.body.hz[1]! * pitch,
        filterHz: 5200 * pitch,
        filterQ: cfg.body.q,
        detune,
        drive: true,
        send: cfg.send,
      });
    }

    // The sub, so the hull wears the recoil.
    this.tone(cfg.sub.hz[0]! * pitch, 0, {
      duration: cfg.sub.seconds,
      gain: cfg.sub.gain,
      type: "sine",
      sweepTo: cfg.sub.hz[1]! * pitch,
      send: cfg.send * 0.4,
    });

    // The bolt leaving, crossing the field as it goes.
    this.noiseVoice(0, {
      duration: cfg.bolt.seconds,
      gain: cfg.bolt.gain,
      type: "bandpass",
      from: cfg.bolt.hz[0]! * pitch,
      to: cfg.bolt.hz[1]! * pitch,
      q: cfg.bolt.q,
      pan: [cfg.bolt.pan[0]!, cfg.bolt.pan[1]!],
      send: cfg.send,
    });
  }

  /**
   * Something going up out there: the scout taking the shot. See
   * `AUDIO.blast`. `strength` scales the whole thing, so a glance off the
   * hull is not the same event as a kill.
   */
  blast(strength = 1): void {
    const cfg = AUDIO.blast;
    this.duck(cfg.duck * strength);

    this.noiseVoice(0, {
      duration: cfg.crack.seconds,
      gain: cfg.crack.gain * strength,
      type: "highpass",
      from: cfg.crack.hz[0]!,
      to: cfg.crack.hz[1]!,
      drive: true,
      send: cfg.send,
    });
    this.noiseVoice(0, {
      duration: cfg.body.seconds * strength,
      gain: cfg.body.gain * strength,
      type: "lowpass",
      from: cfg.body.hz[0]!,
      to: cfg.body.hz[1]!,
      q: cfg.body.q,
      drive: true,
      send: cfg.send,
    });
    this.tone(cfg.sub.hz[0]!, 0, {
      duration: cfg.sub.seconds * strength,
      gain: cfg.sub.gain * strength,
      type: "sine",
      sweepTo: cfg.sub.hz[1]!,
      delay: 0.02,
      send: cfg.send * 0.5,
    });

    // Pieces coming off, thrown about the stereo field at random.
    const count = Math.max(Math.round(cfg.rubble.count * strength), 3);
    for (let i = 0; i < count; i += 1) {
      const pan = (Math.random() * 2 - 1) * 0.9;
      this.noiseVoice(0, {
        duration: cfg.rubble.seconds,
        gain: cfg.rubble.gain * strength,
        type: "bandpass",
        from: cfg.rubble.hz[0]! + Math.random() * (cfg.rubble.hz[1]! - cfg.rubble.hz[0]!),
        to: cfg.rubble.hz[0]!,
        q: 4,
        delay: 0.03 + Math.random() * cfg.rubble.spread,
        pan: [pan, pan],
        send: cfg.send,
      });
    }
  }

  /**
   * Docking. An airlock, not a hit: the clamps taking the hull, the hull
   * ringing off them on one low inharmonic partial, and the pressure hiss
   * of the seal a beat after. Ducks the bed the way an impact does, since a
   * mass has just met a bigger one. Numbers in `AUDIO.dock`.
   */
  dock(): void {
    const cfg = AUDIO.dock;
    this.duck(cfg.duck);

    // The clamps: a filtered thump with grit on it, and a sub under it.
    this.noiseVoice(0, {
      duration: cfg.clamp.seconds,
      gain: cfg.clamp.gain,
      type: "lowpass",
      from: cfg.clamp.hz[0]!,
      to: cfg.clamp.hz[1]!,
      q: cfg.clamp.q,
      drive: true,
      send: cfg.send,
    });
    this.tone(cfg.sub.hz[0]!, 0, {
      duration: cfg.sub.seconds,
      gain: cfg.sub.gain,
      type: "sine",
      sweepTo: cfg.sub.hz[1]!,
      send: cfg.send * 0.5,
    });
    // The hull ringing off it.
    this.bell(cfg.ring.hz, {
      duration: cfg.ring.seconds,
      gain: cfg.ring.gain,
      delay: cfg.ring.delay,
      ratio: cfg.ring.ratio,
      index: cfg.ring.index,
    });
    // The seal: air, arriving late and dying away.
    this.noiseVoice(0, {
      duration: cfg.hiss.seconds,
      gain: cfg.hiss.gain,
      type: "bandpass",
      from: cfg.hiss.hz[0]!,
      to: cfg.hiss.hz[1]!,
      q: cfg.hiss.q,
      attack: cfg.hiss.attack,
      delay: cfg.hiss.delay,
      send: cfg.send,
    });
  }

  /**
   * The launch countdown. `step` is 3, 2 or 1, then 0 for GO.
   *
   * The pips are deliberately plain -- one clean tone with a click on the
   * front, the same every time -- so that GO, which is an octave up with a
   * fifth over it and the room behind it, reads as a start and not as a
   * fourth pip.
   */
  countdown(step: number): void {
    const cfg = AUDIO.countdown;
    const go = step <= 0;

    this.noiseVoice(0, {
      duration: 0.012,
      gain: cfg.gain * 0.5,
      type: "highpass",
      from: 3200,
      to: 2400,
      send: cfg.send * 0.5,
    });
    this.tone(go ? cfg.goHz : cfg.pipHz, 0, {
      duration: go ? cfg.goSeconds : cfg.seconds,
      gain: cfg.gain,
      type: "triangle",
      attack: 0.008,
      send: cfg.send,
    });
    if (!go) return;

    // GO: a fifth over the top and the sub under it, so the run starts on a
    // chord rather than a beep.
    this.tone(cfg.goHz * 1.5, 0, {
      duration: cfg.goSeconds,
      gain: cfg.gain * 0.6,
      type: "triangle",
      attack: 0.008,
      delay: 0.02,
      send: cfg.send,
    });
    this.tone(cfg.pipHz / 4, 0, {
      duration: cfg.goSeconds,
      gain: cfg.gain * 0.8,
      type: "sine",
      send: cfg.send * 0.5,
    });
    this.pulseEngine(0.5);
  }

  /** A NOVA scan fires. */
  nova(): void {
    for (const [i, semitones] of [0, 5, 9, 14].entries()) {
      this.bell(760 * Math.pow(2, semitones / 12), {
        duration: 1.1,
        gain: 0.1,
        delay: i * 0.05,
        ratio: 3.51,
        index: 180,
      });
    }
    this.noiseVoice(0, {
      duration: 0.7,
      gain: 0.05,
      type: "bandpass",
      from: 1800,
      to: 7000,
      q: 6,
      send: 0.7,
    });
  }

  /** Contact. One call covers every way an encounter can end. */
  contact(kind: OutcomeKind, charge = 0, full = false): void {
    switch (kind) {
      case "thread":
        // The lane was clear: the pod goes through and the ship leans on it.
        this.pass(0.45, 0.16, [-0.5, 0.5]);
        this.bell(540, { duration: 0.7, gain: 0.14 });
        this.soar(0.55, 0.45);
        this.pulseEngine(0.4);
        break;

      case "slingshot":
        // Boost paid off. This is the sound of a ship being thrown: a pass
        // that crosses the field, a resonant sweep climbing behind it, and
        // the sub of the hull loading up.
        this.duck(AUDIO.duck.impact * 0.6);
        this.pass(0.7, 0.26, [-0.8, 0.8]);
        this.soar(0.95, 0.9);
        this.pulseEngine(0.9);
        break;

      case "burn": {
        // The reactor dumps. A FULL BURN is the biggest moment in the run,
        // so it gets the longest rise, the deepest sub and a chord on top.
        const scale = full ? 1 : 0.5 + 0.25 * charge;
        this.duck(AUDIO.duck.burn * scale);
        this.soar(full ? 1 : 0.55 + 0.2 * charge, scale);
        this.pass(full ? 1.3 : 0.8, 0.22 * scale, [0.7, -0.7]);
        if (full) {
          // The warp itself: a held chord over the top of the rise, arriving
          // late so it lands as the burst does, not with the wind-up.
          for (const [i, semitones] of [0, 7, 12, 19].entries()) {
            this.tone(220 * Math.pow(2, semitones / 12), 0, {
              duration: 1.6,
              gain: 0.09,
              type: "triangle",
              attack: 0.08,
              delay: 0.42 + i * 0.05,
              filterHz: 3200,
              send: 0.6,
            });
          }
        }
        this.pulseEngine(full ? 1.4 : 0.6 * scale);
        break;
      }

      case "graze":
        // The bolt clips the scout and carries on past: a pass with no weight
        // behind it, and nothing lands on the hull.
        this.pass(0.35, 0.1, [-0.4, 0.4]);
        break;

      case "collision":
      case "wreck":
        this.crash(kind === "wreck");
        break;

      case "timeout":
        // Nothing hit the ship. The engines simply gave out: the drone falls
        // away, the air goes with it, and something coughs.
        this.duck(AUDIO.duck.impact * 0.7);
        this.tone(150, 0, {
          duration: 1.1,
          gain: 0.26,
          type: "sawtooth",
          sweepTo: 42,
          filterHz: 900,
          filterQ: 4,
          drive: true,
          send: 0.35,
        });
        this.noiseVoice(0, {
          duration: 1.2,
          gain: 0.12,
          type: "lowpass",
          from: 1800,
          to: 220,
          attack: 0.05,
          send: 0.4,
        });
        this.tone(64, 0, { duration: 0.5, gain: 0.2, type: "sine", sweepTo: 38, delay: 0.1 });
        break;
    }
  }

  /** The run is over. A short cadence under the share card. */
  finish(): void {
    for (const [i, semitones] of [0, 7, 12, 16].entries()) {
      this.tone(110 * Math.pow(2, semitones / 12), 0, {
        duration: 2.6,
        gain: 0.1,
        type: "triangle",
        attack: 0.1,
        delay: i * 0.13,
        filterHz: 2600,
        send: 0.55,
      });
    }
  }

  // ------------------------------------------------------------ composites

  /**
   * A crash, in four layers.
   *
   * The crack is the moment of contact and is over in under a tenth of a
   * second. The body is the mass behind it, a noise slam collapsing into a
   * sub thump, both driven so they tear rather than thud politely. The metal
   * is the hull, five inharmonic partials ringing down at different rates,
   * which is the difference between metal and a note. The rubble is debris
   * coming off, scattered at random so no two crashes are the same hit.
   */
  private crash(hard: boolean): void {
    const cfg = AUDIO.impact;
    const w = cfg.wreck;
    const gain = hard ? w.gain : 1;
    const seconds = hard ? w.seconds : 1;
    const pitch = hard ? w.pitch : 1;
    const send = cfg.send;

    this.duck(AUDIO.duck.impact * (hard ? 1.2 : 1));

    // 1. Contact.
    this.noiseVoice(0, {
      duration: cfg.crack.seconds * seconds,
      gain: cfg.crack.gain * gain,
      type: "highpass",
      from: cfg.crack.from * pitch,
      to: cfg.crack.to * pitch,
      drive: true,
      send: send * 0.5,
    });

    // 2. Mass.
    this.noiseVoice(0, {
      duration: cfg.body.seconds * seconds,
      gain: cfg.body.gain * gain,
      type: "lowpass",
      from: cfg.body.from * pitch,
      to: cfg.body.to,
      q: 1.4,
      drive: true,
      send,
    });
    this.tone(cfg.body.subFrom * pitch, 0, {
      duration: cfg.body.seconds * seconds * 1.1,
      gain: cfg.body.gain * cfg.body.subGain * gain,
      type: "sine",
      sweepTo: cfg.body.subTo * pitch,
      drive: true,
      send: send * 0.4,
    });

    // 3. Hull.
    for (const [i, ratio] of cfg.metal.ratios.entries()) {
      this.tone(cfg.metal.baseHz * pitch * ratio, 0, {
        // Higher partials die first, as they do on a struck plate.
        duration: cfg.metal.seconds * seconds * (1 - i * 0.13),
        gain: cfg.metal.gain * gain * (1 - i * 0.14),
        type: "sine",
        detune: (i % 2 === 0 ? 1 : -1) * (6 + i * 4),
        delay: 0.004 * i,
        send: send * 1.2,
      });
    }

    // 4. Debris.
    const count = Math.round(cfg.rubble.count * (hard ? w.rubble : 1));
    for (let i = 0; i < count; i += 1) {
      // Weighted toward the start: most of the debris comes off on impact
      // and the rest rattles away behind it.
      const at = Math.pow(Math.random(), 1.7) * cfg.rubble.spread * seconds;
      const hz = lerp(cfg.rubble.hz[0], cfg.rubble.hz[1], Math.random());
      this.noiseVoice(0, {
        duration: cfg.rubble.seconds * (0.6 + Math.random()),
        gain: cfg.rubble.gain * gain * (1 - at / (cfg.rubble.spread * seconds)) * (0.4 + Math.random() * 0.6),
        type: "bandpass",
        from: hz,
        to: hz * 0.55,
        q: 4 + Math.random() * 6,
        delay: 0.02 + at,
        pan: [Math.random() * 2 - 1, Math.random() * 2 - 1],
        send,
      });
    }
  }

  /**
   * Something going past. The filter climbs to a peak as it closes and falls
   * away behind, and the pan crosses with it, so it reads as a thing moving
   * rather than a filter sweeping.
   */
  private pass(duration: number, gain: number, pan: [number, number]): void {
    const cfg = AUDIO.whoosh;
    this.noiseVoice(0, {
      duration,
      gain,
      type: "bandpass",
      from: 420,
      to: 260,
      peak: 3400,
      peakAt: cfg.peakBias,
      q: cfg.q,
      attack: duration * 0.12,
      pan,
      send: cfg.send,
    });
    // Body underneath, so the pass has weight and not just air.
    this.noiseVoice(0, {
      duration: duration * 1.15,
      gain: gain * cfg.bodyGain,
      type: "lowpass",
      from: 700,
      to: 180,
      peak: 1400,
      peakAt: cfg.peakBias,
      attack: duration * 0.15,
      pan: [pan[0] * 0.6, pan[1] * 0.6],
      send: cfg.send,
    });
  }

  /**
   * Thrust winding up: a resonant sweep climbing through detuned saws, with
   * a sub under it. This is the soaring part of a boost, and `strength`
   * scales it from a lane clear to a FULL BURN.
   */
  private soar(seconds: number, strength: number): void {
    const cfg = AUDIO.boost;
    const duration = lerp(cfg.seconds[0], cfg.seconds[1], clamp01(seconds));

    for (const detune of [-cfg.detuneCents, cfg.detuneCents]) {
      this.tone(cfg.sweepHz[0], 0, {
        duration,
        gain: cfg.gain * strength * 0.5,
        type: "sawtooth",
        sweepTo: lerp(cfg.sweepHz[0], cfg.sweepHz[1], 0.5 + 0.5 * strength),
        filterHz: lerp(900, 5200, strength),
        filterQ: cfg.q,
        attack: duration * 0.22,
        detune,
        send: cfg.send,
      });
    }
    this.tone(cfg.subHz[0], 0, {
      duration: duration * 0.9,
      gain: cfg.subGain * strength,
      type: "sine",
      sweepTo: lerp(cfg.subHz[0], cfg.subHz[1], strength),
      attack: duration * 0.15,
      drive: true,
      send: cfg.send * 0.4,
    });
  }

  // -------------------------------------------------------------- synthesis

  /** A pitched voice: oscillator, optional resonant lowpass, and a tail. */
  private tone(frequency: number, at: number, options: ToneOptions): void {
    const ctx = this.ctx;
    const bus = this.busFor(options);
    if (!ctx || !bus || this.muted) return;

    const when = (at || ctx.currentTime) + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = options.type ?? "sine";
    osc.frequency.setValueAtTime(frequency, when);
    if (options.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(options.sweepTo, 1),
        when + options.duration,
      );
    }
    if (options.detune) osc.detune.value = options.detune;

    let tail: AudioNode = osc;
    if (options.filterHz !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = options.filterHz;
      filter.Q.value = options.filterQ ?? 1;
      osc.connect(filter);
      tail = filter;
    }

    const gain = this.envelope(when, options);
    tail.connect(gain);
    this.route(gain, options, bus);

    osc.start(when);
    osc.stop(when + options.duration + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /**
   * An FM bell: one operator modulating another. Two oscillators and a gain
   * buy an inharmonic ring that no single waveform has, and it is the reason
   * plasma sounds struck rather than beeped.
   */
  private bell(
    frequency: number,
    options: { duration: number; gain: number; delay?: number; ratio?: number; index?: number },
  ): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.muted) return;

    const cfg = AUDIO.bell;
    const when = ctx.currentTime + (options.delay ?? 0);

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = frequency;

    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = frequency * (options.ratio ?? cfg.ratio);

    // The modulation index falls with the note, which is what gives a bell
    // its bright strike and its pure tail.
    const index = ctx.createGain();
    index.gain.setValueAtTime(options.index ?? cfg.index, when);
    index.gain.exponentialRampToValueAtTime(1, when + options.duration);
    modulator.connect(index);
    index.connect(carrier.frequency);

    const gain = this.envelope(when, { duration: options.duration, gain: options.gain });
    carrier.connect(gain);
    this.route(gain, { duration: options.duration, gain: options.gain, send: cfg.send }, bus);

    modulator.start(when);
    carrier.start(when);
    modulator.stop(when + options.duration + 0.05);
    carrier.stop(when + options.duration + 0.05);
    carrier.onended = () => {
      carrier.disconnect();
      modulator.disconnect();
      index.disconnect();
      gain.disconnect();
    };
  }

  /** Filtered noise: the body of every impact, every rush of air. */
  private noiseVoice(at: number, options: NoiseOptions): void {
    const ctx = this.ctx;
    const bus = this.busFor(options);
    if (!ctx || !this.noise || !bus || this.muted) return;

    const when = (at || ctx.currentTime) + (options.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = options.type;
    filter.Q.value = options.q ?? (options.type === "bandpass" ? 1.2 : 0.9);
    filter.frequency.setValueAtTime(Math.max(options.from, 20), when);
    if (options.peak !== undefined) {
      // Through a peak and out the other side: the shape of a fly-past.
      const at = clamp01(options.peakAt ?? 0.4) * options.duration;
      filter.frequency.exponentialRampToValueAtTime(Math.max(options.peak, 20), when + at);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(options.to, 20),
        when + options.duration,
      );
    } else {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(options.to, 20),
        when + options.duration,
      );
    }

    const gain = this.envelope(when, options);
    source.connect(filter);
    filter.connect(gain);
    this.route(gain, options, bus);

    // A random offset into the buffer, so repeated hits never phase into the
    // same sound the way one buffer played from the top every time would.
    source.start(when, Math.random() * 1.5);
    source.stop(when + options.duration + 0.05);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /** Attack up, exponential tail down. Every voice in the game wears one. */
  private envelope(when: number, options: { duration: number; gain: number; attack?: number }): GainNode {
    const ctx = this.ctx as AudioContext;
    const attack = Math.max(options.attack ?? 0.006, 0.001);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENT, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(options.gain, SILENT), when + attack);
    gain.gain.exponentialRampToValueAtTime(SILENT, when + options.duration);
    return gain;
  }

  /**
   * Wire a finished voice to its bus, through the drive curve and the pan if
   * it asked for them, and tap the reverb send.
   */
  private route(gain: GainNode, options: VoiceOptions, bus: GainNode): void {
    const ctx = this.ctx as AudioContext;
    let tail: AudioNode = gain;

    if (options.pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      const now = ctx.currentTime + (options.delay ?? 0);
      panner.pan.setValueAtTime(options.pan[0], now);
      panner.pan.linearRampToValueAtTime(options.pan[1], now + options.duration);
      tail.connect(panner);
      tail = panner;
    }

    if (options.drive && this.driveCurve) {
      // One shaper per voice. A shared node would have to live on a single
      // bus, and that is how the music's bass ended up on the sfx bus,
      // outside its own level and outside the duck.
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.driveCurve;
      shaper.oversample = "2x";
      tail.connect(shaper);
      tail = shaper;
    }
    tail.connect(bus);

    const send = options.send ?? 0;
    if (send > 0 && this.reverbSend) {
      const wet = ctx.createGain();
      wet.gain.value = send;
      tail.connect(wet);
      wet.connect(this.reverbSend);
    }
  }

  private busFor(options: VoiceOptions): GainNode | null {
    return options.bus ?? this.sfxBus;
  }
}

/** Arpeggio pattern, as indices into the scale. Eight steps to the bar. */
const ARP = [0, 2, 4, 2, 5, 4, 2, 1];

/** Two seconds of white noise, reused by every noise voice in the game. */
function buildNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * The reverb impulse: decaying noise, decorrelated across the two channels
 * so the tail is wide, with a gap at the front for pre-delay. Generated
 * rather than loaded, like everything else here.
 */
function buildImpulse(ctx: AudioContext): AudioBuffer {
  const cfg = AUDIO.reverb;
  const length = Math.floor(ctx.sampleRate * cfg.seconds);
  const silent = Math.floor(ctx.sampleRate * cfg.preDelay);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = silent; i < length; i += 1) {
      const t = (i - silent) / (length - silent);
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, cfg.decay);
    }
  }
  return buffer;
}

/**
 * Soft clip. Impacts pushed through this gain harmonics and stop sounding
 * like a clean synth voice, which is most of what "cheap" means in a game
 * that generates its own sound.
 */
function buildDriveCurve(): Float32Array {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const amount = 2.2;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

/**
 * `state` narrows to the non-running cases after an early return, so the
 * post-resume check needs the comparison widened back out.
 */
function isRunning(ctx: AudioContext): boolean {
  return (ctx.state as string) === "running";
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
