import * as THREE from "three";
import { AsteroidField } from "./AsteroidField";
import { Backdrop } from "./Backdrop";
import { ChaseCamera, speedRatio } from "./Camera";
import { Input } from "./Input";
import { QuestionAsteroid } from "./QuestionAsteroid";
import { Quiz } from "./Quiz";
import { Ship } from "./Ship";
import { Starfield } from "./Starfield";
import { COLOR, PERF, QUESTION, SPEED, WORLD } from "./Tuning";
import { QualityGovernor, detectTier, dprForTier, prefersReducedMotion } from "./quality";
import type {
  AnswerEvent,
  DebugInfo,
  GameState,
  QualityTier,
  Round,
  RoundSummary,
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
  onLabels?: (labels: LabelPlacement[]) => void;
  onAnswer?: (event: AnswerEvent) => void;
  onRoundEnd?: (summary: RoundSummary) => void;
}

export interface LabelPlacement {
  id: string;
  text: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

/**
 * Owns the renderer, the scene graph, the frame loop and the lifecycle.
 *
 * The core model is a treadmill: the ship never travels on Z, the world is
 * translated past it. That keeps float precision constant no matter how far
 * the player gets, makes geometry a fixed recycled pool, and leaves distance
 * as a plain scalar the scoring layer can own independently of the scene.
 */
export class Engine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly chase: ChaseCamera;
  private readonly input: Input;
  private readonly ship: Ship;
  private readonly field: AsteroidField;
  private readonly stars: Starfield;
  private readonly questions: QuestionAsteroid[] = [];
  private readonly quiz: Quiz;
  private readonly backdrop: Backdrop;
  private readonly governor: QualityGovernor;

  private readonly clock = new THREE.Clock();
  private frameHandle: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  private readonly canvas: HTMLCanvasElement;
  private tier: QualityTier;
  private width = 1;
  private height = 1;

  private elapsed = 0;
  private distance = 0;
  private speed: number = SPEED.base;
  private speedMultiplier = 1;
  private targetMultiplier = 1;
  private ended = false;

  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private lastDebugEmit = 0;

  private readonly labelBuffer: LabelPlacement[] = [];

  constructor(private readonly options: EngineOptions) {
    const reducedMotion = prefersReducedMotion();
    this.tier = detectTier();
    this.governor = new QualityGovernor(this.tier);

    this.canvas = document.createElement("canvas");
    this.canvas.dataset.galaxiaCanvas = "true";
    options.container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // Antialiasing is the first thing to go on weak devices. Flat shading
      // plus fog hides most of the cost of losing it.
      antialias: this.tier === 0,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false,
      depth: true,
    });
    this.renderer.setClearColor(COLOR.space, 1);
    this.renderer.setPixelRatio(dprForTier(this.tier));

    this.scene.background = new THREE.Color(COLOR.space);
    // Fog in the backdrop's dominant tone means recycled geometry fades into
    // the painted sky rather than popping at the spawn plane.
    this.scene.fog = new THREE.Fog(COLOR.space, WORLD.fogNear, WORLD.fogFar);

    this.chase = new ChaseCamera(1, reducedMotion);
    this.scene.add(this.chase.camera);

    this.backdrop = new Backdrop();
    this.chase.camera.add(this.backdrop.mesh);
    void this.backdrop.load();

    // One directional key light and one hemisphere fill. No shadow maps:
    // shadows are the single most expensive thing a mobile GPU can be asked
    // for, and flat-shaded rock does not need them to read.
    const key = new THREE.DirectionalLight(COLOR.white, 2.1);
    key.position.set(-6, 9, 4);
    this.scene.add(key);
    this.scene.add(
      new THREE.HemisphereLight(COLOR.white, COLOR.accent, 0.85),
    );

    const random = createRandom(options.round.seed);

    this.ship = new Ship(reducedMotion, this.tier, random);
    this.scene.add(this.ship.group);
    void this.ship.loadModel();

    this.stars = new Starfield(this.tier, random);
    this.scene.add(this.stars.group);

    this.field = new AsteroidField(this.tier, random);
    this.scene.add(this.field.mesh);

    for (let i = 0; i < QUESTION.poolSize; i += 1) {
      const asteroid = new QuestionAsteroid(random);
      this.questions.push(asteroid);
      this.scene.add(asteroid.group);
    }

    this.quiz = new Quiz(options.round, this.questions, {
      lanePosition: () => this.ship.lanePosition,
      lane: () => this.ship.currentLane,
      setSpeedMultiplier: (multiplier) => this.setSpeedMultiplier(multiplier),
      shake: (intensity) => this.shake(intensity),
      pulseExhaust: (strength) => this.ship.pulseExhaust(strength),
      onAnswer: (event) => options.onAnswer?.(event),
      onRoundEnd: () => this.endRound(),
    });

    this.input = new Input(this.canvas);
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

    this.input.dispose();
    this.ship.dispose();
    this.field.dispose();
    this.stars.dispose();
    this.backdrop.dispose();
    this.questions.forEach((asteroid) => asteroid.dispose());
    this.questions.length = 0;

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

  // ------------------------------------------------------------- external API

  /**
   * Nudge world speed. This is the hook the scoring layer uses to reward a
   * right answer with a boost or punish a wrong one with a brake.
   */
  setSpeedMultiplier(multiplier: number): void {
    this.targetMultiplier = Math.max(0.2, multiplier);
  }

  /** Camera kick, for impacts and near misses. */
  shake(intensity = 1): void {
    this.chase.shake(intensity);
  }

  get state(): GameState {
    return {
      distance: this.distance,
      speed: this.speed,
      lanePosition: this.ship.lanePosition,
      currentLane: this.ship.currentLane,
      hull: this.quiz.hull,
      score: this.quiz.score,
      activeQuestion: this.quiz.activeQuestion,
      answering: this.quiz.answering,
      liveGuess: this.quiz.liveGuess(this.ship.lanePosition),
      questionsAnswered: this.quiz.questionsAnswered,
      running: this.frameHandle !== null,
    };
  }

  private endRound(): void {
    if (this.ended) return;
    this.ended = true;
    this.options.onRoundEnd?.({
      score: this.quiz.score,
      distance: this.distance,
      hull: this.quiz.hull,
      bands: [...this.quiz.bands],
    });
    // Freeze on the final frame; the results panel sits over it.
    this.stop();
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
    else if (!this.disposed && !this.ended) this.start();
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
    this.elapsed += dt;

    this.input.update();
    this.advanceSpeed(dt);

    this.distance += this.speed * dt;

    const ratio = speedRatio(this.speed);
    this.ship.update(dt, this.input, ratio);
    this.chase.update(dt, this.ship, ratio);
    this.stars.update(dt, this.speed);
    this.field.update(dt, this.speed);
    this.backdrop.update(this.ship.group.position.x, this.ship.group.position.y);

    this.quiz.update(dt, this.speed, this.distance, this.elapsed);
    this.emitLabels();

    this.options.onState?.(this.state);
  }

  private advanceSpeed(dt: number): void {
    // Asymptotic ramp: fast early progress, never actually reaching max, so
    // a long run keeps gaining without the speed becoming unplayable.
    const progress = 1 - Math.exp(-this.elapsed / SPEED.rampSeconds);
    const base = SPEED.base + (SPEED.max - SPEED.base) * progress;

    const lerp = 1 - Math.exp(-SPEED.multiplierLerp * dt);
    this.speedMultiplier +=
      (this.targetMultiplier - this.speedMultiplier) * lerp;

    this.speed = base * this.speedMultiplier;
  }

  private emitLabels(): void {
    if (!this.options.onLabels) return;

    this.labelBuffer.length = 0;
    for (let i = 0; i < this.questions.length; i += 1) {
      const asteroid = this.questions[i]!;
      const placement = asteroid.projectToScreen(
        this.chase.camera,
        this.width,
        this.height,
      );
      if (!placement || !asteroid.label) continue;

      this.labelBuffer.push({
        id: `lane-${i}`,
        text: asteroid.label,
        x: placement.x,
        y: placement.y,
        scale: placement.scale,
        opacity: placement.opacity,
      });
    }

    this.options.onLabels(this.labelBuffer);
  }

  private emitDebug(rawDelta: number): void {
    if (!this.options.onDebug) return;

    const frameMs = rawDelta * 1000;
    this.fpsAccumulator += frameMs;
    this.fpsFrames += 1;

    const downgraded = this.governor.sample(frameMs);
    if (downgraded !== null) this.applyTier(downgraded);

    // Emit at ~4Hz. A per-frame React setState for debug text would itself
    // be the thing slowing the frame down.
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

  /**
   * Adaptive downgrade. Only the cheap, non-structural knobs are touched at
   * runtime: rebuilding the instanced field mid-flight would stutter worse
   * than the framerate we are trying to fix.
   */
  private applyTier(tier: QualityTier): void {
    this.tier = tier;
    this.renderer.setPixelRatio(dprForTier(tier));
    this.resize();
  }
}

/**
 * Deterministic PRNG (mulberry32), seeded from the round.
 *
 * Every player on a given day must get an identical field, or comparing
 * results is meaningless and the share loop falls apart.
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
