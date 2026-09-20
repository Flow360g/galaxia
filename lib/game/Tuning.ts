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
  /** Radius of an encounter asteroid. */
  radius: 4.6,
  /** Vertical offset of the encounter rock so it sits in the ship's eyeline. */
  offsetY: 0.6,
  /** Lateral swerve when threading past, and the tighter skim on a slingshot. */
  threadOffsetX: 9.5,
  skimOffsetX: 6.6,
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
  /**
   * The boost gauge: the reactor drawn as a speedometer at the bottom left of
   * the panel. The needle climbs a notch per plasma and sweeps back to the
   * peg as the boost is fired, so the charge reads as something held and then
   * spent rather than a bar that blinks out.
   */
  gauge: {
    /** Sweep of the dial in degrees, symmetric about straight up. */
    sweepDegrees: 244,
    /** Seconds the needle takes to settle on a newly collected notch. */
    settleSeconds: 0.42,
    /** Seconds the gauge takes to empty once the boost is fired. */
    drainSeconds: 1.2,
  },
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
  /**
   * Where the boulder is when the verdict lands. The strike ends with the
   * rock's leading face this far INTO the nose, so its centre sits at
   * `SHIP.noseZ - rockRadius + strikeOverlap`: a hit, not a kiss, and never
   * a hull swallowed to the cockpit before the crack is heard. It used to run
   * to a point behind the ship's origin and the hull flew half way into it.
   */
  strikeOverlap: 0.8,
  /**
   * The struck boulder collapses over this long, and drifts aft at this
   * fraction of world speed while it does. The debris burst carries the
   * motion; the remnant only has to be gone before it reaches the canopy.
   */
  shatterSeconds: 0.25,
  shatterDrift: 0.35,
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
 * and a wrong answer docks a flat amount, so "1,880 out of 2,400" means the
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
  /**
   * Multiplier by the streak carried INTO the encounter; the last value holds
   * for anything longer. Whole numbers on purpose: x2 is a thing a player can
   * hold in their head mid-run, x1.65 is not.
   */
  streakMultipliers: [1, 1, 2, 2, 3, 3, 3],
  /**
   * WHERE ON EARTH is the finale and is worth double a normal encounter: it is
   * the longest, the hardest, and the one the whole run builds toward. Two
   * sites are flown, so the station is worth 400 of a perfect run before
   * multipliers.
   */
  earthBase: 200,
  /**
   * What working the feed costs, as a share of `earthBase`. Intel is the
   * expensive one because someone else is handing you the answer; the optics
   * dial is cheap and reversible because the player is working their own
   * instrument. Tuned at /satellite-mock: 25 and 10 against a base of 200.
   */
  earthIntelCost: 0.125,
  earthOpticsCost: 0.05,
  /** However much was bought, a correct call is never worth less than this. */
  earthFloor: 0.25,
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
  /**
   * Where the approach starts, in the same units as `depth`. It is a
   * projection figure only: nothing is ever placed out there, because
   * perspective depends on nothing but X/Z, Y/Z and an angular size of r/|Z|,
   * so the disc stays at `depth` and its offsets and scale carry the distance.
   * That keeps it inside `CAMERA.far` however far away it reads.
   */
  farDepth: 2600,
  /** Where it ends up once the ship has flown past it. */
  passDepth: 150,
  /** Seconds to come in from the distance, and to slide past at the next stage. */
  approachSeconds: 4,
  passSeconds: 6,
  /** Slow spin, radians per second. */
  spin: 0.02,
  moonUrl: "/models/moon.glb",
  planetUrl: "/models/earth.glb",
} as const;

/**
 * WHERE ON EARTH: the relay station. Two appearances, one model.
 *
 * On the flight it comes up out of the distance dead ahead, projected the
 * way the landmark is (see `LANDMARK.farDepth`), and the ship throttles back
 * to come alongside. Aboard, it hangs in the foreground of its own scene
 * with the docking module aimed at Earth.
 */
export const STATION = {
  /**
   * Seconds to name a site once the feed is up. Longer than a lane because the
   * player is reading a picture, not four words, and may work the optics first.
   * The clock is held until the imagery has actually arrived.
   */
  answerSeconds: 40,
  /** Longest the clock waits for tiles before starting regardless. */
  feedGraceMs: 6000,
  modelUrl: "/models/station.glb",
  /** Distance in front of the camera; must be < CAMERA.far. */
  depth: 300,
  /** Where the approach starts, a projection figure only, like the landmark's. */
  farDepth: 3200,
  /**
   * Camera-space offsets at `depth`. Dead ahead on X; below centre on Y so
   * it sits in the gap between the HUD band and the ship in the lower third.
   */
  offsetX: 0,
  offsetY: -34,
  /** The model's longest axis at `depth`. */
  length: 120,
  /** Yaw so the dish and the solar wings read side-on, like a station should. */
  yaw: 0.35,
  /** Slow roll about the docking axis, radians per second. */
  spin: 0.04,
  /** Seconds from first sight to alongside. Arrival is this timer, never an asset. */
  approachSeconds: 7,
  /** Ambient rock density on the approach: a station does not sit in a belt. */
  fieldDensity: 0.05,
  /** The cruise floor while docking, as a fraction of normal. See Flight.throttle. */
  dockThrottle: 0.12,

  /** Aboard: the model's longest axis, in the orbit scene's units. */
  dockedLength: 9,
  /**
   * Where it hangs, with Earth at `EARTH.position`. Below the band's third
   * of the frame, above Earth, so the docking module reads as aimed down at
   * the planet rather than off the edge of the screen.
   */
  dockedPosition: [0.4, -6.5, 0] as [number, number, number],
  /** Roll about the docking axis while aboard, radians per second. */
  dockedSpin: 0.06,
  /**
   * The docking module lies on the model's tube axis, and the loader centres
   * the model on its bounds, which the solar wings drag off that axis. This
   * is how far, as a fraction of the model length, to slide the model back so
   * the tube axis passes through the pivot the station is aimed with.
   */
  axisOffset: 0.156,
} as const;

/** Earth, as seen from the station. */
export const EARTH = {
  modelUrl: "/models/earth.glb",
  /** Diameter in the orbit scene's units. */
  diameter: 10,
  /**
   * Centre: below the station and well behind it, so it reads as a planet
   * in the distance with the docking module aimed at it, not a wall.
   */
  position: [1.2, -15.5, -2] as [number, number, number],
  /** Radians per second. */
  spin: 0.025,
  /** Axial lean, radians. Earth's own is 23.4 degrees. */
  tilt: 0.41,
  /** Atmosphere: two additive shells, inside-out and outside, as scale and opacity. */
  haloInner: { scale: 1.035, opacity: 0.22 },
  haloOuter: { scale: 1.09, opacity: 0.08 },
} as const;

/** The orbit scene's camera and sun. */
export const ORBIT = {
  fov: 42,
  near: 0.1,
  /** Far enough to hold the backdrop plane at `BACKDROP.depth`. */
  far: 600,
  /** Where the camera sits, and what it looks at. Side-on to the station, a little above it. */
  cameraPosition: [-7, -4, 31] as [number, number, number],
  lookAt: [0.3, -8.6, 0] as [number, number, number],
  /**
   * The composition is authored wide. In portrait the camera backs off along
   * its own line until the frame is at least this many degrees across.
   */
  minHorizontalFov: 28,
  /** A slow drift so the frame is never a still: amplitude in units, rate in rad/s. */
  driftAmplitude: 0.35,
  driftRate: 0.18,
  /** The sun: warm, from the side, so Earth has a terminator and the station a dark face. */
  sunPosition: [18, 8, 6] as [number, number, number],
  sunIntensity: 2.4,
  fillIntensity: 0.55,
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
    /** Docking never strikes the ship. */
    dock: 0,
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

  /**
   * The bed. One generative loop, two moods: `cruise` is the run, `dread` is
   * the alien stage. The scheduler settings are shared; everything that
   * decides what the loop SOUNDS like lives in a mood table, so turning the
   * music ominous is a change here and a `setMood` call, never a second
   * scheduler.
   *
   * The dread recipe, so a later tune keeps the intent: drop an octave and
   * slow the tempo for weight, put the flat second and the tritone in the
   * scale for menace, detune the pad hard enough to beat and stack a minor
   * second on it, mute the hat so the pulse loses its arcade tick, darken and
   * thin the arp so the melody reads as a distant signal rather than a tune,
   * halve the arp density so there is space to be uneasy in, and hold a sub
   * under the bar.
   */
  music: {
    /** Scheduler lookahead and tick, seconds. Shared by every mood. */
    lookahead: 0.15,
    tickSeconds: 0.025,
    /** Steps per bar. Eighth notes, so a bar is four beats. */
    steps: 8,
    /**
     * Octave of each part above the bar root. A phone speaker reproduces
     * almost nothing below about 400Hz, so the parts sit an octave or two
     * higher than the theory wants: a bass at 55Hz is a bass nobody hears.
     * Shared by every mood; a mood moves its roots, not its octaves.
     */
    octaves: { bass: 2, pad: 4, arp: 8, sparkle: 16 },
    /** How much of the music goes to the tail. */
    send: 0.26,

    /** The bed the run is flown to: A minor, four bars, arcade. */
    cruise: {
      /** Beats per minute at cruise and at max speed. */
      bpm: [88, 116],
      /** Root note of each bar, as a frequency in hertz. A minor, four bars. */
      roots: [55, 43.65, 65.41, 49],
      /** Minor pentatonic, semitone offsets from the root. */
      scale: [0, 3, 5, 7, 10, 12, 15],
      bassGain: 0.24,
      padGain: 0.07,
      arpGain: [0.075, 0.13],
      /** The octave above the arp, added as the run gets fast. */
      sparkleGain: 0.045,
      hatGain: [0.016, 0.045],
      /** Lowpass on the arp at cruise and at max speed. */
      arpFilterHz: [1600, 4600],
      /** Detune of the pad pair, in cents. */
      padDetune: 6,
      /** Semitones of a third pad voice against the chord. 0 is none. */
      padSecond: 0,
      /** A sub held under the bar. 0 is none. */
      subGain: 0,
      /** Play the arp every Nth step. 1 is every step. */
      arpEvery: 1,
    },

    /**
     * Phase 2: the scout is out there. The same bed, lower and wrong. Its
     * gains sit in the same ratio to cruise as when it was written, before
     * the music level fix; it has not been listened to since. Tune by ear.
     */
    dread: {
      bpm: [62, 78],
      /** D1, C#1, D1, C1: a semitone crawl that never resolves. */
      roots: [36.71, 34.65, 36.71, 32.7],
      /** Phrygian flat second plus the tritone. */
      scale: [0, 1, 5, 6, 7, 10, 12],
      bassGain: 0.28,
      padGain: 0.095,
      arpGain: [0.03, 0.055],
      /** No lift in dread. */
      sparkleGain: 0,
      hatGain: [0, 0.008],
      arpFilterHz: [500, 1400],
      padDetune: 26,
      padSecond: 1,
      subGain: 0.1,
      arpEvery: 2,
    },
  },

  /**
   * The scout warping in. Three layers, like every other impact in here: a
   * sub falling away under it, an inharmonic cluster that rings rather than
   * chimes, and a noise swell rushing in behind. It lands on the warp flash
   * and covers the seam where the music changes key.
   */
  alienArrival: {
    /** The sub: where it starts, where it falls to, and how long it takes. */
    subFrom: 90,
    subTo: 28,
    subSeconds: 2.2,
    subGain: 0.42,
    /** Inharmonic partials, as ratios of `ringHz`. Not a chord. */
    ringHz: 196,
    ringRatios: [1, 1.41, 2.09],
    ringSeconds: 2.6,
    ringGain: 0.1,
    /** The rush: noise sweeping up behind the sub. */
    rushFrom: 300,
    rushTo: 2600,
    rushSeconds: 1.5,
    rushGain: 0.16,
    send: 0.75,
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

  /**
   * Docking: an airlock, not a hit. The clamps taking the hull, the hull
   * ringing off them on one low inharmonic partial, and the seal hissing
   * after. Ducks the bed the way an impact does, since a mass has just met
   * a bigger one.
   */
  dock: {
    clamp: { seconds: 0.22, gain: 0.42, hz: [900, 90], q: 1.6 },
    sub: { seconds: 0.5, gain: 0.3, hz: [90, 38] },
    ring: { hz: 146, seconds: 1.6, gain: 0.16, delay: 0.05, ratio: 2.76, index: 260 },
    hiss: { seconds: 1.4, gain: 0.09, hz: [3200, 900], q: 0.9, attack: 0.15, delay: 0.3 },
    send: 0.6,
    duck: 0.35,
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
  /**
   * Z of the nose, ahead of `z`. Where beams leave from and where a boulder
   * has to be to count as touching the hull. A hull is normalised to its
   * catalogue length and centred, so this is about half the longest one.
   */
  noseZ: -2.6,
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
/**
 * The ship bay: a launch bay inside the carrier the run deploys from.
 *
 * Its own little scene, not the flight one. Same material rules (Lambert, flat
 * shading, no shadows, counts from here) but there is no treadmill and no ship
 * state: a frame here is a rotation, a bob and whatever the player is dragging.
 *
 * The bay is allowed to be SHARPER than the flight. The flight budget exists
 * to protect an asteroid field, a starfield and two exhaust plumes; the bay
 * draws one hull and a room, so it renders at the device's real pixel ratio
 * (capped) with antialiasing on, and only its detail COUNTS come off the
 * quality tier.
 */
export const HANGAR = {
  /** Seconds for one full revolution of the hull. Slow enough to study. */
  revolveSeconds: 22,
  /** Hull tilt toward the camera, radians, so the deck view is not side-on. */
  tilt: 0.18,
  /**
   * Framing. The camera is a fixture of the room, not of the hull: it stands
   * back far enough to hold a sphere of `frameRadius` inside the clear part
   * of the frame and aims at a fixed point over the pad, so paging through
   * the catalogue changes the ship and nothing else. It used to fit each
   * hull's own bounding sphere and aim at its centre, and every switch
   * dollied in or out and pitched up or down; a bay that zooms on every page
   * reads as broken. A hull larger than `frameRadius` still fits: the bay
   * frames the larger of the two.
   *
   * `framePadding` is the breathing room around that sphere, `cameraLift` is
   * the camera height as a fraction of the distance it ends up at, and the
   * FOV is vertical, as three.js counts it.
   */
  /** Bounding radius the camera frames for, in world units. The White
      Seraph, spire and all, is the largest hull in the catalogue and measures
      3.68 on the bay's own rig; the others sit at 3.1 and 3.47. Read
      `galaxiaBay.debugState().hullRadius` under `?debug=1` when adding one. */
  frameRadius: 3.7,
  /** Height above the PAD TOP the camera aims at. */
  aimY: 1.1,
  /**
   * A wider lens than a showroom strictly needs, because the bay is half the
   * point: at 34 degrees the hull filled the frame and the room around it was
   * a rumour off both edges.
   */
  fov: 46,
  framePadding: 1.05,
  cameraLift: 0.12,
  /**
   * How much of the overlay's height to lift the hull clear by. At 1 the hull
   * sits fully above the type but the camera pitches down into the deck and
   * the bay stops reading as a room; a bit under a half is the compromise.
   */
  frameBias: 0.45,
  /**
   * How fast the camera slides to a new framing. A hull switch no longer
   * changes it, but the overlay growing for the checkout panel does, and
   * easing turns that into a dolly rather than a cut.
   */
  frameEaseRate: 7,
  /** A new hull fades and scales in over this, so a switch is not a pop. */
  swapFadeSeconds: 0.28,
  swapFromScale: 0.94,
  /**
   * The hull hovers this far above the PAD, measured from its own underside
   * rather than from its bounding centre. A hull's centre means nothing: the
   * Seraph's is dragged up by a spire and the Cinder's sits mid-fuselage, so
   * centring both at one height leaves one buried and the other in orbit.
   */
  hoverGap: 0.28,
  /** Fallback turntable height, used until a hull has been measured. */
  hoverY: 0.5,
  bobAmplitude: 0.06,
  bobRate: 0.8,

  /**
   * Its own pixel ratio, not the flight tier's. A phone on the low tier
   * renders the flight at DPR 1 to protect the frame; the bay has the budget
   * to spare and a soft hull is the thing players notice first.
   */
  dprCap: 2,

  /**
   * Drag to orbit. Horizontal travel is yaw, vertical is pitch, both in
   * radians per CSS pixel, so the hull tracks the thumb at any density.
   */
  dragYawPerPixel: 0.009,
  dragPitchPerPixel: 0.006,
  /** Pitch is clamped: past these the hull reads as a diagram, not a ship. */
  pitchMin: -0.45,
  pitchMax: 0.75,
  /** Idle seconds after a drag before the turntable picks up again, and the
      seconds it takes to reach full speed once it does. */
  resumeSeconds: 2.4,
  resumeEaseSeconds: 1.6,

  /**
   * The bay. Concrete deck, a landing dais, ribbed walls either side, a
   * lit ceiling and an open door aft looking out at space.
   */
  /** The deck sits just under the hull: the hover is meant to read as a hand's
      width of daylight, not as a ship stuck to the ceiling of the bay. */
  deckY: -0.85,
  deckSize: 34,
  /** How many times the concrete tiles across the deck. Tiled rather than
      stretched, or the slab seams smear at this camera distance. */
  deckTiles: 5,
  /** The markings decal laid over the concrete, and how wide a patch it covers. */
  markingsSize: 17,
  /** The dais the hull hovers over: radius, height, and its lit edge. */
  padRadius: 2.4,
  padHeight: 0.26,
  padRingHeight: 0.06,
  /** Fake contact shadow on the dais. Real shadows are banned; this is a
      radial gradient on a plane, and it is most of what sells the hover. */
  shadowRadius: 2.1,
  shadowOpacity: 0.55,
  /** Side walls: how far out, how tall, how far fore and aft they run. */
  wallX: 7.6,
  wallHeight: 9,
  /** Walls and ceiling run back past the camera, or the frame shows a bar of
      empty space over the near end of the bay. */
  wallDepth: 48,
  wallZ: 2,
  /** Structural ribs up the walls, by quality tier. */
  ribCounts: [9, 7, 5],
  ribWidth: 0.5,
  ribDepth: 0.55,
  /** Ceiling height, and the floodlight panels let into it, by tier. */
  ceilingY: 9.6,
  ceilingDepth: 60,
  floodCounts: [7, 5, 4],
  floodSize: 2,
  floodSpacing: 4.4,
  floodIntensity: 0.35,
  /** The ceiling is lit from nowhere, so it carries its own dim glow rather
      than reading as a black bar across the top of the frame. */
  ceilingEmissive: 0x1b2230,
  /** The door aft: where the bulkhead stands and the size of the hole in it. */
  doorZ: -16,
  doorWidth: 11,
  doorHeight: 6.2,
  /** Rail of light around the door opening. */
  doorRail: 0.16,
  /** The space plane seen through the door, and how far behind it sits. */
  voidZ: -23,
  voidSize: 42,

  /**
   * The light rig, and the reason a white panel used to read pink.
   *
   * The key and the fill are both neutral white and do the work; the ambient
   * hemisphere is a cool grey rather than the saturated blue it was, which is
   * what tinted every pale surface. The cyan rim survives at a fraction of
   * its old strength: enough to edge the silhouette off the bulkhead, not
   * enough to colour a wing.
   */
  keyIntensity: 1.45,
  keyPosition: [-4, 7, 6],
  fillIntensity: 0.55,
  fillPosition: [5, 1.5, 5],
  ambientIntensity: 0.45,
  ambientSky: 0xdfe7f2,
  ambientGround: 0x2a3140,
  rimIntensity: 0.25,
  rimPosition: [-3, 4, -8],

  /** Deck, wall and dais tones. Concrete, not cabinet paint. */
  deckColor: 0x4a4e57,
  wallColor: 0x3c414b,
  ribColor: 0x4f555f,
  padColor: 0x5a6068,
  doorFrameColor: 0x2e333c,
  floodColor: 0xdbe4f5,

  /** Canvas texture resolution by quality tier. */
  textureSizes: [1024, 512, 512],
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
  /**
   * Violet: contact. The alien scout, and the relay station of WHERE ON
   * EARTH. Nothing else in the game is this colour.
   */
  contact: 0xb28cff,
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
