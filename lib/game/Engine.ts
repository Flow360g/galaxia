import * as THREE from "three";
import { Alien } from "./Alien";
import { AsteroidField } from "./AsteroidField";
import { AudioEngine } from "./Audio";
import { Backdrop } from "./Backdrop";
import { Beam } from "./Beam";
import { ChaseCamera } from "./Camera";
import { Comets } from "./Comets";
import { Debris } from "./Debris";
import { Dust } from "./Dust";
import { Explosion } from "./Explosion";
import { FlyBy } from "./FlyBy";
import { Hyperspace } from "./Hyperspace";
import { EncounterAsteroid } from "./EncounterAsteroid";
import { Incoming } from "./Incoming";
import { Landmark } from "./Landmark";
import { Post } from "./Post";
import { Run } from "./Run";
import { finaleTier } from "./Score";
import { Salvage } from "./Salvage";
import { Shield } from "./Shield";
import { Shockwave } from "./Shockwave";
import { Ship } from "./Ship";
import { Starfield } from "./Starfield";
import { Station } from "./Station";
import { Trails } from "./Trails";
import { isMaxThrust } from "./Flight";
import {
  ALIEN,
  BLOOM,
  CAMERA,
  CLUSTER,
  COLOR,
  ENCOUNTER,
  FX,
  HYPER,
  LANE,
  LIGHT,
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
  TallyCue,
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
  /**
   * Pin the quality tier instead of detecting it, and never step it down.
   * The `?tier=` QA hatch, honoured only under `?debug=1`: headless Chromium
   * detects as a low-tier phone, and bloom cannot be looked at otherwise.
   */
  tier?: QualityTier;
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
  private readonly shockwave: Shockwave;
  private readonly comets: Comets;
  private readonly dust: Dust;
  private readonly explosion: Explosion;
  private readonly hyper: Hyperspace;
  private readonly trails: Trails;
  private readonly flyby: FlyBy;
  /** Bloom, on the tiers that can afford it. Null when off. */
  private post: Post | null = null;
  private readonly reducedMotion: boolean;
  private readonly tierPinned: boolean;
  /**
   * The visual clock's rate. Hit-stop and bullet time slow what is drawn and
   * nothing else: the run steps on real time, so the answer clock, the score
   * and the distance never feel them, and neither does the sound.
   */
  private timeScale = 1;
  private stopLeft = 0;
  private slowLeft = 0;
  private slowScale = 1;
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
    this.reducedMotion = reducedMotion;
    this.tierPinned = options.tier !== undefined;
    this.tier = options.tier ?? detectTier();
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
    const rim = new THREE.DirectionalLight(LIGHT.rimColor, LIGHT.rimIntensity);
    rim.position.set(...LIGHT.rimPosition);
    this.scene.add(rim);

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

    this.shockwave = new Shockwave(reducedMotion);
    this.scene.add(this.shockwave.group);

    // The sky's set dressing draws from a stream of its own, so adding it did
    // not reshuffle the field or the scans that every player shares.
    const skyRandom = createRandom(options.round.seed ^ 0x5bd1e995);
    this.comets = new Comets(this.tier, reducedMotion, skyRandom);
    this.scene.add(this.comets.group);
    this.dust = new Dust(this.tier, reducedMotion, skyRandom);
    if (this.dust.points) this.scene.add(this.dust.points);
    this.flyby = new FlyBy(this.tier, skyRandom);
    this.scene.add(this.flyby.group);

    // The blast light is in the scene from the first frame at zero, so the
    // lit materials are compiled with it and nothing hitches when it fires.
    this.explosion = new Explosion(this.tier, skyRandom);
    this.scene.add(this.explosion.points, this.explosion.light);
    this.hyper = new Hyperspace(this.tier, reducedMotion, skyRandom);
    this.chase.camera.add(this.hyper.group);
    this.trails = new Trails(this.tier);
    this.scene.add(this.trails.group);
    this.buildPost();

    // Sound is built now but stays silent until `start()`, and silent after
    // that until the browser hands the context a gesture to unlock on.
    this.audio = new AudioEngine(options.muted ?? false);
    this.audio.init();
    // Under ?debug=1 the cues are reachable from the console, which is the
    // only practical way to audition one without playing to it.
    if (options.onDebug) {
      (window as Window & { galaxiaAudio?: AudioEngine }).galaxiaAudio = this.audio;
      // And the sky, so a test can hold the comets to the rule that nothing
      // crosses it while a question is up.
      (window as Window & { galaxiaSky?: { comets(): number } }).galaxiaSky = {
        comets: () => this.comets.flying,
      };
    }

    this.run = new Run(
      options.round,
      {
        onCountdown: (step) => this.audio.countdown(step),
        onEncounterStart: (index, question) => this.onEncounterStart(index, question),
        onPick: (lane, correct) => this.onPick(lane, correct),
        onCollect: (lane, charge) => this.onCollect(lane, charge),
        onShieldStrike: () => this.onShieldStrike(),
        onShieldHit: () => this.onShieldHit(),
        onAim: (t) => this.onAim(t),
        onVectorLock: (outcome, truthT) => this.onVectorLock(outcome, truthT),
        onWaypoint: (info) => this.onWaypoint(info),
        onLock: (index, outcome) => this.onLock(outcome),
        onContact: (index, outcome) => this.onContact(index, outcome),
        onFinished: () => this.endRun(),
        onDock: () => this.onDock(),
        onSiteCalled: (index, outcome) => this.onSiteCalled(index, outcome),
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
    this.shockwave.dispose();
    this.comets.dispose();
    this.dust.dispose();
    this.explosion.dispose();
    this.hyper.dispose();
    this.trails.dispose();
    this.flyby.dispose();
    this.post?.dispose();
    this.post = null;
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

  /** Cluster: the question is read, open the lanes. */
  ready(): void {
    this.run.ready();
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

  /**
   * WHERE ON EARTH. The engine is parked while docked, so each of these pushes
   * a state frame itself rather than waiting on a loop that is not drawing.
   */
  feedArrived(): void {
    this.run.feedArrived();
    this.options.onState?.(this.state);
  }

  buyIntel(): void {
    this.run.buyIntel();
    this.options.onState?.(this.state);
  }

  setOptics(step: number): void {
    this.run.setOptics(step);
    this.options.onState?.(this.state);
  }

  submitSite(text: string): void {
    this.run.submitSite(text);
    this.options.onState?.(this.state);
  }

  nextSite(): void {
    this.run.nextSite();
    this.options.onState?.(this.state);
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

    if (!outcome.correct && outcome.kind !== "graze") {
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

  /** The cluster's shield is up: the boulder makes its final run anyway. */
  private onShieldStrike(): void {
    this.audio.strike();
    this.incoming.strike(ENCOUNTER.strikeSeconds);
  }

  /**
   * The boulder breaks on the shield. Everything a collision shows, at
   * collision weight, and then the ship comes back to the centreline for the
   * next pick: the flight model never heard about it.
   */
  private onShieldHit(): void {
    this.audio.contact("collision");
    this.chase.shake(FX.shake.collision);
    this.incoming.position(this.scratch);
    this.incoming.shatter();
    this.debris.burst(this.scratch, 1, COLOR.panelLabel);
    this.shockwave.burst(this.scratch, COLOR.neg, FX.shockwave.boulder);
    this.explosion.blast(this.scratch, FX.explosion.boulder);
    this.hitStop(FX.time.boulderStop);
    this.shield.flash(1);
    this.ship.impact("collision", this.side);
    this.chase.releaseLane();
    this.ship.recentre();
  }

  private onCollect(lane: number, charge: number): void {
    this.incoming.collect();
    this.shockwave.burst(this.ship.group.position, COLOR.cyan, FX.shockwave.collect);
    this.trails.pulse(0.6);
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
        // The jump: a held breath of bullet time, then real time lands all
        // at once with the tunnel wide open and the hull shaking itself apart.
        this.slowMo(FX.time.maxThrustScale, FX.time.maxThrustSeconds);
        this.hyper.burn(1, FX.warp.holdSeconds, 1);
        this.ship.shudder(FX.boost.shudder[2]!, FX.overdrive.seconds);
        this.trails.pulse(1.4);
      } else {
        const charge = outcome.charge ?? 1;
        const scale = charge >= 2 ? 1 : 0.6;
        const step = charge >= 2 ? 1 : 0;
        this.chase.burst(FX.pullback.burn * scale, FX.fovKick.burn * scale);
        this.streakSurge = FX.streakSurge * scale;
        if (charge >= 2) this.shield.flash(0.8, COLOR.boost);
        // Every boost is violent, and more plasma is more violent.
        this.chase.rumble(FX.boost.seconds[step]!, FX.boost.rumble[step]!, FX.boost.roll[step]!);
        this.ship.shudder(FX.boost.shudder[step]!, FX.boost.seconds[step]!);
        this.hyper.burn(HYPER.burn[step]!, HYPER.hold, 0);
        this.trails.pulse(0.8 + 0.4 * step);
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
        // A boosted answer is a boost: the shake and the tunnel come with it.
        this.chase.rumble(FX.boost.seconds[0]!, FX.boost.rumble[0]!, FX.boost.roll[0]!);
        this.ship.shudder(FX.boost.shudder[0]!, FX.boost.seconds[0]!);
        this.hyper.burn(HYPER.burn[0]!, HYPER.hold, 0);
        this.trails.pulse(0.8);
      }
    } else {
      this.audio.contact(kind);
      const strength = kind === "wreck" ? 1.6 : 1;
      if (this.laneEncounter) {
        if (outcome.chosen !== null) {
          this.incoming.position(this.scratch);
          this.incoming.shatter();
          this.debris.burst(this.scratch, strength, COLOR.panelLabel);
          this.shockwave.burst(
            this.scratch,
            COLOR.neg,
            kind === "wreck" ? FX.shockwave.wreck : FX.shockwave.boulder,
          );
          this.explosion.blast(
            this.scratch,
            kind === "wreck" ? FX.explosion.wreck : FX.explosion.boulder,
          );
          this.hitStop(kind === "wreck" ? FX.time.wreckStop : FX.time.boulderStop);
        }
        this.chase.releaseLane();
      } else {
        this.rock.contact(true);
        this.scratch.copy(this.rock.group.position);
        this.debris.burst(this.scratch, strength, COLOR.panelLabel);
        this.shockwave.burst(
          this.scratch,
          COLOR.neg,
          kind === "wreck" ? FX.shockwave.wreck : FX.shockwave.boulder,
        );
        this.explosion.blast(
          this.scratch,
          kind === "wreck" ? FX.explosion.wreck : FX.explosion.boulder,
        );
        this.hitStop(kind === "wreck" ? FX.time.wreckStop : FX.time.boulderStop);
      }
      this.shield.flash(kind === "wreck" ? 1.4 : 1);
      this.ship.impact(kind, this.side);
    }

    this.options.onOutcome?.(outcome, index);
  }

  private onVectorContact(outcome: Outcome): void {
    const kind = outcome.kind;
    this.alien.target(this.scratchB);
    if (kind === "graze") {
      // The bolt clips the scout and it is knocked about, nothing more. No
      // blast, no burst, no shield: the ship neither gained nor wore anything.
      this.alien.hit("glance");
      this.debris.burst(this.scratchB, 0.3, COLOR.contact);
      this.explosion.blast(this.scratchB, FX.explosion.alienGlance * 0.6, "contact");
      this.chase.shake(FX.vector.glanceShake);
    } else if (outcome.correct) {
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
      this.shockwave.burst(
        this.scratchB,
        COLOR.contact,
        kill ? FX.shockwave.alienKill : FX.shockwave.alienHit,
      );
      if (kill) {
        // The scout comes apart in stages, in bullet time: the core goes up,
        // then the hull cooks off across its length.
        const E = FX.explosion;
        this.explosion.blast(this.scratchB, E.alienKill, "fire");
        this.explosion.chain(
          this.scratchB,
          E.chain,
          E.chainGap,
          ALIEN.modelLength * E.chainSpread,
          E.chainStrength,
          "contact",
        );
        this.slowMo(FX.time.killScale, FX.time.killSeconds);
      } else {
        this.explosion.blast(this.scratchB, FX.explosion.alienGlance, "contact");
        this.hitStop(FX.time.glanceStop);
      }
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
      this.shockwave.burst(this.scratch, COLOR.neg, FX.shockwave.returnFire);
      this.explosion.blast(this.scratch, FX.explosion.returnFire, "damage");
      this.hitStop(FX.time.glanceStop);
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

  /**
   * Aboard. A site was called in and the verdict is up. The scene is parked,
   * so there is nothing to shake or shatter: the answer is a radio call, and
   * the radio is the whole of what the engine adds to it.
   */
  private onSiteCalled(index: number, outcome: Outcome): void {
    this.audio.site(outcome.correct);
    this.options.onOutcome?.(outcome, index);
  }

  /**
   * The end-of-run tally reading the score out. The tally is a React screen,
   * so it calls through here for its sounds the way the HUD calls `answer`:
   * the engine owns the audio and nothing else makes a noise.
   */
  tallyCue(cue: TallyCue): void {
    switch (cue.kind) {
      case "line":
        this.audio.tallyLine(cue.index, cue.points, cue.max);
        break;
      case "tick":
        this.audio.tallyTick();
        break;
      case "stage":
        this.audio.tallyStage(cue.share);
        break;
      case "total":
        this.audio.tallyTotal(cue.tier);
        break;
    }
  }

  private endRun(): void {
    if (this.ended) return;
    this.ended = true;
    const summary = this.run.summary();
    this.audio.finish(finaleTier(summary.score, summary.maxScore));
    this.options.onRunEnd?.(summary);
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
    this.sizeEffects();
  }

  /** Bloom's targets, and how big a world unit of fire is in pixels. */
  private sizeEffects(): void {
    const dpr = this.renderer.getPixelRatio();
    this.post?.setSize(this.width, this.height, dpr);
    const halfFov = THREE.MathUtils.degToRad(CAMERA.fov) / 2;
    this.explosion.setScale((this.height * dpr) / 2 / Math.tan(halfFov));
  }

  private buildPost(): void {
    const want = BLOOM.enabled[this.tier] ?? false;
    if (want && !this.post) {
      this.post = new Post(this.renderer, this.scene, this.chase.camera, this.tier === 0);
    } else if (!want && this.post) {
      this.post.dispose();
      this.post = null;
    }
    this.sizeEffects();
  }

  /** A few frames of almost nothing: the punch of an impact. */
  private hitStop(seconds: number): void {
    this.stopLeft = Math.max(this.stopLeft, seconds);
  }

  /** Bullet time: the scene at `scale` for `seconds`, then eased back. */
  private slowMo(scale: number, seconds: number): void {
    this.slowScale = Math.min(this.slowLeft > 0 ? this.slowScale : 1, scale);
    this.slowLeft = Math.max(this.slowLeft, seconds);
  }

  /** Step the visual clock on real time and return the scaled delta. */
  private visualDelta(dt: number): number {
    let target = 1;
    if (this.stopLeft > 0) {
      this.stopLeft -= dt;
      target = FX.time.stopScale;
    } else if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      target = this.slowScale;
      if (this.slowLeft <= 0) this.slowScale = 1;
    }
    // Into a stop or a slow at once; back out of it eased, so real time
    // arrives as a surge rather than a cut.
    if (target < this.timeScale) this.timeScale = target;
    else this.timeScale += (target - this.timeScale) * (1 - Math.exp(-FX.time.recover * dt));
    return dt * this.timeScale;
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
      // Aboard the station: the world is asleep and the bed idles on at a
      // standstill. The run is not asleep, though. Its answer clock is the only
      // thing still ticking, and stepping it here is what keeps the countdown
      // honest without waking the flight and adding distance to a docked ship.
      // On `raw`, deliberately, not the clamped `dt`. The clamp exists so a
      // backgrounded tab cannot hand back a multi-second delta and teleport the
      // world through the ship; an answer clock has nothing to teleport. Given
      // the clamp it ran slow whenever frames were slow, so 40 seconds meant 40
      // seconds only on a fast device, and a daily run has to be the same
      // question for everyone. A hidden tab is stopped outright by the
      // visibility handler, so this never counts time the player was away.
      this.run.tickDocked(raw);
      this.audio.update(dt, 0, 1, false);
      // The draw is skipped but the emit is not: React reads the countdown off
      // state, and the end of `update` (where every other frame emits) is not
      // reached from here. GameCanvas still throttles this to about 12Hz.
      this.options.onState?.(this.state);
      return;
    }

    this.update(dt);
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.chase.camera);
    this.sampleQuality(raw);
    this.emitDebug(raw);
  };

  private update(dt: number): void {
    if (!this.ended) this.run.update(dt);
    else this.run.flight.update(dt);

    const flight = this.run.flight;
    const speed = flight.worldSpeed;
    const ratio = flight.visualRatio;
    // Everything below that only draws runs on the visual clock.
    const vdt = this.visualDelta(dt);

    if (this.surgeHold > 0) this.surgeHold -= vdt;
    else this.streakSurge *= Math.exp(-FX.pullbackDecay * vdt);

    // MAXIMUM THRUST: hold the plume at full, then ease it back down on the
    // same curve the camera rumble uses, so flame and shake end together.
    if (this.overdriveLeft > 0) this.overdriveLeft = Math.max(this.overdriveLeft - vdt, 0);
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

    this.density += (this.densityTarget - this.density) * (1 - Math.exp(-1.2 * vdt));
    this.field.setDensity(this.density);
    this.alien.update(vdt);
    this.beam.update(vdt);
    this.returnBeam.update(vdt);
    this.landmark.update(vdt);
    if (this.salvage.update(vdt)) this.shield.flash(0.9, COLOR.cyan);

    this.audio.update(dt, ratio, this.run.thrust, open);
    this.ship.update(vdt, ratio, open ? this.run.thrust : 1);
    this.shield.update(vdt);
    this.chase.update(vdt, this.ship, ratio);
    this.stars.update(vdt, speed, streakIntensity(ratio) + this.streakSurge);
    this.field.update(vdt, speed);
    this.rock.update(vdt, speed);
    this.incoming.update(vdt, speed);
    this.debris.update(vdt, speed);
    this.shockwave.update(vdt, this.chase.camera);
    this.explosion.update(vdt, speed);
    this.hyper.update(vdt, speed, this.chase.camera);
    this.trails.update(vdt, this.ship, ratio + this.streakSurge * 0.5, speed);
    // Only between questions: never on a read screen, an open question, the
    // station run-in or the verdict itself. Nothing moves in the sky then.
    const calm = phase === "intro" || phase === "waypoint" || phase === "aftermath";
    this.comets.update(vdt, !calm, this.chase.camera);
    this.flyby.update(vdt, calm, speed);
    this.dust.update(vdt, speed, ratio + this.streakSurge * 0.5);
    this.backdrop.update(this.ship.group.position.x, this.ship.group.position.y);

    if (!this.ended) this.options.onState?.(this.state);
  }

  /**
   * Feed the governor every frame. It used to be fed from inside the debug
   * overlay's emit, which returns early without `?debug=1`, so no player's
   * tier ever stepped down; with bloom on the high tiers, it has to.
   */
  private sampleQuality(rawDelta: number): void {
    if (this.tierPinned) return;
    const downgraded = this.governor.sample(rawDelta * 1000);
    if (downgraded !== null) this.applyTier(downgraded);
  }

  private emitDebug(rawDelta: number): void {
    if (!this.options.onDebug) return;

    const frameMs = rawDelta * 1000;
    this.fpsAccumulator += frameMs;
    this.fpsFrames += 1;

    this.lastDebugEmit += frameMs;
    if (this.lastDebugEmit < 250) return;

    const averageMs = this.fpsAccumulator / Math.max(this.fpsFrames, 1);
    this.options.onDebug({
      fps: averageMs > 0 ? 1000 / averageMs : 0,
      frameMs: averageMs,
      // The scene's own cost: with bloom on, the passes after it are fill
      // rate, not draw calls, and are reported apart.
      drawCalls: this.post ? this.post.sceneCalls : this.renderer.info.render.calls,
      triangles: this.post ? this.post.sceneTriangles : this.renderer.info.render.triangles,
      bloom: this.post !== null,
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
    // Stepping down to a tier without bloom drops it on the spot.
    this.buildPost();
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
