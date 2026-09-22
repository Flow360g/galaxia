/** Shared types for the Galaxia engine. */

/** Rendering quality tier. 0 = high, 1 = mid, 2 = low. Indexes Tuning arrays. */
export type QualityTier = 0 | 1 | 2;

// ------------------------------------------------------------------ content

/**
 * The corner of general knowledge a question comes from.
 *
 * Authoring metadata, and nothing else: it is never rendered, never scored and
 * never reaches `GameState`. It exists so the build can hold the one rule that
 * keeps a day playable by everybody, that no round leans more than twice on any
 * one corner, and so the practice shuffle can spread its draw instead of
 * handing a tester six questions about the solar system.
 *
 * `misc` is the catch-all for the fringes, space among them: a corner of its
 * own for space made a round read as a specialist's quiz. Mythology, language,
 * transport, money and oddities live there too.
 */
export type Topic =
  | "geography"
  | "history"
  /** Science and technology. */
  | "science"
  /** Animals and the natural world. */
  | "nature"
  /** Food and drink. */
  | "food"
  | "sport"
  /** Film, television and music. */
  | "screen"
  /** Art and literature. */
  | "arts"
  /** The fringes: space, mythology, language, transport, money, oddities. */
  | "misc";

export const TOPICS: readonly Topic[] = [
  "geography",
  "history",
  "science",
  "nature",
  "food",
  "sport",
  "screen",
  "arts",
  "misc",
];

/** A normal trivia encounter: four options, one right. */
export interface McqQuestion {
  id: string;
  type: "mcq";
  prompt: string;
  /** The corner it is drawn from. Authoring metadata; never shown. */
  topic: Topic;
  options: string[];
  /** Index into `options`. */
  answer: number;
  /** Optional authored clue a NOVA scan can reveal. */
  hint?: string;
  /** Shown after the encounter resolves. */
  fact?: string;
}

/**
 * WHERE ON EARTH: the last encounter, one per run. The ship docks at the
 * relay station and reads its satellite feed to find where the invasion
 * landed, then calls the fleet in. The feed fields (name, country, lat, lon,
 * zoom, options) are authored now so the round is ready for that; this build
 * flies the approach and the dock.
 */
export interface EarthQuestion {
  id: string;
  type: "earth";
  prompt: string;
  /** The landing site, as shown on reveal. */
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** Slippy-map zoom that frames the giveaway. */
  zoom: number;
  /** Exactly four lane names, the answer among them. */
  options: string[];
  /** Index into `options`; `options[answer] === name`. */
  answer: number;
  /**
   * The rest is filled from the site pool at load, not authored per round, so
   * a day's pair can be generated rather than written out by hand. See
   * `lib/content/sites.ts`.
   */
  /** Free from the start: continent, climate, terrain. Never enough alone. */
  opener: string;
  /** Bought. Strong by design, which is why it is not given away. */
  clue: string;
  /** Bought: a structure pinned in the feed, described without naming it. */
  landmark?: { name: string; lat: number; lon: number };
  /** Bought: an ordinary road, then the structure itself. */
  street?: EarthShot;
  structure?: EarthShot;
  /** Typed answers: lowercase substrings that count as correct. */
  accept: string[];
  fact?: string;
}

/** One Commons photograph. `file` is the "File:" name and is never rendered. */
export interface EarthShot {
  file: string;
  credit: string;
  licence: string;
}

/**
 * A Cluster: six options, three of them right. Each correct pick charges the
 * reactor with PLASMA; the player BURNs to bank the charge or keeps picking
 * for a bigger burn. One wrong pick is a collision and the charge is lost.
 */
export interface ClusterQuestion {
  id: string;
  type: "cluster";
  prompt: string;
  /** The corner it is drawn from. Authoring metadata; never shown. */
  topic: Topic;
  /** Exactly six. */
  options: string[];
  /** Indices into `options`. Exactly three, distinct. */
  answers: number[];
  fact?: string;
}

/**
 * A Vector: a numeric answer aimed on a slider. The ship steers to match and
 * a beam fires on lock; the alien decloaks at the truth. The error is read
 * against `VECTOR.bands`, fractions of the answer, widened to the whole
 * units of `VECTOR.minBands` where a fraction of a small count would be
 * nonsense. The same bands for every question, so nothing is authored.
 */
export interface VectorQuestion {
  id: string;
  type: "vector";
  prompt: string;
  /** The corner it is drawn from. Authoring metadata; never shown. */
  topic: Topic;
  /** Never zero: the bands are relative to it. */
  answer: number;
  min: number;
  max: number;
  /** Shown after the value, e.g. "m" or "km". */
  unit?: string;
  /** Log-scaled slider for wide ranges. Requires min > 0. */
  log?: boolean;
  fact?: string;
}

export type Question = McqQuestion | ClusterQuestion | VectorQuestion | EarthQuestion;

/** A stage of the run. A waypoint plays after the last encounter of each stage but the final one. */
export interface Stage {
  name: string;
  /** Index of the last encounter in this stage. */
  after: number;
  /** Landmark that rises at the waypoint closing this stage. */
  landmark?: "moon" | "planet";
  /**
   * The phase number the card announces when this stage begins. Defaults to
   * the stage's position; a round may set it to skip a number.
   */
  phase?: number;
}

export interface Round {
  date: string;
  roundNumber: number;
  seed: number;
  theme: string;
  questions: Question[];
  stages?: Stage[];
}

// --------------------------------------------------------------------- run

export type Phase =
  /** Engines lighting, first question not yet called. */
  | "intro"
  /**
   * Cluster: the question is up on its own. No lanes, no pick clock, a READY
   * button and a read clock that opens the lanes if the button is not tapped.
   */
  | "reading"
  /** Question open, thrust draining, lanes tappable. */
  | "approach"
  /** A lane was picked: the ship is veering and the pod or boulder is inbound. */
  | "collecting"
  /** Between stages: rating card, landmark, alien arrival. No input. */
  | "waypoint"
  /** WHERE ON EARTH: flying in to the station. Question open, nothing tappable, no clock. */
  | "station"
  /** Aboard the station. The station screen owns the display. */
  | "docked"
  /** Answer locked, asteroid striking, outcome animating. */
  | "resolving"
  /** Outcome toast up, velocity settling, next asteroid queued. */
  | "aftermath"
  | "finished";

export type NovaKind = "eliminate" | "clue" | "narrow";

/**
 * A one-shot thing to celebrate or mourn, handed to the HUD to animate.
 *
 * `id` is what makes it one-shot: it changes on every pulse, so the HUD can
 * key on it and replay the animation even when two identical pulses land
 * back to back.
 */
export interface Pulse {
  id: number;
  kind: "plasma" | "shield" | "boost" | "damage";
  /** Headline, e.g. PLASMA COLLECTED. */
  label: string;
  /** Figure under it, e.g. "+1" or "1 SHIELD LOST". */
  detail: string;
}

/** Live state of a Vector encounter: where the aim is, in slider space 0..1. */
export interface VectorState {
  /** Slider position, 0..1. */
  t: number;
  /** The aimed value in answer units. */
  value: number;
  /** Slider window still open after a NOVA scan, 0..1. */
  window: [number, number];
}

/** The card shown between stages. */
export interface WaypointState {
  /** Stage just cleared. */
  stage: string;
  /** Stage about to begin. */
  next: string;
  /**
   * Type of the first encounter of that stage, so the card can brief the
   * game the player is about to play rather than assume one. Flat, like
   * everything else on `GameState`.
   */
  nextType: Question["type"];
  /** The number the card announces: ENTERING PHASE n. */
  nextPhase: number;
  rating: Rating;
  plasma: number;
  shields: number;
  peakVelocity: number;
  /** Seconds into the waypoint. */
  t: number;
}

export type Rating = "S" | "A" | "B" | "C";

/** Live state of a Cluster encounter, while it is open. */
export interface ClusterState {
  /** Lanes picked so far, in order. All were correct or the run would be over. */
  picked: number[];
  /** PLASMA banked so far, 0..3. */
  charge: number;
  /** km/h a BURN right now would add. */
  projected: number;
  /** km/h a BURN after one more correct pick would add. */
  projectedNext: number;
  /** Lanes a NOVA scan ruled out. */
  eliminated: number[];
  /**
   * Every right lane is found and the gauge is full. The clock is held here:
   * there is nothing left to pick, so the run waits on the boost being fired.
   */
  full: boolean;
  /** The cluster's own shields still up. See `CLUSTER.shields`. */
  shields: number;
  /** Wrong lanes a shield has already taken. Struck out, not lit. */
  struck: number[];
}

export interface NovaResult {
  kind: NovaKind;
  /** Option indices the scan ruled out. */
  eliminated: number[];
  /** Option indices the scan flagged as plausible. */
  highlighted: number[];
  clue: string | null;
}

export type OutcomeKind =
  /** Correct: threaded past the rock. */
  | "thread"
  /** Correct with boost armed: gravity-assist slingshot. */
  | "slingshot"
  /** Wrong: flew into it. */
  | "collision"
  /** Wrong with boost armed, or wrong with no shields left: hit it at speed. */
  | "wreck"
  /** Cluster: banked the reactor charge. Impulse scales with `charge`. */
  | "burn"
  /** Thrust ran out before an answer locked. Treated as a collision. */
  | "timeout"
  /**
   * Vector: inside the graze band. The shot clipped the scout: no points,
   * no damage, no shield lost, and the streak is left where it was.
   */
  | "graze"
  /**
   * WHERE ON EARTH: docked and ended the transmission. Neutral until the
   * satellite feed lands: no points, no penalty, no streak, no shield.
   */
  | "dock";

export interface Outcome {
  kind: OutcomeKind;
  correct: boolean;
  boosted: boolean;
  timedOut: boolean;
  /** Thrust remaining at lock, 0..1. Drives the size of the burst. */
  thrustLeft: number;
  /** km/h at lock. */
  velocityBefore: number;
  /** km/h immediately after the impulse or collision. */
  velocityAfter: number;
  streakBefore: number;
  streakAfter: number;
  /** MCQ: chosen option index. Burn, vector, dock and timeout: null. */
  chosen: number | null;
  guessText: string;
  answerText: string;
  /** Cluster only: PLASMA banked by a burn (0 on a miss or a vent). */
  charge?: number;
  /** Cluster only: lanes picked, in order, including the fatal one on a miss. */
  picks?: number[];
  /** Cluster only: plasma that was in the reactor when the cluster was lost. */
  lost?: number;
  /** Vector only: |guess - truth| / |truth|, so 0.1 is 10% off. */
  error?: number;
  /**
   * Vector only: how wide the shot was, ready to read. A percentage, or
   * whole units ("1 off") on a question that aims in whole units, where a
   * percentage of a small count is arithmetic the player should not have to
   * do to learn they were one out.
   */
  errorText?: string;
  /** Vector only: the aimed value. */
  guessValue?: number;
  /** Vector only: what a direct hit salvaged. */
  salvage?: "shield" | "nova";
  /** WHERE ON EARTH: intel drops bought, and optics levels paid for. */
  earthIntel?: number;
  earthOptics?: number;
  /**
   * How hard a wrong answer lands, 0..1. A vector miss scales it by HOW wrong
   * the shot was, so just outside the graze band costs a fraction of what a
   * wild guess costs. Everything else is a flat 1.
   */
  severity?: number;
  /** Points earned before the streak multiplier. 0 on a wrong answer. */
  base?: number;
  /** The streak multiplier this encounter was scored at. */
  multiplier?: number;
  /** Net points this encounter added to the score. Negative when it cost. */
  points?: number;
  /** The score after this encounter landed. */
  scoreAfter?: number;
}

/** One encounter's line in the end-of-run tally. */
export interface ScoreLine {
  index: number;
  /**
   * The kind of question this line scored. It is what lets the share card
   * group eight lines into the run's four stages, and count the NAME THE
   * PLACE sites, without being handed the round. Optional because a run read
   * back from localStorage may have been stored before the field existed.
   */
  type?: Question["type"];
  /** CLUSTER, VECTOR, LANE, WHERE ON EARTH. */
  label: string;
  /** One short line: "3 PLASMA BANKED", "DIRECT HIT", "MISSED". */
  detail: string;
  /** Points earned before the multiplier. */
  base: number;
  multiplier: number;
  /** Net points, negative when the encounter cost points. */
  points: number;
  /** Points a perfect run would have taken from this encounter. */
  max: number;
  /**
   * Whether the encounter itself was full marks. It can be true on a line
   * that still fell short of `max`, because `max` also counts the streak
   * multiplier a perfect run would have carried in. Only a line that left
   * points on the table at the encounter is called out.
   */
  full: boolean;
}

/** Live state the HUD reads each frame. Flat and primitive on purpose. */
export interface GameState {
  phase: Phase;
  /** Index of the encounter in progress, or -1. */
  encounter: number;
  /** Encounters resolved so far. */
  resolved: number;
  /** The score: what the run is played for. See `Score.ts`. */
  score: number;
  /** What a perfect run would score. The score is always quoted out of this. */
  maxScore: number;
  /** Total distance this run, km. Tracked and shared, but not the score. */
  distance: number;
  /** WHERE ON EARTH: the feed's imagery has arrived and the clock is running. */
  feedReady: boolean;
  /** WHERE ON EARTH: seconds left to name this site. */
  feedSeconds: number;
  /** WHERE ON EARTH: intel rungs bought, and optics levels paid for, this site. */
  earthIntel: number;
  earthOptics: number[];
  /** Current velocity, km/h. */
  velocity: number;
  peakVelocity: number;
  streak: number;
  /** Thrust remaining for the current encounter, 0..1. */
  thrust: number;
  boostArmed: boolean;
  novaLeft: number;
  nova: NovaResult | null;
  /** Cluster encounter in progress, or null. */
  cluster: ClusterState | null;
  /**
   * The boost gauge emptying into the engines. `burnCharge` is the PLASMA
   * that went in, `burnDrain` sweeps 1 to 0 as it is spent. Both are 0 once
   * the needle is back on the peg.
   */
  burnCharge: number;
  burnDrain: number;
  /** Vector encounter in progress, or null. */
  vector: VectorState | null;
  /** Waypoint card in progress, or null. */
  waypoint: WaypointState | null;
  /**
   * WHERE ON EARTH: the engine has reported the ship alongside the station,
   * so ENTER SPACE STATION is armed. Only ever true in the `station` phase.
   */
  stationReady: boolean;
  /** Seconds on a full clock for the current encounter. */
  clockSeconds: number;
  /** Cluster read screen: seconds before the lanes open on their own. 0 otherwise. */
  readSeconds: number;
  /** Shields left. Each wrong lane costs one; at zero, a miss is a wreck. */
  shields: number;
  maxShields: number;
  /** The most recent collect or hit, for the HUD to flash. Never cleared mid-run. */
  /**
   * The launch countdown over the intro: 3, 2, 1, then 0 for GO, and null
   * once the run is flying.
   */
  countdown: number | null;
  pulse: Pulse | null;
  /** Outcome of the most recent encounter, while its toast is up. */
  outcome: Outcome | null;
  /**
   * Nothing moves on until the player taps. True once the toast or the
   * waypoint card has had its beat and is waiting on them.
   */
  awaitingTap: boolean;
  running: boolean;
}

/** One point on the flight path, recorded for the share card. */
export interface FlightSample {
  /** Seconds since the run began. */
  t: number;
  /** km/h. */
  v: number;
  /** km. */
  d: number;
}

/** Something that happened on the flight path. */
export interface RunEvent {
  t: number;
  /** Encounter index. */
  index: number;
  kind: OutcomeKind;
  correct: boolean;
  boosted: boolean;
  /** Distance and velocity at the moment it happened. */
  d: number;
  v: number;
  /** Streak after the event. */
  streak: number;
  /** Burn events: plasma banked. */
  charge?: number;
  /** Set on the event that closed a stage: the rating awarded at the waypoint. */
  rating?: Rating;
}

/** Everything the share card and the record need. Serialisable. */
export interface RunSummary {
  date: string;
  roundNumber: number;
  theme: string;
  /** The score, and what a perfect run would have scored. */
  score: number;
  maxScore: number;
  /** One line per encounter flown, for the end-of-run tally. */
  lines: ScoreLine[];
  distance: number;
  peakVelocity: number;
  bestStreak: number;
  correct: number;
  total: number;
  /** Boosts armed, and how many of those paid off. */
  boosts: number;
  boostHits: number;
  collisions: number;
  novasUsed: number;
  /** Burns that banked the full charge. */
  fullBurns: number;
  shieldLost: boolean;
  /** Shields still up at the end of the run. */
  shieldsLeft: number;
  /** One rating per waypoint, in order. */
  ratings: Rating[];
  /**
   * The hull that flew it, for the results card. Cosmetic and optional: a run
   * stored before this existed, or one naming a hull that is gone, falls back
   * to standard issue rather than failing to draw.
   */
  shipId?: string;
  outcomes: Outcome[];
  samples: FlightSample[];
  events: RunEvent[];
  durationSeconds: number;
}

/** Debug counters surfaced by ?debug=1. */
export interface DebugInfo {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  tier: QualityTier;
  dpr: number;
}
