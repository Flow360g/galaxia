/** Shared types for the Galaxia engine. */

/** Rendering quality tier. 0 = high, 1 = mid, 2 = low. Indexes Tuning arrays. */
export type QualityTier = 0 | 1 | 2;

// ------------------------------------------------------------------ content

/** A normal trivia encounter: four options, one right. */
export interface McqQuestion {
  id: string;
  type: "mcq";
  prompt: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  /** Optional authored clue a NOVA scan can reveal. */
  hint?: string;
  /** Shown after the encounter resolves. */
  fact?: string;
}

/**
 * The AI Anomaly: one per run. An open-ended text answer, optionally about an
 * image, scored by a model on the server. `accept` keeps the run playable
 * when no model is configured.
 */
export interface AnomalyQuestion {
  id: string;
  type: "anomaly";
  kind: "open" | "visual";
  prompt: string;
  /** Visual anomalies: image path under /public. PNG or JPEG. */
  image?: string;
  /** Description of the image for screen readers and the text-only fallback. */
  imageAlt?: string;
  /** What a full-marks answer must contain. Read by the model, never shown. */
  rubric: string;
  /** Keywords for the offline scorer. Case-insensitive substring match. */
  accept: string[];
  /** The answer, as shown to the player afterwards. */
  answerText: string;
  fact?: string;
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
  /** Exactly six. */
  options: string[];
  /** Indices into `options`. Exactly three, distinct. */
  answers: number[];
  fact?: string;
}

export type Question = McqQuestion | ClusterQuestion | AnomalyQuestion;

export interface Round {
  date: string;
  roundNumber: number;
  seed: number;
  theme: string;
  questions: Question[];
}

// --------------------------------------------------------------------- run

export type Phase =
  /** Engines lighting, first question not yet called. */
  | "intro"
  /** Question open, thrust draining, lanes tappable. */
  | "approach"
  /** A lane was picked: the ship is veering and the pod or boulder is inbound. */
  | "collecting"
  /** Anomaly answer sent, waiting on the scorer. Thrust frozen. */
  | "scanning"
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
  kind: "plasma" | "shield" | "boost";
  /** Headline, e.g. PLASMA COLLECTED. */
  label: string;
  /** Figure under it, e.g. "+1" or "1 SHIELD LOST". */
  detail: string;
}

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
  | "timeout";

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
  /** MCQ: chosen option index. Anomaly and timeout: null. */
  chosen: number | null;
  guessText: string;
  answerText: string;
  /** Anomaly only: model score 0..1 and its one-line verdict. */
  anomalyScore?: number;
  anomalyVerdict?: string;
  /** Cluster only: PLASMA banked by a burn (0 on a miss or a vent). */
  charge?: number;
  /** Cluster only: lanes picked, in order, including the fatal one on a miss. */
  picks?: number[];
}

/** Live state the HUD reads each frame. Flat and primitive on purpose. */
export interface GameState {
  phase: Phase;
  /** Index of the encounter in progress, or -1. */
  encounter: number;
  /** Encounters resolved so far. */
  resolved: number;
  /** Total distance this run, km. The score. */
  distance: number;
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
  /** Shields left. Each wrong lane costs one; at zero, a miss is a wreck. */
  shields: number;
  maxShields: number;
  /** The most recent collect or hit, for the HUD to flash. Never cleared mid-run. */
  pulse: Pulse | null;
  /** Outcome of the most recent encounter, while its toast is up. */
  outcome: Outcome | null;
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
  anomaly: boolean;
  /** Distance and velocity at the moment it happened. */
  d: number;
  v: number;
  /** Streak after the event. */
  streak: number;
  /** Burn events: plasma banked. */
  charge?: number;
}

/** Everything the share card and the record need. Serialisable. */
export interface RunSummary {
  date: string;
  roundNumber: number;
  theme: string;
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
  anomaly: { score: number; correct: boolean; verdict: string } | null;
  outcomes: Outcome[];
  samples: FlightSample[];
  events: RunEvent[];
  durationSeconds: number;
}

/** What the anomaly scorer returns, on the server and from the fallback. */
export interface AnomalyVerdict {
  /** 0..1. */
  score: number;
  /** One short line the player sees. */
  verdict: string;
  /** "model" when a model scored it, "local" for the keyword fallback. */
  source: "model" | "local";
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
