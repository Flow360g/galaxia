import { AUDIO } from "./Tuning";
import type { OutcomeKind, Question } from "./types";

/**
 * The sound of Galaxia. Every cue is synthesised at runtime through the Web
 * Audio API, so nothing is downloaded, nothing is decoded and no asset can
 * drift out of step with the visuals it belongs to.
 *
 * Four layers, three buses:
 *
 *   engine  a continuous drone plus a rushing-air noise bed, both tracking
 *           the same 0..1 visual speed ratio the FOV and the streaks use, so
 *           the ship sounds as fast as it looks
 *   music   a generative loop scheduled a beat ahead of the clock: bass,
 *           pad, arpeggio and hat over a four-bar minor progression, with
 *           tempo and brightness riding the speed ratio
 *   sfx     one-shots fired from the run hooks: plasma collected, rock
 *           threaded, burn banked, hull hit
 *   master  the one gain the mute toggle rides, faded rather than switched
 *
 * Nothing in here is load-bearing. Browsers block audio until a gesture,
 * some devices have no output at all and AudioContext can simply throw, so
 * every entry point is a no-op when the context is missing and the whole
 * class can be constructed and called on a machine that never makes a sound.
 */

/** Web Audio cannot ramp to zero on an exponential curve. This is silence. */
const SILENT = 0.0001;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private engineBus: GainNode | null = null;

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
   * gesture: the context simply starts suspended and `unlock` resumes it.
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

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? SILENT : AUDIO.master;
    this.master.connect(ctx.destination);

    this.musicBus = this.bus(AUDIO.musicBus);
    this.sfxBus = this.bus(AUDIO.sfxBus);
    this.engineBus = this.bus(AUDIO.engineBus);

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
    this.blip(cfg.hz, { duration: 0.07, gain: cfg.gain * (0.6 + 0.4 * urgency), type: "square" });
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
   * Lookahead scheduler: a timer this coarse cannot place a note accurately,
   * so it only queues the notes falling inside the next lookahead window and
   * the audio clock does the timing.
   */
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || !this.running) return;
    const cfg = AUDIO.music;

    while (this.nextStepTime < ctx.currentTime + cfg.lookahead) {
      const stepSeconds = 60 / lerp(cfg.bpm[0], cfg.bpm[1], this.intensity) / 2;
      this.playStep(this.step, this.nextStepTime, stepSeconds);
      this.nextStepTime += stepSeconds;
      this.step = (this.step + 1) % (cfg.steps * cfg.roots.length);
    }
  }

  private playStep(step: number, when: number, stepSeconds: number): void {
    const cfg = AUDIO.music;
    const bar = Math.floor(step / cfg.steps);
    const beat = step % cfg.steps;
    const root = cfg.roots[bar] ?? cfg.roots[0];
    const t = this.intensity;

    // Bass on the downbeat and the half bar: the pulse the run is flown to.
    if (beat === 0 || beat === 4) {
      this.tone(root, when, {
        duration: stepSeconds * 1.6,
        gain: cfg.bassGain,
        type: "triangle",
        attack: 0.01,
        filterHz: 320,
        bus: this.musicBus,
      });
    }

    // Pad: two detuned sines across the whole bar, holding the chord under
    // everything else so the loop never sounds like four separate blips.
    if (beat === 0) {
      const barSeconds = stepSeconds * cfg.steps;
      for (const detune of [-6, 6]) {
        this.tone(root * 2, when, {
          duration: barSeconds * 0.95,
          gain: cfg.padGain,
          type: "sine",
          attack: barSeconds * 0.25,
          detune,
          bus: this.musicBus,
        });
      }
    }

    // Arpeggio: the melody line, climbing the pentatonic and reaching an
    // octave higher the faster the ship is going.
    const degree = (ARP[beat % ARP.length] ?? 0) + (t > 0.55 && beat % 2 === 1 ? 5 : 0);
    const semitones =
      (cfg.scale[degree % cfg.scale.length] ?? 0) +
      12 * Math.floor(degree / cfg.scale.length);
    this.tone(root * 4 * Math.pow(2, semitones / 12), when, {
      duration: stepSeconds * 0.8,
      gain: lerp(cfg.arpGain[0], cfg.arpGain[1], t),
      type: "square",
      attack: 0.005,
      filterHz: lerp(1400, 4200, t),
      bus: this.musicBus,
    });

    // Hat: an offbeat noise tick. It is what makes the tempo readable at low
    // volume on a phone speaker.
    if (beat % 2 === 1) {
      this.noiseBurst(when, {
        duration: 0.045,
        gain: lerp(cfg.hatGain[0], cfg.hatGain[1], t),
        type: "highpass",
        from: 6000,
        to: 9000,
        bus: this.musicBus,
      });
    }
  }

  // ------------------------------------------------------------------- cues

  /** A new encounter is called: the rock announces itself. */
  encounter(question: Question): void {
    if (question.type === "anomaly") {
      // The anomaly is the odd one out on screen, so it is the odd one out
      // here too: a violet shimmer rather than the usual alert.
      this.tone(220, 0, { duration: 1.4, gain: 0.06, type: "sine", attack: 0.4, sweepTo: 330 });
      this.tone(330, 0, { duration: 1.4, gain: 0.05, type: "sine", attack: 0.5, detune: 8 });
      return;
    }
    const cluster = question.type === "cluster";
    this.tone(cluster ? 180 : 140, 0, {
      duration: 0.5,
      gain: 0.1,
      type: "sawtooth",
      attack: 0.02,
      filterHz: 700,
      sweepTo: cluster ? 240 : 96,
    });
  }

  /** A cluster lane is picked: the ship commits before the verdict lands. */
  pick(): void {
    this.blip(520, { duration: 0.06, gain: 0.12, type: "square" });
    this.blip(780, { duration: 0.09, gain: 0.07, type: "square", delay: 0.05 });
  }

  /** PLASMA collected. The pitch climbs with the charge in the reactor. */
  collect(charge: number): void {
    const step = Math.max(charge - 1, 0);
    const root = 660 * Math.pow(2, step / 6);
    // A major triad, arpeggiated upward: the pod reads as gained, not spent.
    for (const [i, semitones] of [0, 4, 7].entries()) {
      this.blip(root * Math.pow(2, semitones / 12), {
        duration: 0.13,
        gain: 0.13,
        type: "triangle",
        delay: i * 0.055,
      });
    }
    // A little shimmer on top, so a pod sounds picked up rather than played.
    this.noiseBurst(0, { duration: 0.22, gain: 0.05, type: "bandpass", from: 3200, to: 7200 });
    this.pulseEngine(0.3 + 0.2 * step);
  }

  /** The answer locked and the rock is making its run. */
  strike(): void {
    this.noiseBurst(0, { duration: 0.35, gain: 0.07, type: "bandpass", from: 180, to: 900 });
  }

  /** A NOVA scan fires. */
  nova(): void {
    for (let i = 0; i < 4; i += 1) {
      this.blip(880 * Math.pow(2, i / 4), {
        duration: 0.5,
        gain: 0.06,
        type: "sine",
        delay: i * 0.04,
      });
    }
  }

  /** Contact. One call covers every way an encounter can end. */
  contact(kind: OutcomeKind, charge = 0, full = false): void {
    switch (kind) {
      case "thread":
        this.whoosh(0.34, 0.1, 600, 2600);
        this.blip(520, { duration: 0.18, gain: 0.08, type: "sine", sweepTo: 880 });
        this.pulseEngine(0.4);
        break;

      case "slingshot":
        // The rock is skimmed, not avoided: a hard pass close enough to hear.
        this.whoosh(0.5, 0.17, 320, 3600);
        this.tone(180, 0, { duration: 0.7, gain: 0.16, type: "sawtooth", sweepTo: 720, filterHz: 1800 });
        this.tone(90, 0, { duration: 0.5, gain: 0.2, type: "sine", sweepTo: 220 });
        this.pulseEngine(0.9);
        break;

      case "burn": {
        // The reactor dumps. A full burn is the biggest moment in the run,
        // so it gets the long rise, the sub and a held chord on top.
        const scale = full ? 1 : 0.45 + 0.25 * charge;
        const seconds = full ? 1.5 : 0.7;
        this.tone(55, 0, { duration: seconds, gain: 0.26 * scale, type: "sine", sweepTo: 165 });
        this.tone(110, 0, {
          duration: seconds,
          gain: 0.16 * scale,
          type: "sawtooth",
          sweepTo: 660 * scale,
          filterHz: 2200,
        });
        this.whoosh(seconds, 0.2 * scale, 240, 5200);
        if (full) {
          for (const [i, semis] of [0, 7, 12, 19].entries()) {
            this.tone(220 * Math.pow(2, semis / 12), 0, {
              duration: 1.3,
              gain: 0.08,
              type: "triangle",
              attack: 0.06,
              delay: 0.18 + i * 0.07,
            });
          }
        }
        this.pulseEngine(full ? 1.4 : 0.6 * scale);
        break;
      }

      case "collision":
      case "wreck": {
        const hard = kind === "wreck";
        const gain = hard ? 0.42 : 0.3;
        // Crack: a bright transient at the moment of contact. The body below
        // is nearly all low end, which a phone speaker barely moves; this is
        // the part that actually reads as hitting something.
        this.noiseBurst(0, {
          duration: hard ? 0.14 : 0.09,
          gain: hard ? 0.36 : 0.26,
          type: "highpass",
          from: 1800,
          to: 3600,
        });
        // Body: a lowpassed noise slam with a sine drop under it.
        this.noiseBurst(0, {
          duration: hard ? 0.9 : 0.55,
          gain,
          type: "lowpass",
          from: 1400,
          to: 90,
        });
        this.tone(160, 0, {
          duration: hard ? 0.8 : 0.5,
          gain: gain * 0.9,
          type: "sine",
          sweepTo: 38,
        });
        // Hull: a detuned square ringing down, the metal in the hit.
        this.tone(hard ? 196 : 262, 0, {
          duration: hard ? 1.2 : 0.6,
          gain: 0.08,
          type: "square",
          sweepTo: hard ? 58 : 110,
          filterHz: 1200,
          detune: -18,
        });
        if (hard) {
          this.noiseBurst(0, {
            duration: 1.4,
            gain: 0.07,
            type: "bandpass",
            from: 2400,
            to: 400,
            delay: 0.12,
          });
        }
        break;
      }

      case "timeout":
        // Nothing hit it: the engines simply give out. Two falling tones.
        this.tone(330, 0, { duration: 0.34, gain: 0.12, type: "square", sweepTo: 262 });
        this.tone(196, 0, { duration: 0.7, gain: 0.12, type: "square", sweepTo: 98, delay: 0.22 });
        break;
    }
  }

  /** The run is over. A short cadence under the share card. */
  finish(): void {
    for (const [i, semis] of [0, 7, 12, 16].entries()) {
      this.tone(110 * Math.pow(2, semis / 12), 0, {
        duration: 2.2,
        gain: 0.1,
        type: "triangle",
        attack: 0.08,
        delay: i * 0.13,
      });
    }
  }

  // -------------------------------------------------------------- synthesis

  /** A pitched voice: oscillator, optional lowpass, exponential release. */
  private tone(
    frequency: number,
    at: number,
    options: {
      duration: number;
      gain: number;
      type?: OscillatorType;
      attack?: number;
      /** Glide to this frequency across the note. */
      sweepTo?: number;
      filterHz?: number;
      detune?: number;
      delay?: number;
      /** Defaults to the sfx bus; the music scheduler passes its own. */
      bus?: GainNode | null;
    },
  ): void {
    const ctx = this.ctx;
    const bus = options.bus ?? this.sfxBus;
    if (!ctx || !bus || this.muted) return;

    const when = (at || ctx.currentTime) + (options.delay ?? 0);
    const attack = options.attack ?? 0.008;
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

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENT, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(options.gain, SILENT), when + attack);
    gain.gain.exponentialRampToValueAtTime(SILENT, when + options.duration);

    let tail: AudioNode = osc;
    if (options.filterHz !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = options.filterHz;
      osc.connect(filter);
      tail = filter;
    }
    tail.connect(gain);
    gain.connect(bus);

    osc.start(when);
    osc.stop(when + options.duration + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** A short pitched hit. `tone` with the arcade defaults. */
  private blip(
    frequency: number,
    options: {
      duration: number;
      gain: number;
      type?: OscillatorType;
      delay?: number;
      sweepTo?: number;
    },
  ): void {
    this.tone(frequency, 0, { ...options, attack: 0.004 });
  }

  /** Filtered noise, the body of every impact and every rush of air. */
  private noiseBurst(
    at: number,
    options: {
      duration: number;
      gain: number;
      type: BiquadFilterType;
      from: number;
      to: number;
      delay?: number;
      bus?: GainNode | null;
    },
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || this.muted) return;
    const bus = options.bus ?? this.sfxBus;
    if (!bus) return;

    const when = (at || ctx.currentTime) + (options.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = options.type;
    filter.Q.value = options.type === "bandpass" ? 1.2 : 0.9;
    filter.frequency.setValueAtTime(Math.max(options.from, 20), when);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(options.to, 20),
      when + options.duration,
    );

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENT, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(options.gain, SILENT), when + 0.012);
    gain.gain.exponentialRampToValueAtTime(SILENT, when + options.duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

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

  /** The air a rock displaces as it goes past. */
  private whoosh(duration: number, gain: number, from: number, to: number): void {
    this.noiseBurst(0, { duration, gain, type: "bandpass", from, to });
    this.noiseBurst(0, {
      duration: duration * 1.3,
      gain: gain * 0.5,
      type: "lowpass",
      from: to,
      to: from,
      delay: duration * 0.35,
    });
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
