/**
 * Every constant that decides how Galaxia FEELS lives here.
 *
 * This is the file to open when the flight is too floaty, too twitchy, too
 * slow or too busy. No other module hardcodes a magic number, so a change
 * here is the whole change.
 *
 * Units: world units for distance, world-units/second for speed, seconds for
 * time, radians for angles.
 */

export const WORLD = {
  /** Half-width of the playable corridor on X. Ship is clamped to this. */
  corridorHalfWidth: 13,
  /** Half-height of the playable corridor on Y. */
  corridorHalfHeight: 5.5,
  /**
   * Number of lanes the corridor divides into. The quiz mechanic reads lane
   * index / continuous lane position, so this is the seam every candidate
   * scoring model plugs into. 4 suits a 4-option question.
   */
  laneCount: 4,
  /** Where world objects are born, on -Z. */
  spawnDistance: 420,
  /** Once an object passes this +Z it is recycled to the back of the pool. */
  recycleDistance: 24,
  /** Fog start / end. Tuned so recycled objects fade in rather than pop. */
  fogNear: 90,
  fogFar: 400,
} as const;

export const SPEED = {
  /** Speed at the very start of a round. */
  base: 58,
  /** Speed the ramp asymptotes toward over a round. */
  max: 165,
  /** Seconds to travel most of the way from base to max. Higher = gentler. */
  rampSeconds: 150,
  /** How fast an externally-set multiplier (boost/brake) eases in. */
  multiplierLerp: 2.2,
  /** Speed above which the streak layer starts to show. */
  streakThreshold: 95,
} as const;

export const SHIP = {
  /** Peak lateral speed on X at full steering input. */
  lateralSpeed: 32,
  /** Peak vertical speed on Y at full steering input. */
  verticalSpeed: 16,
  /** How sharply the ship reaches target lateral velocity. Higher = twitchier. */
  steerResponse: 7.5,
  /** Max bank angle, radians, reached at full lateral velocity. */
  maxRoll: 0.62,
  /** How quickly roll catches up to lateral velocity. */
  rollResponse: 5.5,
  /** Max pitch from vertical movement, radians. */
  maxPitch: 0.26,
  /** Slight yaw into the turn. Sells the bank without fighting the camera. */
  maxYaw: 0.16,
  /** Idle bob amplitude and rate, so the ship never looks frozen. */
  bobAmplitude: 0.09,
  bobRate: 1.6,
  /** Fixed Z the ship sits at. The world moves past it. */
  z: 0,
  /** URL of the hull model. Served from /public. */
  modelUrl: "/models/spaceship.glb",
  /** The loaded model is scaled so its longest axis measures this. */
  modelLength: 5.6,
  /**
   * Extra Y rotation applied to the model so its nose faces -Z (the direction
   * of travel). The Quaternius ship is authored nose toward +Z.
   */
  modelYaw: Math.PI,
  /**
   * Exhaust nozzle positions in ship space (after normalisation and yaw),
   * +Z is the rear. Tuned by eye against the loaded model.
   */
  nozzles: [
    { x: -0.62, y: 0.02, z: 2.35 },
    { x: 0.62, y: 0.02, z: 2.35 },
  ],
} as const;

export const EXHAUST = {
  /** Flame colours, hot to cold. */
  core: 0xfff1b0,
  mid: 0xff8a1f,
  outer: 0xd62d0a,
  /** Cone length at base speed and the extra added at max speed. */
  baseLength: 3.4,
  speedLength: 3.2,
  /** Radius of the outer cone at the nozzle. */
  radius: 0.42,
  /**
   * Downward tilt of the plume, radians. The chase camera sits above the
   * ship, so a plume aimed dead astern is seen end-on and reads as a dot;
   * tilting it drops the tail into view.
   */
  tilt: 0.34,
  /** Particles streamed per nozzle, per quality tier (high, mid, low). */
  particleCount: [70, 45, 28],
  /** How far back a particle travels before it recycles. */
  particleTravel: 4.5,
  /** Particle speed at base speed and the extra at max speed. */
  particleSpeed: 9,
  particleSpeedBoost: 10,
  /** Flicker amplitude on the cone scale. */
  flicker: 0.16,
  /** How quickly a pulse() decays, per second. */
  pulseDecay: 3.2,
} as const;

export const CAMERA = {
  fov: 68,
  /** FOV at max speed. The push is what sells acceleration. */
  fovAtMaxSpeed: 84,
  near: 0.6,
  far: 520,
  /** Chase offset from the ship: behind on +Z, above on +Y. */
  offsetY: 5.0,
  offsetZ: 17.5,
  /** How much the camera drifts toward the ship's X. <1 lets the ship lead. */
  lateralFollow: 0.72,
  /** Positional damping. Higher = tighter, stiffer chase. */
  positionDamping: 4.2,
  /** How far ahead (on -Z) the camera aims. Makes steering read as intent. */
  lookAheadZ: 30,
  /** How much the look target leans into the ship's lateral velocity. */
  lookLateralLead: 0.22,
  /** Near-miss shake: peak offset and how fast it decays. */
  shakeMagnitude: 0.5,
  shakeDecay: 5.5,
} as const;

export const BACKDROP = {
  url: "/backdrop/space.webp",
  /** Native aspect of the image, width / height. */
  aspect: 941 / 1672,
  /** Distance in front of the camera the plane sits. Must be < CAMERA.far. */
  depth: 495,
  /** Over-cover so parallax drift never exposes an edge. */
  coverMargin: 1.25,
  /** Fraction of ship X/Y the plane drifts by. */
  parallax: 0.9,
} as const;

export const FIELD = {
  /** Ambient debris instance count, per quality tier (high, mid, low). */
  instanceCount: [520, 320, 170],
  /** Distinct base rocks baked at init and reused across instances. */
  variantCount: 5,
  /** Instances spawn in an annulus: never inside this radius of the lane axis. */
  innerRadius: 16,
  outerRadius: 78,
  /** Scale range for ambient rocks. */
  minScale: 0.35,
  maxScale: 2.6,
  /** Per-instance tumble, radians/sec. */
  maxSpin: 0.5,
} as const;

export const STARS = {
  /** Points per parallax layer, per quality tier (high, mid, low). */
  layerCounts: [
    [900, 600, 420],
    [520, 340, 220],
    [260, 170, 110],
  ],
  /** Depth of each layer. Deeper layers move slower. */
  layerDepth: [300, 460, 620],
  /** Fraction of world speed each layer travels at. */
  layerParallax: [0.55, 0.26, 0.09],
  layerSize: [1.5, 1.1, 0.8],
  spreadRadius: 260,
  /** Speed streaks (drawn only above SPEED.streakThreshold). */
  streakCount: [180, 110, 0],
  streakLength: 14,
} as const;

export const QUESTION = {
  /** How many question asteroids are live at once. */
  poolSize: 4,
  /** Radius of a question asteroid. Big enough to carry a label. */
  radius: 2.9,
  /** Z at which a question set becomes "committed" (answer locks in). */
  commitZ: -6,
  /** Distance travelled between one set retiring and the next spawning. */
  gapDistance: 260,
  /** Distance travelled before the very first set spawns. */
  firstGapDistance: 60,
  /**
   * Seconds the prompt is shown (and the ship can pre-steer) before the rocks
   * spawn. Keeps the answer window sane at top speed, when the flight from
   * spawn plane to commit line is under three seconds.
   */
  previewSeconds: 4,
  /** Per-lane depth stagger so the four never arrive as a flat wall. */
  laneStaggerZ: 18,
  /** Alternating vertical offset per lane, keeps labels apart on screen. */
  laneOffsetY: 4.5,
  /** Depth at which a label reaches full opacity / first appears. */
  labelFadeNear: 40,
  labelFadeFar: 120,
  /** How far above the rock's centre (in radii) the label floats. */
  labelLift: 1.45,
  /** Seconds for a hit asteroid to shatter down to nothing. */
  shatterSeconds: 0.28,
} as const;

export const SCORING = {
  /** Points for a perfect answer. Scaled by accuracy^pointCurve. */
  maxPoints: 1000,
  pointCurve: 1.5,
  /** Numeric: error as a fraction of the band beyond which accuracy is 0. */
  numericTolerance: 0.4,
  /** Speed multiplier at accuracy 0 and the extra at accuracy 1. */
  multiplierFloor: 0.8,
  multiplierRange: 0.5,
  /** Seconds a boost/brake holds before easing back to 1. */
  boostSeconds: 3,
  /** Hull lost on a miss. */
  missHullDamage: 0.2,
  /** Accuracy thresholds for the share-grid bands. */
  pinpoint: 0.9,
  close: 0.65,
  off: 0.35,
  /** Seconds the resolve toast stays on the HUD. */
  toastSeconds: 3.2,
} as const;

/** Palette, lifted straight from the design system. */
export const COLOR = {
  panel: 0x0d1b2e,
  /** Dominant dark tone of the backdrop image. Fog and clear colour. */
  space: 0x071122,
  ink: 0x0a0a0a,
  accent: 0x1f45e5,
  body: 0x5b6170,
  panelLabel: 0x9aa3b2,
  white: 0xffffff,
  rule: 0xe4e7ec,
  pos: 0x0f7a4d,
  neg: 0xb3261e,
} as const;

export const PERF = {
  /** Frame budget in ms. Above this for a sustained window = drop a tier. */
  frameBudgetMs: 20,
  /** How long to sample before allowing an adaptive downgrade. */
  sampleSeconds: 2.5,
  /** Delta clamp. Stops a backgrounded tab teleporting the world on return. */
  maxDelta: 1 / 30,
  /** Device pixel ratio cap per tier. A 3x phone otherwise renders 9x pixels. */
  dprCap: [2, 1.5, 1],
} as const;
