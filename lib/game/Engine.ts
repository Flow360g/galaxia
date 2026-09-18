import * as THREE from "three";
import { requestAnomalyScore } from "./anomaly";
import { AsteroidField } from "./AsteroidField";
import { Backdrop } from "./Backdrop";
import { ChaseCamera } from "./Camera";
import { ClusterField } from "./ClusterField";
import { Debris } from "./Debris";
import { EncounterAsteroid } from "./EncounterAsteroid";
import { Run } from "./Run";
import { Shield } from "./Shield";
import { Ship } from "./Ship";
import { Starfield } from "./Starfield";
import { CLUSTER, COLOR, ENCOUNTER, FX, PERF, WORLD } from "./Tuning";
import { QualityGovernor, detectTier, dprForTier, prefersReducedMotion } from "./quality";
import type {
  DebugInfo,
  GameState,
  Outcome,
  QualityTier,
  Question,
  Round,
  RunSummary,
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
 * it spawns the rock when a question is called, plays the strike when the
 * answer locks, and fires the burst or the impact on contact.
 */
export class Engine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly chase: ChaseCamera;
  private readonly ship: Ship;
  private readonly field: AsteroidField;
  private readonly stars: Starfield;
  private readonly rock: EncounterAsteroid;
  private readonly cluster: ClusterField;
  private readonly debris: Debris;
  private readonly shield: Shield;
  private readonly backdrop: Backdrop;
  private readonly governor: QualityGovernor;
  private readonly run: Run;

  private readonly clock = new THREE.Clock();
  private frameHandle: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private ended = false;

  private readonly canvas: HTMLCanvasElement;
  private tier: QualityTier;
  private width = 1;
  private height = 1;

  /** Which side the ship swerves to for this encounter, alternating. */
  private side: 1 | -1 = 1;
  /** Extra streak intensity from a slingshot or a burn, decaying. */
  private streakSurge = 0;
  /** Seconds the surge holds before it decays. A FULL BURN sets this. */
  private surgeHold = 0;
  /** The current encounter is a cluster; the lone rock stays idle. */
  private inCluster = false;

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

    this.ship = new Ship(reducedMotion, this.tier, random);
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

    this.cluster = new ClusterField(random);
    this.scene.add(this.cluster.group);

    this.debris = new Debris(this.tier, random);
    this.scene.add(this.debris.mesh);

    this.run = new Run(
      options.round,
      {
        onEncounterStart: (index, question) => this.onEncounterStart(index, question),
        onPick: (lane, correct) => this.onPick(lane, correct),
        onCollect: (lane, charge) => this.onCollect(lane, charge),
        onLock: (index, outcome) => this.onLock(outcome),
        onContact: (index, outcome) => this.onContact(index, outcome),
        onFinished: () => this.endRun(),
        scoreAnomaly: (question, answer) => requestAnomalyScore(question, answer),
      },
      random,
    );

    this.observeResize();
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    if (this.frameHandle !== null || this.disposed) return;
    this.clock.start();
    this.loop();
  }

  stop(): void {
    if (this.frameHandle === null) return;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.clock.stop();
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
    this.cluster.dispose();
    this.debris.dispose();

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

  /** Cluster: bank the reactor charge. */
  burn(): void {
    this.run.burn();
  }

  useNova(): void {
    this.run.useNova();
  }

  submitAnomaly(text: string): void {
    this.run.submitAnomaly(text);
  }

  get state(): GameState {
    const state = this.run.state;
    state.running = this.frameHandle !== null;
    return state;
  }

  // ---------------------------------------------------------------- run hooks

  private onEncounterStart(index: number, question: Question): void {
    this.side = index % 2 === 0 ? 1 : -1;
    this.inCluster = question.type === "cluster";
    if (this.inCluster) this.cluster.spawn();
    else this.rock.spawn(question.type === "anomaly");
    this.ship.recentre();
  }

  private onPick(lane: number, correct: boolean): void {
    this.ship.holdLane(ClusterField.laneX(lane));
    this.cluster.pick(lane, correct, CLUSTER.collectSeconds);
  }

  private onCollect(lane: number, charge: number): void {
    this.cluster.collect(lane);
    this.shield.flash(FX.collect.shieldFlash, COLOR.cyan);
    this.ship.pulseExhaust(FX.collect.exhaustPulse + FX.collect.exhaustPulsePerCharge * charge);
    this.chase.shake(FX.collect.shake);
  }

  private onLock(outcome: Outcome): void {
    if (this.inCluster) {
      if (outcome.kind === "burn") {
        this.cluster.stream();
        this.ship.manoeuvre("burn", this.side);
      } else {
        // A miss: the red rock in the picked lane makes its final run. A
        // timeout has no rock to hit; the rest just stream past.
        this.cluster.strike(outcome.chosen, ENCOUNTER.strikeSeconds);
      }
      return;
    }
    this.rock.strike(ENCOUNTER.strikeSeconds, outcome.correct);
    this.ship.manoeuvre(outcome.kind, this.side);
  }

  private onContact(index: number, outcome: Outcome): void {
    const kind = outcome.kind;
    this.chase.shake(FX.shake[kind]);

    if (kind === "burn") {
      const full = (outcome.charge ?? 0) >= CLUSTER.chargeMultiplier.length - 1;
      if (full) {
        this.chase.burst(FX.warp.pullback, FX.warp.fovKick);
        this.chase.shake(FX.warp.shake);
        this.streakSurge = FX.warp.streakSurge;
        this.surgeHold = FX.warp.holdSeconds;
        this.shield.flash(1, COLOR.boost);
      } else {
        const charge = outcome.charge ?? 1;
        const scale = charge >= 2 ? 1 : 0.6;
        this.chase.burst(FX.pullback.burn * scale, FX.fovKick.burn * scale);
        this.streakSurge = FX.streakSurge * scale;
        if (charge >= 2) this.shield.flash(0.8, COLOR.boost);
      }
      this.ship.pulseExhaust(FX.exhaustPulse.burn);
    } else if (outcome.correct) {
      this.rock.contact(false);
      const burst = kind === "slingshot" ? "slingshot" : "thread";
      this.chase.burst(FX.pullback[burst], FX.fovKick[burst]);
      this.ship.pulseExhaust(FX.exhaustPulse[burst]);
      if (kind === "slingshot") {
        this.shield.flash(0.8, COLOR.boost);
        this.streakSurge = FX.streakSurge;
      }
    } else {
      const strength = kind === "wreck" ? 1.6 : 1;
      if (this.inCluster) {
        if (outcome.chosen !== null) {
          this.cluster.positionOf(outcome.chosen, this.scratch);
          this.cluster.shatter(outcome.chosen);
          this.debris.burst(this.scratch, strength, COLOR.panelLabel);
        }
      } else {
        this.rock.contact(true);
        this.scratch.copy(this.rock.group.position);
        this.debris.burst(
          this.scratch,
          strength,
          this.rock.anomaly ? COLOR.anomaly : COLOR.panelLabel,
        );
      }
      this.shield.flash(kind === "wreck" ? 1.4 : 1);
      this.ship.impact(kind, this.side);
    }

    this.options.onOutcome?.(outcome, index);
  }

  private endRun(): void {
    if (this.ended) return;
    this.ended = true;
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

    const phase = this.run.phase;
    const open = phase === "approach" || phase === "collecting";
    if (open) {
      if (this.inCluster) this.cluster.setLoom(1 - this.run.thrust);
      else this.rock.setLoom(1 - this.run.thrust);
    }

    this.ship.update(dt, ratio, open ? this.run.thrust : 1);
    this.shield.update(dt);
    this.chase.update(dt, this.ship, ratio);
    this.stars.update(dt, speed, streakIntensity(ratio) + this.streakSurge);
    this.field.update(dt, speed);
    this.rock.update(dt, speed);
    this.cluster.update(dt, speed);
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
