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
  /** Half-width of the corridor on X. The autopilot swerves within this. */
  corridorHalfWidth: 26,
  /** Half-height of the corridor on Y. */
  corridorHalfHeight: 5.5,
  /** Where world objects are born, on -Z. */
  spawnDistance: 420,
  /** Once an object passes this +Z it is recycled to the back of the pool. */
  recycleDistance: 24,
  /** Fog start / end. Tuned so recycled objects fade in rather than pop. */
  fogNear: 90,
  fogFar: 400,
} as const;

export const FLIGHT = {
  /** Cruise velocity, km/h, with no streak. The floor velocity relaxes to. */
  cruise: 1800,
  /**
   * Each consecutive correct answer lifts the cruise floor by this fraction
   * of base cruise. The streak is the "underlying velocity": at streak 4 the
   * ship idles at 1800 * (1 + 0.3 * 4) = 4,000 km/h.
   */
  streakCruiseGain: 0.3,
  /** Streak steps counted toward cruise. Beyond this, the floor stops rising. */
  streakCap: 6,
  /** km/h added by a correct answer with zero thrust left. */
  impulseBase: 900,
  /** Extra km/h added at full thrust. Answer fast, burst harder. */
  impulseThrust: 1700,
  /** Impulse grows with the streak you had going in. */
  impulseStreakGain: 0.15,
  /** Boost multiplies the impulse on a correct answer. */
  boostImpulse: 1.85,
  /** Fraction of velocity kept through a collision, and through a wreck. */
  collisionRetain: 0.5,
  wreckRetain: 0.28,
  /** Velocity never drops below this, so the ship is always moving. */
  minVelocity: 700,
  maxVelocity: 16000,
  /** Per second. How fast velocity above cruise bleeds back down to it. */
  decayRate: 0.16,
  /** Per second. How fast velocity below cruise climbs back up to it. */
  recoveryRate: 0.4,
  /**
   * Velocity mapped onto 0..1 for everything visual (FOV, streaks, exhaust)
   * between cruise and this. Above it the visuals are pinned at max.
   */
  visualMaxVelocity: 9000,
  /** km/h to world units per second. 1800 km/h cruises at about 45 u/s. */
  worldScale: 0.025,
  /**
   * One real second is this many flight seconds for the distance counter.
   * Keeps a three-minute run in the thousands of kilometres.
   */
  distanceTimeScale: 90,
} as const;

export const ENCOUNTER = {
  /** Engines lighting before the first asteroid is called. */
  introSeconds: 1.6,
  /**
   * Seconds on the clock for a single pick. Thrust IS the timer, and it
   * refills for every pick, so a six-lane cluster is six five-second
   * decisions rather than one long one.
   */
  thrustSeconds: 5,
  /** The anomaly needs typing time. */
  anomalyThrustSeconds: 40,
  /** Asteroid Z at full thrust and at empty thrust. It looms as you think. */
  holdFar: -170,
  holdNear: -48,
  /** Seconds from lock to contact when something is coming at the ship. */
  strikeSeconds: 0.7,
  /**
   * Seconds from lock to contact when the lane was clean. There is nothing
   * left to hit, so the impulse lands almost at once and the run moves on.
   */
  clearSeconds: 0.18,
  /** Seconds the outcome animation owns the screen after contact. */
  resolveSeconds: 1.0,
  /** Seconds the outcome toast holds before the next asteroid is called. */
  aftermathSeconds: 2.4,
  aftermathSecondsAnomaly: 3.8,
  /** Radius of an encounter asteroid, and of the anomaly. */
  radius: 4.6,
  anomalyRadius: 5.2,
  /** Vertical offset of the encounter rock so it sits in the ship's eyeline. */
  offsetY: 0.6,
  /** Lateral swerve when threading past, and the tighter skim on a slingshot. */
  threadOffsetX: 9.5,
  skimOffsetX: 6.6,
  /** How long the scorer may take before the anomaly is marked locally. */
  scanTimeoutSeconds: 9,
} as const;

export const CLUSTER = {
  laneCount: 6,
  /**
   * Impulse multiplier by PLASMA banked. Index = charge. One plasma is a
   * plain thread; the full charge is the biggest burst in the game.
   */
  chargeMultiplier: [0, 1, 1.7, 2.6],
} as const;

/**
 * Lanes: the bridge between the answer squares at the top of the screen and
 * the corridor the ship flies in.
 *
 * The HUD measures where its squares actually sit and hands the engine a
 * horizontal screen fraction per lane; the engine unprojects that fraction
 * onto the ship's plane to get a world X. So the ship veers to a point that
 * is genuinely under the square the player tapped, at any aspect ratio,
 * rather than to a lane guessed from a fixed corridor width.
 */
export const LANE = {
  /** Seconds the picked lane's pod or boulder takes to reach the ship. */
  runSeconds: 1.05,
  /** Z the incoming object is born at. */
  spawnZ: -210,
  /**
   * A boulder pulls up this short of the ship and hangs for a beat before the
   * final strike, so the hit reads as a hit rather than a pop.
   */
  menaceZ: -19,
  /** Radius of the boulder that punishes a wrong lane, and of a plasma pod. */
  rockRadius: 5.2,
  podRadius: 1.9,
  /** Objects are born fanned out and converge on the true lane as they come in. */
  farSpread: 1.25,
  /**
   * How far toward its square the ship actually flies, as a fraction of the
   * distance from centre. At 1 the hull would sit dead under the outermost
   * square and hang half off the side of a phone, so it stops a little short:
   * the veer still reads as "that lane, over there", and the whole ship stays
   * in frame.
   */
  reach: 0.72,
  /**
   * How long the camera stops tracking the ship laterally after a pick. With
   * the camera held still the ship slides across the frame and lands under
   * the square that was tapped; if the camera followed, it never would.
   */
  lockSeconds: 3.2,
} as const;

/** The run's shields. Each wrong lane costs one; at zero, a miss is a wreck. */
export const SHIELDS = {
  perRun: 3,
} as const;

export const NOVA = {
  perRun: 2,
  /** Thrust spent on a scan, as a fraction of full thrust. */
  thrustCost: 0.22,
  /** How many options a narrow scan keeps lit (always including the answer). */
  narrowKeep: 2,
} as const;

/** Visual and haptic consequences per outcome. */
export const FX = {
  shake: {
    thread: 0.25,
    slingshot: 1.1,
    collision: 1.3,
    wreck: 2.2,
    timeout: 1.1,
    burn: 0.8,
  },
  /** Camera pull-back (extra +Z offset) on a burst, and its decay per second. */
  pullback: { thread: 2.2, slingshot: 5.5, burn: 4.5 },
  pullbackDecay: 1.6,
  /** Extra FOV degrees kicked in on a burst, decaying with pullback. */
  fovKick: { thread: 4, slingshot: 12, burn: 10 },
  /** A FULL BURN: the biggest moment in the run. Held, not just kicked. */
  warp: {
    pullback: 8,
    fovKick: 18,
    shake: 1.4,
    streakSurge: 1.6,
    /** Seconds the surge holds before it starts to decay. */
    holdSeconds: 2,
  },
  /** Collecting a plasma pod on a correct lane. */
  collect: { shake: 0.15, exhaustPulse: 1.4, exhaustPulsePerCharge: 0.3, shieldFlash: 0.6 },
  /** Ship tumble on a collision: full rolls and the seconds they take. */
  tumble: { collision: { rolls: 1, seconds: 1.1 }, wreck: { rolls: 2, seconds: 1.5 } },
  /** Shield flash hold time. */
  shieldSeconds: 0.6,
  /** Debris fragments per burst, per quality tier. */
  debrisCount: [56, 36, 20],
  debrisSeconds: 1.4,
  debrisSpeed: 26,
  /** Exhaust pulse strength on a burst. */
  exhaustPulse: { thread: 1.2, slingshot: 2.4, burn: 3.4 },
  /** Extra speed-streak intensity on a slingshot, decaying like pullback. */
  streakSurge: 0.9,
} as const;

/**
 * Sound. Everything is synthesised at runtime through the Web Audio API:
 * no audio files ship, so nothing to download, decode or keep in sync with
 * the visuals, and every cue can be tuned by a number here like the rest of
 * the feel. Gains are linear, frequencies hertz, times seconds.
 */
export const AUDIO = {
  /**
   * Bus levels. Master is what the mute toggle rides.
   *
   * Music and engine are partners, not a foreground and a hum: the drone is
   * wide-band noise and swamps a melody at anything like equal gain, so it
   * sits well under the music bus and the cues sit over both.
   */
  master: 0.72,
  musicBus: 0.68,
  sfxBus: 0.9,
  engineBus: 0.34,
  /** Seconds the master fades over on mute, pause and resume. */
  fadeSeconds: 0.25,

  /**
   * The room. A convolution tail is the single thing that separates a game
   * that sounds built from one that sounds like a browser playing beeps: dry
   * one-shots read as cheap however well they are synthesised. Every cue
   * sends a little of itself here, impacts most of all.
   */
  reverb: {
    seconds: 1.9,
    /** Decay exponent. Higher empties the tail faster. */
    decay: 2.4,
    /** Silence before the tail starts, seconds. Distance, in one number. */
    preDelay: 0.014,
    /** Level of the whole wet path. */
    wet: 0.85,
  },

  /**
   * Sidechain. A big hit dips the music and the engine for a moment so it
   * lands in a hole of its own rather than fighting the bed.
   */
  duck: { impact: 0.26, burn: 0.38, attack: 0.012, release: 0.6 },

  engine: {
    /** Drone pitch at cruise and at the top of the visual band. */
    baseHz: 44,
    maxHz: 108,
    /** Second oscillator, detuned in cents, so the drone beats slightly. */
    detuneCents: 9,
    /** Lowpass on the drone, opening with speed. */
    filterHz: [220, 1500],
    /** Rushing-air layer: bandpass over noise, also opening with speed. */
    airHz: [320, 2100],
    airGain: [0.05, 0.2],
    /** Drone gain at cruise and at max speed. */
    gain: [0.09, 0.24],
    /** Seconds the drone takes to follow a change in speed. */
    glide: 0.28,
  },

  music: {
    /** Beats per minute at cruise and at max speed. */
    bpm: [88, 116],
    /** Scheduler lookahead and tick, seconds. */
    lookahead: 0.15,
    tickSeconds: 0.025,
    /** Root note of each bar, as a frequency in hertz. A minor, four bars. */
    roots: [55, 43.65, 65.41, 49],
    /** Minor pentatonic, semitone offsets from the root. */
    scale: [0, 3, 5, 7, 10, 12, 15],
    steps: 8,
    /**
     * Octave of each part above the bar root. A phone speaker reproduces
     * almost nothing below about 400Hz, so the parts sit an octave or two
     * higher than the theory wants: a bass at 55Hz is a bass nobody hears.
     */
    octaves: { bass: 2, pad: 4, arp: 8, sparkle: 16 },
    bassGain: 0.24,
    padGain: 0.07,
    arpGain: [0.075, 0.13],
    /** The octave above the arp, added as the run gets fast. */
    sparkleGain: 0.045,
    hatGain: [0.016, 0.045],
    /** How much of the music goes to the tail. */
    send: 0.26,
  },

  /**
   * A collision, in four layers, because that is what a crash is: the crack
   * of contact, the body of the mass behind it, the hull ringing, and the
   * debris coming off. A wreck is the same event scaled by `wreck`.
   */
  impact: {
    /** Contact. Bright, and over before you can think about it. */
    crack: { seconds: 0.085, gain: 0.4, from: 3200, to: 800 },
    /** The mass: a noise slam collapsing into a sub thump, both driven. */
    body: { seconds: 0.7, gain: 0.48, from: 1800, to: 70, subFrom: 155, subTo: 33, subGain: 0.6 },
    /**
     * The hull. Inharmonic ratios, not a chord: harmonic partials read as a
     * note being played, these read as metal being struck.
     */
    metal: { ratios: [1, 1.71, 2.43, 3.17, 4.41], baseHz: 152, seconds: 1.3, gain: 0.075 },
    /** Debris skittering off, scattered so no two hits are the same. */
    rubble: { count: 13, spread: 1.1, gain: 0.13, hz: [700, 5400], seconds: 0.09 },
    /** Wreck multipliers: louder, longer, lower, more debris. */
    wreck: { gain: 1.3, seconds: 1.55, pitch: 0.74, rubble: 1.5 },
    send: 0.5,
  },

  /**
   * A pass: the Doppler of something going by. The filter rises to `peak` as
   * it approaches and falls away behind, and the pan crosses with it.
   */
  whoosh: { q: 5.5, peakBias: 0.42, bodyGain: 0.5, send: 0.35 },

  /** Boost, slingshot and the burn: thrust you can hear winding up. */
  boost: {
    /** Seconds the soar takes at its smallest and at a FULL BURN. */
    seconds: [0.8, 1.9],
    /** Resonant sweep of the soar layer. */
    sweepHz: [180, 2600],
    q: 7,
    /** Sub under it. */
    subHz: [48, 150],
    subGain: 0.34,
    /** Detune of the two saws that make the body, in cents. */
    detuneCents: 14,
    gain: 0.3,
    send: 0.45,
  },

  /** FM bell, used for plasma and for anything that should ring, not beep. */
  bell: { ratio: 2.01, index: 340, seconds: 0.85, gain: 0.22, send: 0.4 },

  /** Thrust running out: a tick that quickens as the tank empties. */
  warning: { from: 0.34, minInterval: 0.3, maxInterval: 1.0, gain: 0.14, hz: 860 },
} as const;

export const SHARE = {
  width: 1080,
  height: 1350,
} as const;

export const SHIP = {
  /** Peak lateral speed on X the autopilot will swerve at. */
  lateralSpeed: 32,
  /** Peak vertical speed on Y. */
  verticalSpeed: 16,
  /** How sharply the ship reaches its target lateral velocity. */
  steerResponse: 9,
  /** How quickly the autopilot converges on its target X/Y. */
  autopilotResponse: 4.6,
  /** Slow weave while cruising, so the ship never flies a ruler line. */
  weaveAmplitudeX: 1.8,
  weaveAmplitudeY: 0.7,
  weaveRate: 0.35,
  /** Seconds a swerve target holds before the autopilot recentres. */
  swerveHoldSeconds: 0.9,
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
  modelLength: 4.4,
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
  offsetZ: 20.5,
  /** How much the camera drifts toward the ship's X. <1 lets the ship lead. */
  lateralFollow: 0.72,
  /** Positional damping. Higher = tighter, stiffer chase. */
  positionDamping: 4.2,
  /** How far ahead (on -Z) the camera aims. Makes steering read as intent. */
  lookAheadZ: 30,
  /**
   * How far above the ship the camera aims. Tilting the view up drops the
   * ship into the lower third of the frame, which is where it has to sit if
   * the question and its six squares are to own the top of the screen.
   */
  lookLift: 4.2,
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
  /** Speed streaks. Fade in with the visual speed ratio, see Starfield. */
  streakCount: [180, 110, 0],
  streakLength: 14,
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
  /** Arcade signal colours. */
  yellow: 0xffe03d,
  cyan: 0x4ff1ff,
  /** The anomaly glows violet, unlike any normal rock. */
  anomaly: 0xb28cff,
  /** Shield flash. */
  shield: 0x6fd6ff,
  /** Boost / slingshot heat. */
  boost: 0xff8a1f,
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
