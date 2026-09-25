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
  /**
   * Extra seconds for a PICK ONE question. Four answers and a BOOST decision
   * to make before the tap, and testers were running out of clock deciding
   * whether to arm it. The half on top is reading time: at a flat six the
   * prompt was still being read when the clock was already low.
   */
  mcqBonusSeconds: 1.5,
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
   * pick starts draining. Long enough to see what was banked. The same beat
   * follows a boulder the cluster's own shield took.
   */
  collectPauseSeconds: 1.1,
  /**
   * The read screen. A cluster opens on its question alone, no lanes and no
   * pick clock, with a READY button and this many seconds before the lanes
   * come up on their own. The first test player lost the first cluster to a
   * clock they had not noticed start; nobody should be timed on reading.
   */
  readSeconds: 10,
  /**
   * Shields a cluster carries of its own, on top of the run's. A wrong lane
   * costs one and the plasma stays banked; with none left the next wrong lane
   * loses the cluster for zero points. A cluster never docks points.
   */
  shields: 1,
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
 * and most wrong answers simply score nothing, so "1,240 out of 1,800" means
 * the same thing to everyone comparing runs.
 *
 * Penalties are rare on purpose. The first version docked every miss and the
 * first test player finished on zero: a run that ends at nothing is a run
 * nobody shares. Points now come off only where the player chose the risk,
 * a boosted lane or a wild shot at the scout.
 */
export const SCORE = {
  /**
   * Points an encounter is worth at full marks. WHERE ON EARTH aside this is
   * every encounter, so a two-encounter phase is worth 400.
   */
  perEncounter: 200,
  /** Cluster: share of the base for 1, 2 and 3 plasma banked. */
  clusterShare: [0.3, 0.6, 1],
  /*
   * Vector points are not a share table: they fall in a straight line with
   * the notches between the guess and the answer. See `VECTOR.zeroAt`.
   */
  /**
   * General knowledge: share of the base for a right answer WITHOUT boost.
   * Boost, pressed before the answer, lifts it to the full base; a wrong
   * boosted answer costs `penalty.laneBoosted`, and a wrong plain answer
   * costs nothing. The perfect run in `maxScoreFor` assumes every lane was
   * boosted, so the total stays fixed.
   */
  laneShare: 0.5,
  /**
   * Multiplier by the streak carried INTO the encounter. Flat now: a streak
   * lifts the ship's speed (see `FLIGHT.streakCruiseGain`), it no longer
   * scales the score. It used to ramp 1,1,2,2,3,3,3, which quietly made the
   * phases worth 200, 400, 600, 600 by position alone. Even phases are what
   * the game wants, and evenness with a ramping multiplier is impossible while
   * every encounter shares a base. Left as an array so scaling is one edit off.
   */
  streakMultipliers: [1],
  /**
   * WHERE ON EARTH is the heavier finale: 300 a site, so its two sites are
   * worth 600 against 400 for every other phase. It was level with the rest
   * for a while, and double before that; 300 keeps the finale the biggest
   * phase without making it half the run the way the old streak ramp did.
   */
  earthBase: 300,
  /**
   * What a hint costs, as a share of `earthBase`. The zoom dial is free: the
   * player is working their own instrument, and charging for it made testers
   * leave the view alone rather than read it.
   */
  earthIntelCost: 0.15,
  /** However much was bought, a correct call is never worth less than this. */
  earthFloor: 0.25,
  /**
   * Points docked for getting it wrong, by where it went wrong. A cluster
   * never docks: its second wrong lane is worth zero and no less. A general
   * knowledge lane docks only with Boost pressed first. The scout and the
   * station keep the flat dock; a wreck (no shields left) costs double.
   */
  penalty: { cluster: 0, lane: 0, laneBoosted: 25, collision: 25, wreck: 50, timeout: 25 },
} as const;

/**
 * The end of the run: the finish cue, and the tally that reads the score out.
 *
 * A run used to end on four quiet notes and a list that faded in, which is a
 * flat way to hand someone the number they played for. The finale now scales
 * with how well the run went, and both the sound and the tally screen read the
 * same tier (`finaleTier` in `Score.ts`), so they can never disagree about
 * whether that was a good day.
 */
export const FINALE = {
  /**
   * Share of the perfect run each tier needs. Full marks is its own tier above
   * these and needs no threshold: it is every point there was.
   */
  tiers: { legendary: 0.85, great: 0.6, good: 0.3 },
  /**
   * Milliseconds from the tally mounting to RUN COMPLETE slamming in. The
   * finish cue's riser is timed off the same figure so its impact lands with
   * the heading.
   */
  introMs: 950,
  /** Milliseconds between one line landing and the next. */
  lineMs: 430,
  /** Extra pause after a stage's last line, while its subtotal stamps in. */
  stageMs: 360,
  /** How long a line's points take to roll up from zero. */
  countMs: 340,
  /** Pause after the last stage before the total stamps. */
  totalMs: 650,
  /** Fewest milliseconds between two count-up ticks, so a roll never buzzes. */
  tickEveryMs: 60,
  /** Cells in the meter under the total. Twenty, like the share card's rows. */
  meterCells: 20,
  /** Confetti pieces on the top two tiers. Pure CSS, so cheap on a phone. */
  confetti: 28,
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
  /**
   * The slider is a ruler of `notches` steps, straight from the question's
   * `min` to its `max`, and the guess and the answer are both read off it to
   * the nearest notch. The gap between them is the whole score.
   *
   * It used to be scored against the ANSWER ("33% off") while the player aimed
   * on the SLIDER, which made a wide range harder rather than more forgiving
   * and turned every calendar year into a free hit (5% of 1913 is a century).
   * Scoring on what the player can see is how Estimatle does it, and it is
   * what makes a range of round numbers around the answer fair.
   */
  notches: 100,
  /**
   * Points fall in a straight line from the full base at a gap of 0 to
   * nothing at `zeroAt`: 200 - 5 a notch as tuned. No cliff anywhere inside,
   * so a near miss always reads as nearly right.
   */
  zeroAt: 40,
  /**
   * A gap beyond this is a wild shot: the flat dock and a shield. With every
   * answer between notch 10 and 90 (see `lib/content/difficulty.ts`), a guess
   * dropped in the middle can never be this far off, so the stake only lands
   * on a confident guess in the wrong direction.
   */
  wildBeyond: 40,
  /**
   * The verdicts, by the largest gap each covers. The first is DEAD ON, which
   * salvages a shield or a hint the way a direct hit always has; up to
   * `hitWithin` counts as a hit, lifting the streak; beyond that up to
   * `wildBeyond` is a graze: points, but no damage and the streak untouched.
   */
  deadOnWithin: 1,
  hitWithin: 10,
  verdicts: [
    { within: 1, label: "DEAD ON" },
    { within: 5, label: "WITHIN 5%" },
    { within: 10, label: "WITHIN 10%" },
    { within: 25, label: "WITHIN 25%" },
    { within: 40, label: "WITHIN 40%" },
  ],
  /** Strength of a hit's burst at the edge of `hitWithin` (1.0 when dead on). */
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
   * How hard a wild shot lands. Just past `wildBeyond` it costs
   * `severityFloor` of a full impact; a gap of `severityFullAt` notches and
   * beyond costs all of it. Being a little wild should not read the same as
   * aiming at the wrong end.
   */
  severityFloor: 0.3,
  severityFullAt: 70,
  /** Notches of the slider a HINT leaves lit around the truth. */
  novaWindow: 34,
  /** Slow drift of the scout, so its rest position is never the answer. */
  driftAmplitude: 6,
  driftRate: 0.23,
} as const;

/**
 * The phase cards' worked examples (`PhaseDemo`). Each step types its caption
 * in first and only then moves the finger, so the eye lands on the words and
 * is led from them to the action. Typing is quick on purpose: it is there to
 * catch the eye, not to make anyone wait on it.
 */
export const DEMO = {
  /** Per character as a caption types in. */
  typeMs: 16,
  /** The finger's glide to its target, or the length of a drag. */
  moveMs: 600,
  /** Held after the action lands, for the result to be seen. */
  afterMs: 1500,
  /** Held on the last step of a scene, before the next one starts typing. */
  endMs: 2600,
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
  /**
   * Seconds the feed is held after Sergeant Soap's hail has finished typing.
   * He says what the job is before anything else is on screen, and this is the
   * beat to read the last of it; a tap gets there sooner. The answer clock is
   * held with the feed, so none of this is played against it.
   */
  hailHoldSeconds: 1.5,
  /**
   * Seconds the verdict holds in the middle of the screen before it clears.
   * Long enough to read a word and a figure, short enough to be gone by the
   * time the player looks for the answer and the fact underneath it.
   */
  verdictSeconds: 2.4,
  /**
   * Width of a ground photograph, in pixels. Wikimedia only renders a fixed
   * list of thumbnail widths now (640 is refused, 960 and 500 are served), and
   * 960 is what a 320px figure on a 3x phone wants. See `thumbUrl` in feed.ts.
   */
  groundWidth: 960,
  /** The zoom dial's steps from the site's own framing; 0 is the framing itself. */
  zoomSteps: [-1, 0, 1],
  /** The widest the optic goes; the tile source caps the other end (`MAX_ZOOM`). */
  minZoom: 2,
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
  approachSeconds: 4,
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

/**
 * The ending: what the landing sites bought, shown before the tally.
 *
 * The station screen pulls back until Earth fills the space under the
 * banner, and a fleet flies in. The fleet is the result: both sites named
 * sends the armada, one sends a squadron, none lets the invaders in, and a few
 * of them fire on the surface. Played by `Orbit.reinforce` and `Fleet.ts`.
 */
export const ENDING = {
  /** Seconds from the ending opening to the pull starting, and how long it takes. */
  holdSeconds: 0.7,
  pullSeconds: 4.2,
  /** How far back along its own line the camera ends up, and how much it climbs. */
  pullScale: 1.5,
  pullRise: 3,
  /**
   * Where the camera looks once the pull has landed: above Earth's centre, so
   * the planet sits in the lower half of a portrait frame, under the banner.
   */
  endLook: [1.2, -4.6, -2] as [number, number, number],
  /**
   * Earth's turn as the pull lands, radians, found by sweeping the model: the
   * face with the most land on it. It turns there the short way during the
   * pull, from wherever the station screen left it, then spins on as usual.
   */
  earthYaw: Math.PI,
  /** Seconds after the ending opens that Sergeant Soap's banner drops in. */
  bannerSeconds: 1.4,
  /** How far apart the two sites sit on Earth's face, as a share of its radius. */
  siteSpread: 0.42,
  /**
   * Where a route ends: over its landing site, this far above the surface as
   * a share of Earth's radius. A ship never reaches the ground; it dwindles
   * away in the distance first.
   */
  stopAbove: 0.45,
  /** A route's spread either side of its fleet's flight time, seconds. */
  flightJitter: 1.6,
  /** Seconds between launches, so a fleet arrives as a stream. */
  launchEvery: 0.045,
  /** The first few ships launch from beside the lens so they tear past it. */
  heroShips: 8,
  /** Seconds into the pull the lead ships launch, one after another. */
  heroFrom: 1.1,
  heroEvery: 0.28,

  /** Ours. Ships in the air at once, by landing sites named (index 1 and 2). */
  fleet: [0, 36, 110] as const,
  ours: {
    /** A ship's length in orbit units. Earth is 10 across; scale is fantasy. */
    length: 1.0,
    seconds: 6.4,
    /** Share of the trip after which it dwindles away. */
    fadeFrom: 0.4,
    /** Share of each hull in the fleet: mostly standard issue. */
    mix: { cinder: 0.7, flamingo: 0.2, seraph: 0.1 } as Record<string, number>,
    /** Engine glow size and trail length, in the player's own plasma. */
    glowSize: 1.8,
    trailLength: 5,
  },

  /**
   * Theirs, when no site was named: the scout from ALIEN CONTACT, fewer and
   * slower than our ships and a size bigger. Black hulls with a few small
   * violet running lights, not glowing: a shape against the stars.
   */
  invaders: {
    count: 16,
    length: 1.6,
    seconds: 8.5,
    fadeFrom: 0.72,
    /**
     * How far towards Earth a relaunched scout starts, as a share of the way.
     * There are few of them and they are dark: launched from as far back as
     * our ships, the second wave was invisible and the sky went empty.
     */
    closeIn: 0.55,
    /** The hull colour, and how many lights ring the rim. */
    hull: 0x1b1d26,
    lights: 5,
    /** Light size, how far out on the rim as a share of the hull, and blink rate in Hz. */
    lightSize: 0.8,
    lightRim: 0.42,
    blinkHz: 1.6,
    /** One in this many fires on the way down. */
    shooterEvery: 3,
    /** A burst: seconds on and off. Only within this many Earth radii of its centre. */
    shotSeconds: 0.8,
    shotGap: 0.6,
    shootWithin: 7,
    /**
     * Beam thickness and colour, and the flash where it lands. The HUD's damage
     * red rather than `COLOR.neg`, which is too dark to carry at this distance.
     */
    beamRadius: 0.26,
    beamColor: 0xff6b5c,
    hitSize: 4.2,
  },
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
  /**
   * The scout's running lights: small violet beacons on the hull that strobe
   * on staggered beats, a sharp flash and a slow decay, the way an aircraft's
   * do. Positions are fractions of the loaded hull's half-extents (x across,
   * y up, z along), so they sit on the model whatever its proportions.
   */
  lights: [
    { x: 1, y: 0, z: 0, phase: 0 },
    { x: -1, y: 0, z: 0, phase: 0.5 },
    { x: 0.55, y: 0.1, z: 0.6, phase: 0.25 },
    { x: -0.55, y: 0.1, z: 0.6, phase: 0.75 },
    { x: 0.55, y: 0.1, z: -0.6, phase: 0.12 },
    { x: -0.55, y: 0.1, z: -0.6, phase: 0.62 },
    { x: 0, y: 1, z: 0, phase: 0.37 },
  ],
  /**
   * World size of a beacon's glow, and how bright it idles between flashes
   * (0..1 of full). The flash is brightness, not size: all the beacons are
   * one draw call, and a point cloud has one size.
   */
  lightSize: 3.2,
  lightRest: 0.3,
  /** Seconds per strobe cycle, and how fast a flash decays within it. */
  lightPeriod: 1.3,
  lightDecay: 9,
  /** The soft violet glow under the hull: size (in hull lengths) and pulse. */
  underglowScale: 1.1,
  underglowOpacity: 0.2,
  underglowPulse: 0.1,
  underglowRate: 1.7,
  /**
   * The hull at rest: black. It was lit violet once and read as a purple toy;
   * the menace is a dark shape edged in light. A hit still flashes it red.
   */
  restEmissive: 0,
  /**
   * The aura: a big violet glow parked just behind the hull. The hull hides
   * its middle, so what shows is a rim of light around the silhouette. Size in
   * hull lengths, and how far behind the centre it sits, in hull lengths.
   */
  auraScale: 2.1,
  auraOpacity: 0.6,
  auraBack: 0.45,
  auraPulse: 0.12,
} as const;

export const NOVA = {
  perRun: 2,
  /**
   * Seconds a scan puts BACK on the clock. It used to spend thrust, and a
   * lifeline that costs time to pull is not one; the hint arrives with a
   * second to read it in.
   */
  bonusSeconds: 1,
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
    /** Docking never strikes the ship, and a graze never reaches it. */
    dock: 0,
    graze: 0.15,
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
    rumble: 1.7,
    rumbleRoll: 0.13,
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
  /**
   * The shockwave on contact: a flat ring that races out from the impact and
   * a white-hot flash at its heart. Sizes are world units at `strength` 1;
   * the ring is billboarded so it always reads as a circle.
   */
  /**
   * Explosions: a fireball of billboard puffs that burn white to red and
   * cool to smoke, a spray of embers, and a point light that throws the fire
   * onto the rocks and the hull for a moment. Sizes are world units at
   * strength 1; counts are per tier (high, mid, low).
   */
  explosion: {
    pool: 4,
    puffs: [7, 5, 4],
    embers: [56, 36, 20],
    /** Seconds the fireball lives, and the size of a puff at birth and death. */
    seconds: 1.1,
    puffFrom: 3.5,
    puffTo: 11,
    /** How far puffs are thrown from the centre, and how fast. */
    puffSpread: 3.2,
    emberSpeed: 38,
    emberSeconds: 0.95,
    emberSize: 0.9,
    emberDrag: 2.4,
    /** Fraction of world speed the blast drifts aft at. */
    stream: 0.12,
    /** The light the blast throws on the scene. */
    lightColor: 0xffa24a,
    lightIntensity: 900,
    lightDistance: 90,
    lightSeconds: 0.32,
    /** Strength per event. */
    boulder: 1,
    wreck: 1.45,
    alienGlance: 0.6,
    alienKill: 1.9,
    returnFire: 0.55,
    /** The kill chains secondary blasts across the hull. */
    chain: 3,
    chainGap: 0.17,
    /** Chain offsets, as a fraction of the scout's length. */
    chainSpread: 0.38,
    chainStrength: 0.75,
  },
  /**
   * Time. Hit-stop is a few frames at almost nothing, the punch of a fighting
   * game; slow-mo is bullet time for the two biggest moments in the run. Both
   * scale only what is drawn: the run, its clock, its score and its distance
   * always step on real time, and so does the sound.
   */
  time: {
    stopScale: 0.04,
    boulderStop: 0.07,
    wreckStop: 0.11,
    glanceStop: 0.05,
    killScale: 0.3,
    killSeconds: 0.6,
    maxThrustScale: 0.35,
    maxThrustSeconds: 0.35,
    /** How fast slow-mo eases back to real time once it lets go, per second. */
    recover: 7,
  },
  /**
   * Boost is violent. A burn shakes the rig as if the hull is about to come
   * apart, grows with the plasma spent, and MAXIMUM THRUST (the `overdrive`
   * block) goes further again. Indexed by charge 1 and 2.
   */
  boost: {
    seconds: [1.1, 1.6],
    rumble: [0.55, 1.0],
    roll: [0.035, 0.07],
    /** The hull's own shudder, 0..1, for charge 1, 2 and a full reactor. */
    shudder: [0.35, 0.6, 1],
  },
  /**
   * Rumble texture on top of the jitter: sharp random jolts, how often they
   * land per second at full rumble, and a tilt of the lens so the horizon
   * fights the camera too.
   */
  rumbleJolts: 5,
  rumbleJoltSize: 0.9,
  rumbleTilt: 0.012,
  shockwave: {
    /** Rings in the pool. Two contacts inside one ring's life is the most a run asks. */
    pool: 3,
    ringSeconds: 0.5,
    ringFrom: 1.5,
    ringTo: 17,
    ringOpacity: 0.85,
    flashSeconds: 0.18,
    flashSize: 16,
    /** Per-event strength. */
    boulder: 1,
    wreck: 1.4,
    collect: 0.55,
    alienHit: 0.8,
    alienKill: 1.6,
    returnFire: 0.7,
  },
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

    /**
     * The ending, when the fleet goes in: C major, the heroic I IV V I, a
     * march tempo with the hat driving it. Written for the docked station,
     * where the speed ratio is zero, so both ends of every range are the
     * same: there is no run to lift it.
     */
    victory: {
      bpm: [124, 124],
      /** C, F, G, C. */
      roots: [65.41, 43.65, 49, 65.41],
      /** Major pentatonic: nothing in it can sound sad. */
      scale: [0, 2, 4, 7, 9, 12, 14],
      bassGain: 0.24,
      padGain: 0.08,
      arpGain: [0.12, 0.12],
      sparkleGain: 0,
      hatGain: [0.045, 0.045],
      arpFilterHz: [4200, 4200],
      padDetune: 7,
      padSecond: 0,
      subGain: 0,
      arpEvery: 1,
    },

    /**
     * The ending, when the invaders come down: slower than dread and heavier.
     * E and F grinding a semitone apart, the Phrygian dominant over them, a
     * sub under every bar and the hat ticking like boots.
     */
    invasion: {
      bpm: [66, 66],
      /** E1, F1, E1, Eb1. */
      roots: [41.2, 43.65, 41.2, 38.89],
      scale: [0, 1, 4, 5, 7, 8, 12],
      bassGain: 0.3,
      padGain: 0.1,
      arpGain: [0.05, 0.05],
      sparkleGain: 0,
      hatGain: [0.022, 0.022],
      arpFilterHz: [900, 900],
      padDetune: 30,
      padSecond: 1,
      subGain: 0.12,
      arpEvery: 2,
    },
  },

  /**
   * The ending's stingers, which land as the music turns (see `Audio.ending`).
   *
   * The victory is a call on a bugle, three quick notes and a leap up to the
   * held one, then the finale's own chord swelling behind it, bigger for both
   * sites named than for one. The invasion is the scout's arrival, a low
   * brass stab on a clashing chord, and an air-raid siren winding up and down.
   */
  ending: {
    call: {
      /** D4, above the finale's D3 root, so the chord lands under it. */
      rootHz: 293.66,
      /** Semitones, start times and lengths, seconds. */
      notes: [0, 0, 0, 7, 12],
      at: [0, 0.13, 0.26, 0.4, 0.62],
      seconds: [0.11, 0.11, 0.11, 0.2, 1.3],
      gain: 0.085,
      filterHz: 2800,
      detuneCents: 8,
    },
    /** When the chord lands under the call, and how big it is for one site and for both. */
    chordAt: 0.62,
    strength: [0.55, 1],
    stab: {
      /** E2, with a flat second and a tritone over it. */
      rootHz: 82.41,
      semitones: [0, 1, 6, 12],
      seconds: 1.8,
      gain: 0.07,
      filterHz: 900,
    },
    siren: {
      /** Low and high of the wail, Hz, how long each sweep takes, and how many. */
      hz: [420, 780],
      sweepSeconds: 0.9,
      sweeps: 6,
      delay: 0.5,
      gain: 0.05,
      filterHz: 1900,
    },
    send: 0.6,
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

  /**
   * WHERE ON EARTH: the call back to Earth Command when a site is named.
   *
   * Aboard the station there is no lane and no hull, so the verdict cannot
   * borrow the flight's contact cues: nothing flew past and nothing was hit.
   * This is a radio answering. The transmitter keys up the same way both
   * times, then the answer either confirms or refuses.
   */
  /**
   * The run is over. A riser into an impact, then a chord that swells open.
   * Every layer is scaled by the tier (0 for a scrape home, 1 for full marks):
   * a better run gets a wider chord, a longer tail and, on the top tiers, a
   * second chord an octave up and a sparkle cascade over the top.
   */
  finale: {
    /** The wind-up: filtered noise and a pitched sweep, both climbing. */
    riser: { hz: [140, 3600], noiseHz: [300, 7000], gain: 0.13, noiseGain: 0.11, q: 6 },
    /** The hit, as RUN COMPLETE lands. */
    impact: { gain: 0.34, subHz: [92, 34], subGain: 0.42, seconds: 1.4, crash: [6200, 900] },
    /** Root of the chord, Hz. D, so it sits a tone above the countdown. */
    rootHz: 146.83,
    /** Semitones stacked over the root, least to most: the tier decides how many play. */
    chord: [0, 7, 12, 16, 19, 24, 28],
    /** Chord voices at the lowest tier and at full marks. */
    voices: [3, 7],
    chordGain: 0.075,
    /** Seconds the chord rings at the lowest tier and at full marks. */
    chordSeconds: [2.2, 4.6],
    /** Lowpass opening across the chord, Hz, least to most. */
    filterHz: [1400, 5200],
    /** Cents either side for the two detuned saws in each voice. */
    detuneCents: 9,
    /** A rising run of bells over the top on great and above. */
    sparkle: { hz: 880, steps: [0, 4, 7, 12, 16, 19, 24, 28], gap: 0.07, gain: 0.07, seconds: 1.1 },
    send: 0.65,
    duck: 0.55,
  },

  /**
   * The tally reading the score out. Each line lands on a note that climbs a
   * major scale, so eight lines build to the total rather than repeating.
   */
  tally: {
    /** Root of the line scale, Hz, and the scale it climbs, in semitones. */
    rootHz: 392,
    scale: [0, 2, 4, 5, 7, 9, 11, 12, 14, 16],
    /** A full-marks line: a bright two-note chime. */
    full: { gain: 0.16, seconds: 0.7, ratio: 2.01, index: 150 },
    /** Partial points: one softer note. */
    part: { gain: 0.11, seconds: 0.45 },
    /** Nothing scored: a dull thud. */
    nil: { hz: [150, 70], gain: 0.16, seconds: 0.22 },
    /** Points lost: a falling tone. */
    down: { hz: [330, 150], gain: 0.12, seconds: 0.4 },
    /** The count-up blip. Very short and quiet: it is a texture, not a cue. */
    tick: { hz: 1760, gain: 0.035, seconds: 0.03 },
    /** A stage's subtotal stamping in: a short chord hit, brighter when it scored. */
    stage: { hz: 293.66, gain: 0.08, seconds: 0.55, filterHz: [900, 4200] },
    /** The total: a thump under whatever the tier plays over it. */
    total: { subHz: [110, 40], subGain: 0.4, seconds: 1.2, gain: 0.3 },
    send: 0.5,
  },

  site: {
    /** Keying up: a short burst of air off the top of the band. */
    key: { seconds: 0.06, gain: 0.1, hz: [2600, 1700], q: 3 },
    send: 0.55,
    /** Confirmed: two bells a fifth apart, the second late, over a swell. */
    good: {
      hz: 620,
      fifth: 1.5,
      seconds: 1.2,
      gain: 0.21,
      delay: 0.1,
      ratio: 2.01,
      index: 190,
      swell: { hz: [120, 240], seconds: 0.8, gain: 0.16 },
    },
    /** Refused: a flat double blat, static behind it, the hull ringing low. */
    bad: {
      hz: 196,
      sweepTo: 138,
      seconds: 0.26,
      gain: 0.19,
      q: 3,
      filterHz: 900,
      /** Seconds between the two blats. */
      gap: 0.21,
      static: { seconds: 1.0, gain: 0.1, hz: [2600, 400], q: 0.8, delay: 0.18 },
      ring: { hz: 98, seconds: 1.3, gain: 0.1, delay: 0.1, ratio: 1.41, index: 90 },
      duck: 0.3,
    },
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

/**
 * When the daily round turns over. One clock for the whole world, so every
 * player on the planet is on the same round at the same moment and a group
 * chat spanning time zones compares like with like.
 *
 * It runs on Melbourne's wall clock, daylight saving included, because that
 * is where the players are: for them the round turns over at midnight, the
 * way Wordle's does, and the date on the share card is the date on their
 * phone. Everywhere else it lands at a fixed daytime hour (2pm or so in
 * London, 9am or so in New York).
 *
 * `resetHour` is the hour on that clock the new round goes live, 0 to 23.
 * Anything but 0 goes live the evening before its date: at 18 the round
 * dated the 25th opens at 6pm on the 24th, so the file name and the card
 * still carry the day most of its play happens on.
 */
export const DAILY = {
  zone: "Australia/Melbourne",
  resetHour: 0,
  /**
   * No landing site comes round again within this many days, in either slot.
   * The pair used to be drawn blind each day, and Cairo opened the finale on
   * the 27th and again on the 29th: two days apart reads as a small pool.
   */
  siteGapDays: 7,
  /**
   * The first date the gap holds. Rounds before it keep the pair they were
   * flown with, so a stored run and its share card never change under a
   * player; this was the live round when the rule went in.
   */
  siteGapFrom: "2026-09-25",
} as const;

export const SHARE = {
  width: 1080,
  height: 1350,
  /** Signed off the card and the copied text, so a share can be followed back. */
  site: "www.astrorun.io",
  /** Cells in a stage's meter, on the card and in the copied text alike. */
  meterCells: 4,
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
  /** A boost shudder at full: how far the hull jolts, and how hard it yaws. */
  shudderOffset: 0.22,
  shudderYaw: 0.07,
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
     * A correction for a model authored off its own centreline, radians,
     * applied in the model's own frame before anything else: `yaw` about its
     * up axis, `roll` about its length. Zero for a model that was built
     * square. Found by mirroring the hull across its centreline and turning
     * it until the two halves line up, not by eye.
     */
    modelTrim: { yaw: 0, roll: 0 },
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
    modelTrim: { yaw: 0, roll: 0 },
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
     * The GLB sits about 21 degrees yawed and 2 degrees rolled off its own
     * centreline, so untrimmed it flew crabwise with one wing low and read
     * as lopsided in the bay and on the results card.
     */
    modelTrim: { yaw: (21.5 * Math.PI) / 180, roll: (-2.25 * Math.PI) / 180 },
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
   * `/hangar?shot=<id>`: the bay with the room taken away, for the script
   * that renders the ship stills the results card draws. The hull stands
   * alone on a transparent clear at a fixed angle, so the same hull always
   * produces the same picture.
   *
   * A hull is yawed by its catalogue entry so its nose faces -Z, the
   * direction of travel, and the bay's camera stands at +Z. So a turntable
   * yaw of zero shows the engines and PI shows the nose; the extra is the
   * three-quarter turn that makes it read as a ship rather than a diagram.
   */
  shotYaw: Math.PI + 0.62,
  shotPitch: 0.22,
  /** Tighter than the bay, which has a room to hold steady; a still has not. */
  shotPadding: 1.08,
  /** Camera height as a fraction of its distance. A shade above the nose. */
  shotLift: 0.16,
  /** Rendered large and drawn down, so the still is crisp on the card. */
  shotSize: { width: 800, height: 600 },

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
  baseLength: 3.06,
  speedLength: 2.88,
  /** Radius of the outer cone at the nozzle. */
  radius: 0.38,
  /**
   * Opacity of the white-hot inner cone and the orange outer one. Both are
   * additive, and past about these values they cross the bloom threshold
   * over most of their length and the blur spreads them across the hull.
   */
  coreOpacity: 0.58,
  outerOpacity: 0.36,
  /**
   * Downward tilt of the plume, radians. The chase camera sits above the
   * ship, so a plume aimed dead astern is seen end-on and reads as a dot;
   * tilting it drops the tail into view.
   */
  tilt: 0.34,
  /** Particles streamed per nozzle, per quality tier (high, mid, low). */
  particleCount: [70, 45, 28],
  /** How far back a particle travels before it recycles. */
  particleTravel: 4.05,
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

/**
 * The shared halo sprite (`lib/game/glow.ts`), and where it is used. Glow is
 * the game's stand-in for bloom: an additive gradient quad, no post pass.
 */
export const GLOW = {
  textureSize: 64,
  /** Gradient stops, 0 (centre) .. 1 (edge), and alpha at each. */
  falloff: [
    [0, 1],
    [0.12, 0.85],
    [0.3, 0.38],
    [0.55, 0.12],
    [1, 0],
  ] as ReadonlyArray<readonly [number, number]>,
  /**
   * Nozzle halo: size at cruise, extra per unit of exhaust pulse, opacity.
   * Kept small and faint on purpose: at 2.4 and 0.55 (and still at 2.0 and
   * 0.3) the two halos, their flares and the bloom they fed merged into one
   * orange wash over the tail that hid the hull. The fire is the light; the
   * halo is a tight trace around each nozzle and no wider than the hull's
   * own engine block.
   */
  nozzleSize: 1.1,
  nozzlePulse: 0.55,
  nozzleOpacity: 0.16,
  /** Plasma pod halo, as a multiple of the pod's radius, and its breathing. */
  podScale: 8.5,
  podOpacity: 0.6,
  podBreath: 0.18,
  /**
   * Anamorphic flares: a thin horizontal streak across a hot light, the lens
   * look of every big-budget space film. Width and height in world units, and
   * opacity, for a nozzle and for a plasma pod.
   */
  flareTextureWidth: 256,
  flareTextureHeight: 16,
  nozzleFlareWidth: 3.2,
  nozzleFlareHeight: 0.28,
  nozzleFlareOpacity: 0.14,
  podFlareWidth: 26,
  podFlareHeight: 1.2,
  podFlareOpacity: 0.75,
  /** Flare where a beam lands: size and opacity at the beam's peak. */
  beamFlare: 9,
  beamFlareOpacity: 0.9,
} as const;

/**
 * Things in the sky that are not the game. None of it can say anything about
 * an answer: comets only fly while no question is open, and dust is uniform.
 */
export const AMBIENCE = {
  comets: {
    /** Comets in the pool, per quality tier (high, mid, low). */
    count: [2, 1, 1],
    /** Seconds between launches, drawn from this range on the round's seed. */
    intervalMin: 5,
    intervalMax: 11,
    /** One in this many is a slow comet with a long tail; the rest are shooting stars. */
    cometEvery: 4,
    /** Shooting star: seconds to cross, tail length, head size. */
    starSeconds: 0.9,
    starTail: 110,
    starWidth: 2.6,
    starHead: 11,
    /** Comet: seconds to cross, tail length, head size. */
    cometSeconds: 3.2,
    cometTail: 150,
    cometWidth: 6,
    cometHead: 16,
    /** How far away they fly: beyond the fog, in front of the backdrop. */
    depthMin: 300,
    depthMax: 440,
    /**
     * Where a crossing starts, as a fraction of the half-height of the view
     * above the camera. Higher than this is under the HUD band.
     */
    skyFrom: 0,
    skyTo: 0.35,
    /** Distance travelled across the sky per crossing. */
    travel: 360,
    /** Seconds to fade out when a question opens mid-flight. */
    abortSeconds: 0.25,
    starColor: 0xffffff,
    cometColor: 0xcfe9ff,
  },
  dust: {
    /** Specks per quality tier (high, mid, low). */
    count: [240, 150, 80],
    /** Box around the ship the dust lives in, half extents, and its depth. */
    halfWidth: 34,
    halfHeight: 22,
    depth: 140,
    /** Fraction of world speed the dust streams past at. Above 1 reads as close. */
    parallax: 1.15,
    size: 0.16,
    /** Opacity at cruise and at the top of the speed band. */
    opacityMin: 0.22,
    opacityMax: 0.7,
    color: 0xb9d4ff,
  },
} as const;

/**
 * Real bloom: bright light bleeding across the lens. Tier-gated, rendered at
 * a fraction of the canvas, and dropped automatically when the quality
 * governor steps down to low. The threshold is high on purpose: only the
 * additive light (engines, plasma, beams, blasts, stars) should bloom, never
 * the painted sky or a lit rock face.
 */
export const BLOOM = {
  enabled: [true, true, false],
  resolution: 0.5,
  threshold: 0.82,
  strength: 0.8,
  /**
   * How far the blur spreads. At 0.55 the exhaust bloomed into a disc wider
   * than the hull and the ship disappeared into it; glow should hug its light.
   */
  radius: 0.3,
} as const;

/**
 * Hyperspace: the tunnel of stretched light around the lens on a burn, and
 * the streaked rim of the frame. Intensity is 0..1; a partial burn opens it
 * part way, MAXIMUM THRUST all the way.
 */
export const HYPER = {
  streaks: [320, 220, 140],
  radiusMin: 7,
  radiusMax: 38,
  depth: 320,
  /** Streak length at full intensity, and how much faster than the world they run. */
  length: 70,
  speed: 3.4,
  core: 0xe6f6ff,
  edge: 0x7fd8ff,
  /** Per charge 1 and 2; MAXIMUM THRUST is 1. */
  burn: [0.45, 0.7],
  /** Seconds to open, and the rate it closes once the hold is over. */
  rise: 7,
  fall: 1.1,
  /** Seconds a partial burn holds before closing. MAXIMUM THRUST holds FX.warp.holdSeconds. */
  hold: 0.7,
  /** The streaked frame edge: opacity at full intensity. */
  edgeOpacity: 0.55,
  /** Reduced motion: the tunnel is this much of itself, and the edge is off. */
  reducedScale: 0.5,
} as const;

/** Light trails off the wingtips, above cruise. */
export const TRAILS = {
  /** Samples per trail, per tier; 0 turns trails off. */
  points: [28, 20, 14],
  /** World length of a trail at full, and its width. */
  length: 7,
  width: 0.11,
  color: 0x9fe6ff,
  /** Speed ratio below which there is no trail, and opacity at full speed. */
  minRatio: 0.12,
  opacity: 0.9,
  /** How far inboard of the hull's widest point the trail leaves, 0..1. */
  inset: 0.08,
} as const;

/**
 * Huge rocks that sweep past close to the lens between questions: scale.
 * Only in calm phases (the comet gate), always outside the lane corridor.
 */
export const FLYBY = {
  count: [2, 1, 1],
  intervalMin: 4,
  intervalMax: 9,
  scaleMin: 5,
  scaleMax: 9,
  /** Distance off the centreline on X, and height range. */
  xMin: 14,
  xMax: 22,
  yMin: -8,
  yMax: 9,
  spawnZ: -280,
  /** Their own closing speed, on top of the world's. */
  speed: 120,
  spin: 0.9,
} as const;

/** The scene's light rig, beyond the key and hemisphere set in Engine. */
export const LIGHT = {
  /**
   * A cool light from behind and above, toward the camera: it catches the far
   * edges of the rocks and the hull and gives every silhouette a rim against
   * the dark. Lambert has no fresnel, so a back light is how a rim is had.
   */
  rimColor: 0x9fc4ff,
  rimIntensity: 1.25,
  rimPosition: [4, 7, -12] as readonly [number, number, number],
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
