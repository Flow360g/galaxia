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

/**
 * The launch countdown: 3, 2, 1, GO over the engines lighting.
 *
 * The run does not start because a timer somewhere ran out; it starts because
 * the player said READY and then watched it come. That is the whole job of
 * this -- the first cluster has a five second clock on it, and a player who
 * is still working out that the screen has started is already behind it.
 */
export const COUNTDOWN = {
  /** Seconds each of 3, 2 and 1 holds. */
  stepSeconds: 0.72,
  /** Seconds GO holds before it clears and the first prompt lands. */
  goSeconds: 0.54,
} as const;

/** How long the whole countdown, and therefore the intro, runs for. */
const COUNTDOWN_SECONDS = COUNTDOWN.stepSeconds * 3 + COUNTDOWN.goSeconds;

export const ENCOUNTER = {
  /**
   * Engines lighting before the first asteroid is called. This IS the
   * countdown: the numbers come down over the ship getting under way, and
   * GO clears exactly as the first prompt lands. Retune `COUNTDOWN` and the
   * two stay together.
   */
  introSeconds: COUNTDOWN_SECONDS,
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
   * left to hit, so the impulse lands soon after, with just enough of a beat
   * for the collect flash to register before the toast takes the band.
   */
  clearSeconds: 0.6,
  /** Seconds the outcome animation owns the screen after contact. */
  resolveSeconds: 1.5,
  /**
   * The toast carries the verdict, the right answer and a fact, and nothing
   * moves on until the player taps. This is only the beat before TAP TO
   * CONTINUE arms, so the tap that answered cannot skip its own verdict.
   */
  confirmArmSeconds: 0.7,
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
   * Extra seconds on the clock for the FIRST pick of a cluster only. Six
   * options and a prompt have to be read before the first tap; every pick
   * after it is read already, so those run on the plain five.
   */
  firstPickBonusSeconds: 2,
  /**
   * A breather after a plasma pod is collected, before the clock for the next
   * pick starts draining. Long enough to see what was banked.
   */
  collectPauseSeconds: 1.1,
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

/**
 * The SCORE: the number the player is actually playing for.
 *
 * Distance is still tracked and still the story the share card tells, but it
 * is a speedometer reading, and a speedometer is a poor anchor: nobody knows
 * whether 12,000 km is good. The score is fixed and countable instead. Every
 * encounter is worth the same base, the streak multiplies it in whole steps,
 * and a wrong answer docks a flat amount, so "1,180 out of 1,500" means the
 * same thing to everyone comparing runs.
 */
export const SCORE = {
  /** Points an encounter is worth at full marks, before the multiplier. */
  perEncounter: 100,
  /** Cluster: share of the base for 1, 2 and 3 plasma banked. */
  clusterShare: [0.3, 0.6, 1],
  /** Vector: share of the base for a direct hit and for a glancing hit. */
  vectorDirect: 1,
  vectorGlance: 0.5,
  /** Anomaly: share at full marks, and for a partial answer. */
  anomalyFull: 1,
  anomalyPartial: 0.5,
  /** Scanner score at or above which the anomaly is full marks. */
  anomalyFullAt: 0.8,
  /**
   * Multiplier by the streak carried INTO the encounter; the last value holds
   * for anything longer. Whole numbers on purpose: x2 is a thing a player can
   * hold in their head mid-run, x1.65 is not.
   */
  streakMultipliers: [1, 1, 2, 2, 3, 3, 3],
  /** Points docked for getting it wrong. A wreck costs double a collision. */
  penalty: { collision: 25, wreck: 50, timeout: 25 },
} as const;

/** The run's shields. Each wrong lane costs one; at zero, a miss is a wreck. */
export const SHIELDS = {
  perRun: 3,
} as const;

export const VECTOR = {
  /** Thrust budget per vector, by how many vectors have been flown this run. */
  thrustSeconds: [20, 16],
  /**
   * Alien hold Z, by vector number: it comes in closer the second time. Near
   * enough that the scout reads as a ship you are shooting AT rather than a
   * speck on the horizon.
   */
  holdFar: [-58, -44],
  /** How far above the corridor the scout holds station. */
  holdY: 3.2,
  /** Normalised error at or under which a lock is a DIRECT HIT. */
  perfectBand: 0.15,
  /** Strength of a glancing hit at the edge of tolerance (1.0 at the perfect band). */
  glanceFloor: 0.4,
  /**
   * Seconds the beam takes to reach the alien after lock. A shot is a shot:
   * it crosses the gap almost before the eye has it, and everything that
   * makes it read -- the muzzle, the recoil, the scout going up -- lands in
   * the same instant rather than spread over a lazy arc.
   */
  beamSeconds: 0.1,
  /**
   * Lock to contact when the shot is on target. Barely longer than the beam
   * takes to arrive, so the crack, the hit and the explosion are one event.
   */
  strikeSeconds: 0.16,
  /**
   * Lock to contact when the shot is NOT taken: the aim was wrong, our guns
   * stay quiet, and the scout takes this long to line up and fire back. The
   * silence is the point -- a beat of nothing coming from the ship before
   * the hull is hit.
   */
  returnDelaySeconds: 0.85,
  /**
   * How hard a miss lands. Error 1 is the edge of tolerance and costs
   * `severityFloor` of a full impact; error `severityFullAt` and beyond costs
   * all of it. Being a little wrong should not read the same as being wild.
   */
  severityFloor: 0.3,
  severityFullAt: 4,
  /** Fraction of the slider a NOVA scan leaves open around the truth. */
  novaWindow: 0.34,
  /** Slow drift of the scout, so its rest position is never the answer. */
  driftAmplitude: 6,
  driftRate: 0.23,
} as const;

export const WAYPOINT = {
  /** Seconds its beats take to play. It then waits for a tap like the toast. */
  seconds: 6,
  /** When the rating stamps in, and when the "entering" line lands. */
  ratingAt: 1.1,
  enteringAt: 4.0,
  /** Ambient field density during and after the waypoint, 0..1. */
  fieldDensity: 0.3,
  /** Plasma thresholds for a rating, checked from the top. S also needs every shield. */
  ratings: { S: 6, A: 4, B: 2 },
} as const;

export const LANDMARK = {
  /** Distance in front of the camera; must be < CAMERA.far. */
  depth: 300,
  /** Off to this side (camera X) and above the corridor. Portrait frames are
   *  narrow, so this sits the disc half in, half out of the right edge. */
  offsetX: 105,
  offsetY: 70,
  /** The sphere radius the model is normalised to. */
  radius: 55,
  /** Seconds to rise into view, and to sink out at the next stage. */
  riseSeconds: 4,
  sinkSeconds: 6,
  /** Slow spin, radians per second. */
  spin: 0.02,
  moonUrl: "/models/moon.glb",
  planetUrl: "/models/planet.glb",
} as const;

export const ALIEN = {
  modelUrl: "/models/alien.glb",
  /**
   * The hull, normalised to this long. The scout is the only thing the player
   * is aiming at for a whole encounter, so it is read at ship scale, not at
   * debris scale.
   */
  modelLength: 14,
  /** Where the warp-in starts on Z, and how long the run to station takes. */
  warpFromZ: -400,
  warpSeconds: 1.6,
  /**
   * The scout is lit, not cloaked: the hull is the whole point of it being
   * there. It holds at this opacity and breathes by `shimmer` either side, a
   * live engine rather than a field around the model.
   */
  holdOpacity: 0.92,
  shimmer: 0.08,
  cloakRate: 2.6,
  /** Slow roll and yaw of the scout on station, radians/sec. */
  idleSpin: 0.22,
  /** Seconds to slide to the truth and settle once the shot is away. */
  decloakSeconds: 0.3,
  /** A glancing hit: seconds of the spin, and how far it is knocked back. */
  glanceSeconds: 0.9,
  glanceKick: 7,
  /**
   * Return fire: seconds for the red beam to cross, and the warp-out run.
   * The scout's shot is as quick as ours -- the dread is in the beat before
   * it (`VECTOR.returnDelaySeconds`), not in a slow bolt.
   */
  returnFireSeconds: 0.18,
  /**
   * The scout's gun, as a transposition of the ship's. Under 1 is bigger and
   * further off: the same discharge from something you would rather not be
   * in front of.
   */
  gunPitch: 0.62,
  warpOutSeconds: 1.2,
  /** Seconds the hull takes to come apart on a kill. */
  destroySeconds: 0.9,
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
  /** Vector hits and the alien's return fire. */
  vector: {
    directShake: 1.0,
    glanceShake: 0.45,
    returnFireShake: 1.3,
    /** Firing: the recoil through the rig, and the lens kicking with it. */
    fireShake: 0.7,
    fireKick: 4.5,
    /** Salvage capsule flight time to the ship. */
    salvageSeconds: 0.6,
  },
  /** The waypoint: rating stamp shake and the alien warp flash. */
  waypoint: { ratingShake: 0.6, warpFlash: 1.2 },
  /**
   * MAXIMUM THRUST: all three lanes, the whole reactor dumped into the
   * engines at once. Raw plasma in the burn, more of it than the ship was
   * built for, and a rumble that reads as the hull not much liking it.
   *
   * This is the only outcome in the game that gets its own treatment, and it
   * is deliberately over the top; two plasma is a good burn, three is an
   * event.
   */
  overdrive: {
    /** Seconds the whole thing lasts. */
    seconds: 2.8,
    /** Fraction of that spent at full intensity before it eases off. */
    hold: 0.55,
    /** Plume length and width at the peak, as multipliers. */
    flameLength: 1.75,
    flameRadius: 1.5,
    /**
     * How far the flame's colour is dragged toward plasma at the peak, 0..1.
     * Deliberately short of 1: the fire should read as contaminated with
     * plasma, orange at the nozzle bleeding to pink and violet down the tail,
     * not as a plain magenta jet.
     */
    flameTint: 0.9,
    /** Sustained camera shake, and the slow roll that sells losing the line. */
    rumble: 0.75,
    rumbleRoll: 0.05,
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
  /** Bus levels. Master is what the mute toggle rides. */
  master: 0.8,
  musicBus: 0.38,
  sfxBus: 0.9,
  engineBus: 0.5,
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
  duck: { impact: 0.32, burn: 0.55, attack: 0.04, release: 0.6 },

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
    airGain: [0.05, 0.22],
    /** Drone gain at cruise and at max speed. */
    gain: [0.1, 0.26],
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
    bassGain: 0.26,
    padGain: 0.055,
    arpGain: [0.03, 0.07],
    hatGain: [0.01, 0.035],
    /** How much of the music goes to the tail. */
    send: 0.22,
  },

  /**
   * A collision, in four layers, because that is what a crash is: the crack
   * of contact, the body of the mass behind it, the hull ringing, and the
   * debris coming off. A wreck is the same event scaled by `wreck`.
   */
  impact: {
    /** Contact. Bright, and over before you can think about it. */
    crack: { seconds: 0.085, gain: 0.5, from: 3200, to: 800 },
    /** The mass: a noise slam collapsing into a sub thump, both driven. */
    body: { seconds: 0.7, gain: 0.55, from: 1800, to: 70, subFrom: 155, subTo: 33, subGain: 0.6 },
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
   * The launch countdown. Three pips and a GO: the pips are one clean tone
   * with a click on the front, the GO is the same note an octave up with a
   * fifth over it and the room behind it, so the last one reads as a start
   * rather than a fourth pip.
   */
  countdown: {
    pipHz: 660,
    goHz: 1320,
    seconds: 0.16,
    goSeconds: 0.5,
    gain: 0.2,
    send: 0.35,
  },

  /**
   * A pass: the Doppler of something going by. The filter rises to `peak` as
   * it approaches and falls away behind, and the pan crosses with it.
   */
  whoosh: { q: 5.5, peakBias: 0.42, bodyGain: 0.5, send: 0.35 },

  /**
   * The ship's gun. Not a pew: a discharge.
   *
   * The crack is the capacitor letting go and is over in a fortieth of a
   * second -- it is the whole reason the shot reads as sudden. Under it a
   * pair of detuned saws fall from the top of their range to the bottom in
   * the same breath, driven so they tear, and a sub lands with them so the
   * hull feels it. The bolt itself is noise sweeping down and out across the
   * stereo field, which is the sound of it leaving.
   */
  laser: {
    crack: { seconds: 0.025, gain: 0.5, hz: [8200, 2600], q: 1.1 },
    body: { seconds: 0.26, gain: 0.3, hz: [2400, 180], detuneCents: 22, q: 9 },
    sub: { seconds: 0.3, gain: 0.26, hz: [160, 40] },
    bolt: { seconds: 0.34, gain: 0.22, hz: [5200, 700], q: 3.2, pan: [0, 0.45] },
    send: 0.45,
    duck: 0.3,
  },

  /**
   * Something going up at a distance: the scout when the shot lands. Sharper
   * and drier at the front than a hull crash, because it is happening over
   * there, and with most of its length in the tail -- the room is what says
   * "far away", and there is nothing else out here to say it.
   */
  blast: {
    crack: { seconds: 0.04, gain: 0.34, hz: [6400, 1500] },
    body: { seconds: 0.55, gain: 0.34, hz: [1800, 120], q: 1.4 },
    sub: { seconds: 0.6, gain: 0.3, hz: [110, 32] },
    /** Pieces coming off, scattered so no two blasts are the same. */
    rubble: { count: 9, spread: 0.55, gain: 0.1, hz: [900, 4800], seconds: 0.1 },
    send: 0.7,
    duck: 0.42,
  },

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
} as const;

/**
 * The hangar: every hull the player can fly, in display order.
 *
 * One entry is one ship. The geometry fields are per-model facts, tuned by
 * eye against the loaded GLB, and the unlock field is the only thing that
 * decides whether a hull is available:
 *
 *   - `default`  always flyable, and what a new player launches in;
 *   - `runs`     earned, once `runs` runs are on file;
 *   - `purchase` limited edition, bought once for `priceCents`.
 *
 * The copy lives here with the numbers on purpose: a hull is a name, a
 * silhouette and a scale factor, and splitting those across two files is how
 * they drift apart. `lib/game/ships.ts` reads this and nothing else.
 *
 * Every hull flies identically. A ship is a skin, so a shared daily round
 * stays comparable between two players however they have theirs painted.
 */
export const SHIPS = [
  {
    id: "cinder",
    name: "Cinder VII",
    /** Shown under the name in the bay. */
    className: "Interceptor",
    blurb:
      "Standard issue, rust-plated, three owners before you. Flies like it remembers every one of them.",
    /** URL of the hull model. Served from /public. */
    modelUrl: "/models/spaceship.glb",
    /** The loaded model is scaled so its longest axis measures this. */
    modelLength: 4.4,
    /**
     * Extra Y rotation applied to the model so its nose faces -Z (the
     * direction of travel). The Quaternius ships are authored nose toward +Z.
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
    unlock: { kind: "default" },
  },
  {
    id: "flamingo",
    name: "Neon Flamingo",
    className: "Long-range racer",
    blurb:
      "All wing and no armour. Painted so the thing that hits you knows exactly what it hit.",
    modelUrl: "/models/flamingo.glb",
    /** Wider than it is long, so it normalises to a bigger figure than Cinder. */
    modelLength: 5.2,
    modelYaw: Math.PI,
    nozzles: [
      { x: -0.5, y: 0.0, z: 2.1 },
      { x: 0.5, y: 0.0, z: 2.1 },
    ],
    unlock: { kind: "runs", runs: 5 },
  },
  {
    id: "seraph",
    name: "White Seraph",
    className: "Limited edition",
    blurb:
      "Two cores lit, four dark, and a spire that was not on the schematics. No record of who built it.",
    modelUrl: "/models/seraph.glb",
    modelLength: 4.8,
    /** Authored nose toward +X, so it needs a quarter turn rather than a half. */
    modelYaw: Math.PI / 2,
    /**
     * Its engine cluster is six rings packed close together, and six plumes
     * at this flame length is a wall of fire with a ship somewhere behind it.
     * Two of them are lit, which is also what the blurb claims.
     */
    nozzles: [
      { x: -0.5, y: 0.05, z: 1.95 },
      { x: 0.5, y: 0.05, z: 1.95 },
    ],
    unlock: { kind: "purchase", priceCents: 499, currency: "USD" },
  },
] as const;

/**
 * The ship bay: the lit deck the hull turns on when the player views it.
 *
 * Its own little scene, not the flight one. Same rules apply (Lambert, flat,
 * no shadows, counts from here) but there is no treadmill and no ship state:
 * one hull, one slow rotation, one key light.
 */
export const HANGAR = {
  /** Seconds for one full revolution of the hull. Slow enough to study. */
  revolveSeconds: 18,
  /** Hull tilt toward the camera, radians, so the deck view is not side-on. */
  tilt: 0.22,
  /**
   * Framing. The bay measures the hull it loaded and pulls the camera back to
   * fit its bounding sphere, so a wide hull and a long one both fill the frame
   * and neither hangs off the side of a portrait phone.
   *
   * `framePadding` is the breathing room around that sphere, `cameraLift` is
   * the camera height as a fraction of the distance it ends up at, and the
   * FOV is vertical, as three.js counts it.
   */
  fov: 34,
  framePadding: 1.26,
  cameraLift: 0.18,
  /** Aim offset above the hovering hull, so it sits centred in the frame. */
  lookY: 0.1,
  /** The hull hovers this far above the deck, and bobs by this much. */
  hoverY: 0.75,
  bobAmplitude: 0.07,
  bobRate: 0.9,
  /** Deck plate size and the grid drawn on it. */
  deckSize: 34,
  gridDivisions: 24,
  /** Radius of the ring of pad lights let into the deck, and how many. */
  padRadius: 4.3,
  padCount: 10,
  padSize: 0.3,
  /**
   * Gantry pylons: how far out to either side, how tall, how thick. Framing
   * fits the hull, so these sit just inside the frame edges at the nearest
   * hull and a little further in at the biggest one.
   */
  gantryX: 3.9,
  gantryHeight: 5.2,
  gantryDepth: 0.5,
  /** The rear bulkhead: how far back it sits and how high it stands. Kept
      low so the bay still opens onto space above it. */
  bulkheadZ: -15,
  bulkheadHeight: 7,
  /** Lit rail along the top of the bulkhead. The bay's one horizon line. */
  lintelHeight: 0.16,
  /** Light levels: key from above front, fill from the deck, rim from behind. */
  keyIntensity: 1.25,
  fillIntensity: 0.5,
  rimIntensity: 0.9,
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
  /**
   * How fast the rig eases in and out of a lane lock. The lock swings the
   * camera's whole job around -- from following the ship's X to holding the
   * centreline -- and flipping that in one frame snaps the aim, which reads
   * as a glitch the instant a lane is tapped. Blending it over a few frames
   * makes the same change invisible. Higher = quicker, harder changeover.
   */
  laneLockResponse: 6.5,
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
  /**
   * Raw plasma, as it looks coming out of the engines rather than sitting in
   * the reactor: hot pink at the nozzle, cooling through violet.
   */
  plasma: 0xff4fd8,
  plasmaDeep: 0x8a3cff,
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
  /**
   * A loaded model with more meshes than this is merged into one, with its
   * material colours baked into vertices. Above the threshold a hull costs a
   * draw call per part, and the whole scene has sixty to spend.
   */
  mergeMeshesAbove: 8,
} as const;
