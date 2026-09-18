import * as THREE from "three";
import { AsteroidField } from "./AsteroidField";
import { ChaseCamera, speedRatio } from "./Camera";
import { Input } from "./Input";
import { QuestionAsteroid, laneToX } from "./QuestionAsteroid";
import { Ship } from "./Ship";
import { Starfield } from "./Starfield";
import { COLOR, PERF, QUESTION, SPEED, WORLD } from "./Tuning";
import { QualityGovernor, detectTier, dprForTier, prefersReducedMotion } from "./quality";
import type { DebugInfo, GameState, QualityTier, Question, Round } from "./types";

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
  private questionTimer = 0;
  private questionIndex = -1;

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
    this.renderer.setClearColor(COLOR.panel, 1);
    this.renderer.setPixelRatio(dprForTier(this.tier));

    this.scene.background = new THREE.Color(COLOR.panel);
    // Fog in the background colour means recycled geometry fades in rather
    // than popping at the spawn plane. It is the cheapest depth cue there is.
    this.scene.fog = new THREE.Fog(COLOR.panel, WORLD.fogNear, WORLD.fogFar);

    this.chase = new ChaseCamera(1, reducedMotion);

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

    this.ship = new Ship(reducedMotion);
    this.scene.add(this.ship.group);

    this.stars = new Starfield(this.tier, random);
    this.scene.add(this.stars.group);

    this.field = new AsteroidField(this.tier, random);
    this.scene.add(this.field.mesh);

    for (let i = 0; i < QUESTION.poolSize; i += 1) {
      const asteroid = new QuestionAsteroid(random);
      this.questions.push(asteroid);
      this.scene.add(asteroid.group);
    }

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
      hull: 1,
      activeQuestion: this.questionIndex,
      running: this.frameHandle !== null,
    };
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
    this.elapsed += dt;

    this.input.update();
    this.advanceSpeed(dt);

    this.distance += this.speed * dt;

    const ratio = speedRatio(this.speed);
    this.ship.update(dt, this.input, ratio);
    this.chase.update(dt, this.ship, ratio);
    this.stars.update(dt, this.speed);
    this.field.update(dt, this.speed);

    this.updateQuestions(dt);
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

  /**
   * Cycles question asteroids in and out. With scoring unimplemented this
   * only drives presentation: it proves the content pipeline, the lane
   * placement and the label projection all work end to end.
   */
  private updateQuestions(dt: number): void {
    this.questions.forEach((asteroid) => asteroid.update(dt, this.speed));

    // Spawn cadence shortens as speed rises, so the gap between question sets
    // stays roughly constant in distance rather than in time.
    const interval = QUESTION.intervalSeconds * (SPEED.base / this.speed);
    this.questionTimer += dt;
    if (this.questionTimer < interval) return;

    this.questionTimer = 0;
    this.spawnQuestionSet();
  }

  private spawnQuestionSet(): void {
    const { questions } = this.options.round;
    if (questions.length === 0) return;

    this.questionIndex = (this.questionIndex + 1) % questions.length;
    const question = questions[this.questionIndex]!;
    const labels = labelsForQuestion(question, WORLD.laneCount);

    for (let lane = 0; lane < WORLD.laneCount; lane += 1) {
      const asteroid = this.questions[lane];
      if (!asteroid) break;
      asteroid.spawn(lane, labels[lane] ?? "");
      // Stagger depth so the four do not arrive as a flat wall, and alternate
      // height generously: lanes are only ~6 world units apart, which at
      // mid-range projects to barely 60px and collides the labels. Vertical
      // separation is free, because only X carries the answer.
      asteroid.group.position.z -= lane * 7;
      asteroid.group.position.x = laneToX(lane);
      asteroid.group.position.y = lane % 2 === 0 ? 2.7 : -2.7;
    }
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

/**
 * Lane labels for a question. Placeholder presentation only: MCQ shows its
 * options, numeric shows evenly spaced gate values across the band.
 */
export function labelsForQuestion(
  question: Question,
  laneCount: number,
): string[] {
  if (question.type === "mcq" && question.options) {
    return question.options.slice(0, laneCount).map((option) => option.label);
  }

  const [min, max] = question.range ?? [0, 100];
  const labels: string[] = [];
  for (let lane = 0; lane < laneCount; lane += 1) {
    const low = min + ((max - min) * lane) / laneCount;
    const high = min + ((max - min) * (lane + 1)) / laneCount;
    labels.push(`${Math.round(low)}–${Math.round(high)}`);
  }
  return labels;
}
