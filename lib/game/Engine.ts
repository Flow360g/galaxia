import * as THREE from "three";
import { Alien } from "./Alien";
import { AsteroidField } from "./AsteroidField";
import { AudioEngine } from "./Audio";
import { Backdrop } from "./Backdrop";
import { Beam } from "./Beam";
import { ChaseCamera } from "./Camera";
import { Debris } from "./Debris";
import { EncounterAsteroid } from "./EncounterAsteroid";
import { Incoming } from "./Incoming";
import { Landmark } from "./Landmark";
import { Run } from "./Run";
import { Salvage } from "./Salvage";
import { Shield } from "./Shield";
import { Ship } from "./Ship";
import { Starfield } from "./Starfield";
import { Station } from "./Station";
import { isMaxThrust } from "./Flight";
import {
  ALIEN,
  CLUSTER,
  COLOR,
  ENCOUNTER,
  FX,
  LANE,
  PERF,
  SHIP,
  STATION,
  VECTOR,
  WAYPOINT,
  WORLD,
} from "./Tuning";
import { QualityGovernor, detectTier, dprForTier, prefersReducedMotion } from "./quality";
import { DEFAULT_SHIP, type ShipSpec } from "./ships";
import type {
  DebugInfo,
  GameState,
  Outcome,
  QualityTier,
  Question,
  Round,
  RunSummary,
  WaypointState,
} from "./types";

export interface EngineOptions {
  /**
   * Element the engine mounts its canvas into. The engine creates and owns
   * the canvas itself rather than receiving one: `forceContextLoss()` on
   * teardown permanently poisons a canvas element, so a canvas supplied by
   * React would be dead on the second mount (which StrictMode guarantees).
   */
  container: HTMLElement;
  round: Round;
  /** Start muted. The player's last choice, read from storage by the shell. */
  muted?: boolean;
  /**
   * The hull to fly. The player's choice, read from storage by the shell like
   * `muted`. Cosmetic: it changes the mesh and its nozzles, nothing else.
   */
  ship?: ShipSpec;
  onState?: (state: GameState) => void;
  onDebug?: (info: DebugInfo) => void;
  onOutcome?: (outcome: Outcome, index: number) => void;
  onRunEnd?: (summary: RunSummary) => void;
}

/**
 * Owns the renderer, the scene graph, the frame loop and the lifecycle.
 *
 * The core model is a treadmill: the ship never travels on Z, the world is
 * translated past it at the Flight model's world speed. That keeps float
 * precision constant however far the player gets, makes geometry a fixed
 * recycled pool, and leaves distance as a plain scalar the run owns.
 *
 * The engine is the glue between the pure `Run` and everything that moves:
 * it veers the ship into the lane that was picked, launches the pod or the
 * boulder down it, and fires the burst or the impact on contact.
 */
export class Engine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly chase: ChaseCamera;
  private readonly ship: Ship;
  private readonly field: AsteroidField;
  private readonly stars: Starfield;
  private readonly rock: EncounterAsteroid;
  private readonly incoming: Incoming;
  private readonly alien: Alien;
  private readonly beam: Beam;
  private readonly returnBeam: Beam;
  private readonly landmark: Landmark;
  private readonly station: Station;
  private readonly salvage: Salvage;
  private readonly debris: Debris;
  private readonly shield: Shield;
  private readonly backdrop: Backdrop;
  private readonly governor: QualityGovernor;
  private readonly run: Run;
  private readonly audio: AudioEngine;

  private readonly clock = new THREE.Clock();
  private frameHandle: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private ended = false;
  /**
   * WHERE ON EARTH: the ship is aboard and the station screen owns the
   * display. The loop keeps ticking so the sound bed carries on under it,
   * but nothing is drawn: the flight is never seen again this run.
   */
  private parked = false;

  private readonly canvas: HTMLCanvasElement;
  private tier: QualityTier;
  private width = 1;
  private height = 1;

  /** Which side the ship swerves to for this encounter, alternating. */
  private side: 1 | -1 = 1;
  /** Extra streak intensity from a slingshot or a burn, decaying. */
  private streakSurge = 0;
  /** Seconds the surge holds before it decays. A MAXIMUM THRUST sets this. */
  private surgeHold = 0;
  /**
   * Seconds left of MAXIMUM THRUST. While it runs, the reactor's whole charge
   * is going through the engines: the plume is huge and violet and the rig
   * will not sit still.
   */
  private overdriveLeft = 0;
  /**
   * Horizontal screen fractions of the answer squares, measured by the HUD.
   * Lane i's world X is whatever projects to `laneFractions[i]`, so the ship
   * lands under the square that was tapped.
   */
  private laneFractions: number[] = [];
  /** This encounter is answered by tapping lanes, not by typing or aiming. */
  private laneEncounter = false;
  /** This encounter is a vector; the alien is the target. */
  private inVector = false;
  private vectorsFlown = 0;
  /**
   * Vectors in the whole round. The scout survives every hit but the last:
   * earlier ones knock it about, the final one breaks it up. Killing it on
   * the first would leave the second vector with nothing to shoot at.
   */
  private readonly vectorTotal: number;
  /** Field density, current and target, so the belt thins smoothly. */
  private density = 1;
  private densityTarget = 1;
  /** The waypoint in progress, and which of its beats have fired. */
  private waypoint: WaypointState | null = null;
  private waypointBeat = 0;
  private readonly scratchB = new THREE.Vector3();

  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private lastDebugEmit = 0;

  private readonly scratch = new THREE.Vector3();

  constructor(private readonly options: EngineOptions) {
    const reducedMotion = prefersReducedMotion();
    this.tier = detectTier();
    this.governor = new QualityGovernor(this.tier);

    this.canvas = document.createElement("canvas");
    this.canvas.dataset.galaxiaCanvas = "true";
    options.container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.tier === 0,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false,
      depth: true,
    });
    this.renderer.setClearColor(COLOR.space, 1);
    this.renderer.setPixelRatio(dprForTier(this.tier));

    this.scene.background = new THREE.Color(COLOR.space);
    this.scene.fog = new THREE.Fog(COLOR.space, WORLD.fogNear, WORLD.fogFar);

    this.chase = new ChaseCamera(1, reducedMotion);
    this.scene.add(this.chase.camera);

    this.backdrop = new Backdrop();
    this.chase.camera.add(this.backdrop.mesh);
    void this.backdrop.load();

    const key = new THREE.DirectionalLight(COLOR.white, 2.1);
    key.position.set(-6, 9, 4);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(COLOR.white, COLOR.accent, 0.85));

    const random = createRandom(options.round.seed);

    this.ship = new Ship(reducedMotion, this.tier, random, options.ship ?? DEFAULT_SHIP);
    this.scene.add(this.ship.group);
    void this.ship.loadModel();

    this.shield = new Shield();
    this.ship.group.add(this.shield.mesh);

    this.stars = new Starfield(this.tier, random);
    this.scene.add(this.stars.group);

    this.field = new AsteroidField(this.tier, random);
    this.scene.add(this.field.mesh);

    this.rock = new EncounterAsteroid(random);
    this.scene.add(this.rock.group);

    this.incoming = new Incoming(random);
    this.scene.add(this.incoming.group);

    this.alien = new Alien(random);
    this.scene.add(this.alien.group);
    this.vectorTotal = options.round.questions.filter((q) => q.type === "vector").length;

    this.beam = new Beam(0.35);
    this.returnBeam = new Beam(0.5);
    this.scene.add(this.beam.group, this.returnBeam.group);

    this.landmark = new Landmark();
    this.chase.camera.add(this.landmark.group);

    // Fetched now so the bytes are in by the last encounter; see Station.
    this.station = new Station();
    this.chase.camera.add(this.station.group);
    void this.station.load();

    this.salvage = new Salvage();
    this.scene.add(this.salvage.mesh);

    this.debris = new Debris(this.tier, random);
    this.scene.add(this.debris.mesh);

    // Sound is built now but stays silent until `start()`, and silent after
    // that until the browser hands the context a gesture to unlock on.
    this.audio = new AudioEngine(options.muted ?? false);
    this.audio.init();
    // Under ?debug=1 the cues are reachable from the console, which is the
    // only practical way to audition one without playing to it.
    if (options.onDebug) {
      (window as Window & { galaxiaAudio?: AudioEngine }).galaxiaAudio = this.audio;
    }

    this.run = new Run(
      options.round,
      {
        onCountdown: (step) => this.audio.countdown(step),
        onEncounterStart: (index, question) => this.onEncounterStart(index, question),
        onPick: (lane, correct) => this.onPick(lane, correct),
        onCollect: (lane, charge) => this.onCollect(lane, charge),
        onAim: (t) => this.onAim(t),
        onVectorLock: (outcome, truthT) => this.onVectorLock(outcome, truthT),
        onWaypoint: (info) => this.onWaypoint(info),
        onLock: (index, outcome) => this.onLock(outcome),
        onContact: (index, outcome) => this.onContact(index, outcome),
        onFinished: () => this.endRun(),
        onDock: () => this.onDock(),
      },
      random,
    );

    this.observeResize();
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    if (this.frameHandle !== null || this.disposed) return;
    this.clock.start();
    this.audio.setRunning(true);
    this.audio.setMood("cruise");
    this.loop();
  }

  stop(): void {
    if (this.frameHandle === null) return;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.clock.stop();
    this.audio.setRunning(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    this.ship.dispose();
    this.shield.dispose();
    this.field.dispose();
    this.stars.dispose();
    this.backdrop.dispose();
    this.rock.dispose();
    this.incoming.dispose();
    this.alien.dispose();
    this.beam.dispose();
    this.returnBeam.dispose();
    this.landmark.dispose();
    this.station.dispose();
    this.salvage.dispose();
    this.debris.dispose();
    this.audio.dispose();

    this.scene.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose?.();
    });
    this.scene.clear();

    // Explicitly drop the WebGL context, then remove the canvas. Without the
    // release, each mount leaks a context and Chrome kills the page after
    // about sixteen; without removing the canvas, the poisoned element would
    // linger in the DOM.
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ------------------------------------------------------------- player input

  answer(option: number): void {
    this.run.answer(option);
  }

  toggleBoost(): void {
    this.run.toggleBoost();
  }

  /** Cluster: pick a lane. */
  pick(lane: number): void {
    this.run.pick(lane);
  }

  /**
   * The HUD reports where its answer squares actually sit, as fractions of
   * viewport width. Called on mount, on resize and whenever the question
   * changes; the engine never guesses the layout.
   */
  setLaneFractions(fractions: number[]): void {
    this.laneFractions = fractions;
  }

  /** Cluster: bank the reactor charge. */
  burn(): void {
    this.run.burn();
  }

  /** Vector: move the aim, 0..1 across the slider. */
  aim(t: number): void {
    this.run.aim(t);
  }

  /** Vector: fire on the current aim. */
  lockVector(): void {
    this.run.lockVector();
  }

  /** The player tapped to move past a verdict or a waypoint card. */
  confirm(): void {
    this.run.confirm();
  }

  useNova(): void {
    if (this.run.canNova) this.audio.nova();
    this.run.useNova();
  }

  /** Mute or unmute everything. The engine owns the sound, the shell the UI. */
  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  /**
   * WHERE ON EARTH: ENTER SPACE STATION. The station screen takes the
   * display, and the flight parks under it for the rest of the run.
   */
  enterStation(): void {
    this.run.enterStation();
    if (this.run.phase !== "docked") return;
    // React mounts the station screen off this frame's state, so it goes out
    // now rather than waiting on a loop that is about to stop drawing.
    this.options.onState?.(this.state);
    this.parked = true;
  }

  /** WHERE ON EARTH: END TRANSMISSION. Resolves the encounter and ends the run. */
  endTransmission(): void {
    this.run.endTransmission();
  }

  get state(): GameState {
    const state = this.run.state;
    state.running = this.frameHandle !== null;
    return state;
  }

  // ---------------------------------------------------------------- run hooks

  private onEncounterStart(index: number, question: Question): void {
    this.side = index % 2 === 0 ? 1 : -1;
    this.laneEncounter = question.type === "mcq" || question.type === "cluster";
    const wasVector = this.inVector;
    this.inVector = question.type === "vector";
    this.waypoint = null;
    // A lane question opens on an empty sky: the ambient field and nothing
    // else. A vector opens on the cloaked alien.
    if (this.inVector) {
      const slot = Math.min(this.vectorsFlown, VECTOR.holdFar.length - 1);
      this.vectorsFlown += 1;
      this.alien.station(VECTOR.holdFar[slot]!);
    }
    // Leaving the alien stage: the scout leaves and the landmark sinks away.
    if (wasVector && !this.inVector) {
      this.alien.warpOut();
      this.landmark.pass();
      this.audio.setMood("cruise");
      this.densityTarget = 1;
    }
    // WHERE ON EARTH opens on the station coming up out of the distance, and
    // the belt thins to nothing: a station does not sit in a rock field.
    if (question.type === "earth") {
      this.station.approach();
      this.densityTarget = STATION.fieldDensity;
    }
    this.incoming.retire();
    this.chase.releaseLane();
    this.ship.recentre();
    this.audio.encounter(question);
  }

  /** Slider position to world X: the same projection the answer squares use. */
  private aimWorldX(t: number): number {
    return this.chase.laneX(0.5 + (t - 0.5) * LANE.reach);
  }

  /**
   * The aim moved. The ship slides to it and that is the only tell: nothing
   * is drawn out of the nose until the shot is taken, so the sky gives away
   * neither the aim nor the answer.
   */
  private onAim(t: number): void {
    this.chase.lockLane(LANE.lockSeconds);
    this.ship.holdLane(this.aimWorldX(t));
  }

  /**
   * The player locked. The scout slides to the truth either way -- that IS
   * the answer being shown -- but the gun only goes off if the aim was good
   * enough to take the shot.
   *
   * A wrong answer fires nothing. The ship sits there with the scout lined
   * up on it and the silence is the tell; `onVectorContact` has the alien
   * fire back a beat later.
   */
  private onVectorLock(outcome: Outcome, truthT: number): void {
    const truthX = this.aimWorldX(truthT);
    this.alien.reveal(truthX);

    if (!outcome.correct) {
      // The scout winding up to fire: a swell under the beat of nothing
      // happening, so the return fire is heard coming.
      this.audio.strike();
      return;
    }

    // On target, and the whole shot lands in one instant: the crack, the
    // recoil through the rig and a bolt across the gap in a tenth of a
    // second. The debris pool is left alone here on purpose -- it is one
    // shared pool, and it is owed to the explosion that lands next frame.
    this.audio.laser();
    this.scratch.set(this.ship.group.position.x, this.ship.group.position.y, SHIP.noseZ);
    this.alien.target(this.scratchB);
    this.scratchB.x = truthX;
    this.beam.fire(this.scratch, this.scratchB, COLOR.cyan, VECTOR.beamSeconds, 1);
    this.chase.shake(FX.vector.fireShake);
    this.chase.burst(0, FX.vector.fireKick);
    this.ship.pulseExhaust(FX.exhaustPulse.thread);
  }

  private onWaypoint(info: WaypointState): void {
    this.waypoint = info;
    this.waypointBeat = 0;
    this.densityTarget = WAYPOINT.fieldDensity;
    const stage = this.options.round.stages?.find((s) => s.name === info.stage);
    this.landmark.approach(stage?.landmark ?? "moon", 1);
    this.incoming.retire();
    this.chase.releaseLane();
    this.ship.recentre();
  }

  private onPick(lane: number, correct: boolean): void {
    const x = this.worldXForLane(lane);
    this.ship.holdLane(x);
    this.chase.lockLane(LANE.lockSeconds);
    this.incoming.launch(correct ? "pod" : "rock", x, LANE.runSeconds);
  }

  private onCollect(lane: number, charge: number): void {
    this.incoming.collect();
    this.audio.collect(charge);
    this.shield.flash(FX.collect.shieldFlash, COLOR.cyan);
    this.ship.pulseExhaust(FX.collect.exhaustPulse + FX.collect.exhaustPulsePerCharge * charge);
    this.chase.shake(FX.collect.shake);
    // Back to the centreline for the next decision.
    this.chase.releaseLane();
    this.ship.recentre();
  }

  /**
   * World X for a lane, from the square the HUD drew. Falls back to an even
   * spread across the corridor if the HUD has not measured yet.
   */
  private worldXForLane(lane: number): number {
    const count = Math.max(this.laneFractions.length, CLUSTER.laneCount);
    const fraction = this.laneFractions[lane] ?? (lane + 0.5) / count;
    // Stop a little short of the square so the hull never hangs off the side.
    return this.chase.laneX(0.5 + (fraction - 0.5) * LANE.reach);
  }

  private onLock(outcome: Outcome): void {
    if (this.inVector) {
      // The beam is already in flight from onVectorLock. A timeout has no
      // beam: the alien simply fires first.
      if (outcome.timedOut) {
        this.audio.strike();
        this.alien.reveal(this.alien.group.position.x);
      }
      return;
    }
    this.audio.strike();
    if (this.laneEncounter) {
      if (outcome.correct) {
        // The lane was clean and the pod is already collected. Let the rig go
        // and fly the burst out.
        this.chase.releaseLane();
        this.ship.manoeuvre(outcome.kind, this.side);
      } else {
        // The boulder in the picked lane makes its final run. A timeout never
        // picked a lane, so there is nothing to hit.
        this.incoming.strike(ENCOUNTER.strikeSeconds);
      }
      return;
    }
    this.rock.strike(ENCOUNTER.strikeSeconds, outcome.correct);
    this.ship.manoeuvre(outcome.kind, this.side);
  }

  private onContact(index: number, outcome: Outcome): void {
    const kind = outcome.kind;
    this.chase.shake(FX.shake[kind]);

    if (this.inVector) {
      this.audio.contact(kind);
      this.onVectorContact(outcome);
      this.options.onOutcome?.(outcome, index);
      return;
    }

    if (kind === "burn") {
      const full = isMaxThrust(outcome);
      this.audio.contact(kind, outcome.charge ?? 0, full);
      if (full) {
        this.chase.burst(FX.warp.pullback, FX.warp.fovKick);
        this.chase.shake(FX.warp.shake);
        this.chase.rumble(
          FX.overdrive.seconds,
          FX.overdrive.rumble,
          FX.overdrive.rumbleRoll,
        );
        this.overdriveLeft = FX.overdrive.seconds;
        this.streakSurge = FX.warp.streakSurge;
        this.surgeHold = FX.warp.holdSeconds;
        this.shield.flash(1, COLOR.plasma);
      } else {
        const charge = outcome.charge ?? 1;
        const scale = charge >= 2 ? 1 : 0.6;
        this.chase.burst(FX.pullback.burn * scale, FX.fovKick.burn * scale);
        this.streakSurge = FX.streakSurge * scale;
        if (charge >= 2) this.shield.flash(0.8, COLOR.boost);
      }
      this.ship.pulseExhaust(FX.exhaustPulse.burn);
    } else if (outcome.correct) {
      this.audio.contact(kind);
      if (!this.laneEncounter) this.rock.contact(false);
      const burst = kind === "slingshot" ? "slingshot" : "thread";
      this.chase.burst(FX.pullback[burst], FX.fovKick[burst]);
      this.ship.pulseExhaust(FX.exhaustPulse[burst]);
      if (kind === "slingshot") {
        this.shield.flash(0.8, COLOR.boost);
        this.streakSurge = FX.streakSurge;
      }
    } else {
      this.audio.contact(kind);
      const strength = kind === "wreck" ? 1.6 : 1;
      if (this.laneEncounter) {
        if (outcome.chosen !== null) {
          this.incoming.position(this.scratch);
          this.incoming.shatter();
          this.debris.burst(this.scratch, strength, COLOR.panelLabel);
        }
        this.chase.releaseLane();
      } else {
        this.rock.contact(true);
        this.scratch.copy(this.rock.group.position);
        this.debris.burst(this.scratch, strength, COLOR.panelLabel);
      }
      this.shield.flash(kind === "wreck" ? 1.4 : 1);
      this.ship.impact(kind, this.side);
    }

    this.options.onOutcome?.(outcome, index);
  }

  private onVectorContact(outcome: Outcome): void {
    const kind = outcome.kind;
    this.alien.target(this.scratchB);
    if (outcome.correct) {
      // Anything on target hits the hull. On the last vector of the run that
      // hit is the kill; before it the scout is knocked about and stays up.
      const kill = this.vectorsFlown >= this.vectorTotal;
      const heavy = kind === "slingshot";
      const burst = heavy ? "slingshot" : "thread";
      this.alien.hit(kill ? "direct" : "glance");
      // The bolt arrives and the scout goes up in the same instant: the hull
      // comes apart and a blast lands out there with it.
      this.audio.blast(kill ? 1 : heavy ? 0.8 : 0.55);
      this.debris.burst(this.scratchB, kill ? 1.8 : heavy ? 1.0 : 0.5, COLOR.contact);
      this.chase.burst(FX.pullback[burst], FX.fovKick[burst]);
      this.chase.shake(kill || heavy ? FX.vector.directShake : FX.vector.glanceShake);
      this.ship.pulseExhaust(FX.exhaustPulse[burst]);
      if (heavy) this.streakSurge = FX.streakSurge;
      if (outcome.salvage) {
        this.scratch.copy(this.ship.group.position);
        this.salvage.launch(this.scratchB, this.scratch);
      }
    } else {
      // Miss or timeout: our guns never went off, and the scout has spent the
      // beat since the lock lining up. Now it fires, and the hull wears it.
      this.alien.returnFire();
      this.audio.laser(ALIEN.gunPitch);
      this.scratch.set(this.ship.group.position.x, this.ship.group.position.y, SHIP.noseZ);
      this.returnBeam.fire(this.scratchB, this.scratch, COLOR.neg, ALIEN.returnFireSeconds, 1);
      this.chase.shake(FX.vector.returnFireShake);
      this.shield.flash(kind === "wreck" ? 1.4 : 1, COLOR.neg);
      this.ship.impact(kind, this.side);
    }
    this.chase.releaseLane();
  }

  /** Aboard. The station screen is up; the airlock is the one thing the scene adds. */
  private onDock(): void {
    this.audio.dock();
  }

  private endRun(): void {
    if (this.ended) return;
    this.ended = true;
    this.audio.finish();
    this.options.onRunEnd?.(this.run.summary());
    // Keep flying under the share card: the ship coasting on is the story's
    // last frame. State updates stop mattering, the loop just renders.
  }

  // ------------------------------------------------------------------ resize

  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.options.container);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.resize();
  }

  private resize(): void {
    const container = this.options.container;
    const width = Math.max(container.clientWidth || window.innerWidth, 1);
    const height = Math.max(container.clientHeight || window.innerHeight, 1);

    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.chase.setAspect(width / height);
    this.backdrop.setAspect(width / height);
  }

  private onVisibilityChange = (): void => {
    // Pause when backgrounded: rAF is throttled anyway, and resuming from a
    // stale clock would otherwise jump the world forward.
    if (document.hidden) this.stop();
    else if (!this.disposed) this.start();
  };

  // -------------------------------------------------------------- frame loop

  private loop = (): void => {
    this.frameHandle = requestAnimationFrame(this.loop);

    // Clamp: a backgrounded tab can hand back a multi-second delta, which
    // would teleport the world and tunnel every asteroid through the ship.
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, PERF.maxDelta);

    if (this.parked) {
      // Aboard the station: the bed idles on at a standstill, and that is all.
      this.audio.update(dt, 0, 1, false);
      return;
    }

    this.update(dt);
    this.renderer.render(this.scene, this.chase.camera);
    this.emitDebug(raw);
  };

  private update(dt: number): void {
    if (!this.ended) this.run.update(dt);
    else this.run.flight.update(dt);

    const flight = this.run.flight;
    const speed = flight.worldSpeed;
    const ratio = flight.visualRatio;

    if (this.surgeHold > 0) this.surgeHold -= dt;
    else this.streakSurge *= Math.exp(-FX.pullbackDecay * dt);

    // MAXIMUM THRUST: hold the plume at full, then ease it back down on the
    // same curve the camera rumble uses, so flame and shake end together.
    if (this.overdriveLeft > 0) this.overdriveLeft = Math.max(this.overdriveLeft - dt, 0);
    this.ship.setOverdrive(overdriveLevel(this.overdriveLeft));

    const phase = this.run.phase;
    const open = phase === "approach" || phase === "collecting";

    // Waypoint beats: the rating stamp shakes the camera; the alien warps in
    // as the "entering" line lands.
    if (phase === "waypoint" && this.waypoint) {
      const t = this.waypoint.t;
      if (this.waypointBeat < 1 && t >= WAYPOINT.ratingAt) {
        this.waypointBeat = 1;
        this.chase.shake(FX.waypoint.ratingShake);
      }
      if (this.waypointBeat < 2 && t >= WAYPOINT.enteringAt) {
        this.waypointBeat = 2;
        // The scout only comes for the scout's stage. A round whose next
        // stage is lanes, or the station, keeps its sky and its music.
        if (this.waypoint.nextType === "vector") {
          this.alien.warpIn(VECTOR.holdFar[0]!);
          this.shield.flash(FX.waypoint.warpFlash, COLOR.contact);
          this.chase.shake(0.4);
          // The bed turns on the same beat the scout arrives, and the arrival
          // itself covers the key change.
          this.audio.alienArrival();
          this.audio.setMood("dread");
        }
      }
    }

    // WHERE ON EARTH: the station coming alongside is what arms the door.
    if (this.station.update(dt)) this.run.arriveAtStation();

    this.density += (this.densityTarget - this.density) * (1 - Math.exp(-1.2 * dt));
    this.field.setDensity(this.density);
    this.alien.update(dt);
    this.beam.update(dt);
    this.returnBeam.update(dt);
    this.landmark.update(dt);
    if (this.salvage.update(dt)) this.shield.flash(0.9, COLOR.cyan);

    this.audio.update(dt, ratio, this.run.thrust, open);
    this.ship.update(dt, ratio, open ? this.run.thrust : 1);
    this.shield.update(dt);
    this.chase.update(dt, this.ship, ratio);
    this.stars.update(dt, speed, streakIntensity(ratio) + this.streakSurge);
    this.field.update(dt, speed);
    this.rock.update(dt, speed);
    this.incoming.update(dt, speed);
    this.debris.update(dt, speed);
    this.backdrop.update(this.ship.group.position.x, this.ship.group.position.y);

    if (!this.ended) this.options.onState?.(this.state);
  }

  private emitDebug(rawDelta: number): void {
    if (!this.options.onDebug) return;

    const frameMs = rawDelta * 1000;
    this.fpsAccumulator += frameMs;
    this.fpsFrames += 1;

    const downgraded = this.governor.sample(frameMs);
    if (downgraded !== null) this.applyTier(downgraded);

    this.lastDebugEmit += frameMs;
    if (this.lastDebugEmit < 250) return;

    const averageMs = this.fpsAccumulator / Math.max(this.fpsFrames, 1);
    this.options.onDebug({
      fps: averageMs > 0 ? 1000 / averageMs : 0,
      frameMs: averageMs,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      tier: this.tier,
      dpr: this.renderer.getPixelRatio(),
    });

    this.fpsAccumulator = 0;
    this.fpsFrames = 0;
    this.lastDebugEmit = 0;
  }

  private applyTier(tier: QualityTier): void {
    this.tier = tier;
    this.renderer.setPixelRatio(dprForTier(tier));
    this.resize();
  }
}

/**
 * MAXIMUM THRUST intensity from the seconds left on it: full through the
 * hold, then eased to nothing. Matches `ChaseCamera.rumbleLevel` so the plume
 * and the shake die together.
 */
function overdriveLevel(secondsLeft: number): number {
  if (secondsLeft <= 0) return 0;
  const left = secondsLeft / FX.overdrive.seconds;
  const tail = FX.overdrive.hold;
  return left >= 1 - tail ? 1 : left / (1 - tail);
}

/** Streaks start showing a little way above cruise and saturate near the top. */
function streakIntensity(ratio: number): number {
  const t = (ratio - 0.15) / 0.7;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Deterministic PRNG (mulberry32), seeded from the round.
 *
 * Every player on a given day must get an identical field and identical NOVA
 * scans, or comparing results is meaningless and the share loop falls apart.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
