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

export type Question = McqQuestion | AnomalyQuestion;

export interface Round {
  date: string;
  roundNumber: number;
  seed: number;
  theme: string;
  questions: Question[];
}

// --------------------------------------------------------------------- run

export type Phase =
  /** Engines lighting, first asteroid not yet called. */
  | "intro"
  /** Asteroid looming, thrust draining, answer open. */
  | "approach"
  /** Anomaly answer sent, waiting on the scorer. Thrust frozen. */
  | "scanning"
  /** Answer locked, asteroid striking, outcome animating. */
  | "resolving"
  /** Outcome toast up, velocity settling, next asteroid queued. */
  | "aftermath"
  | "finished";

export type NovaKind = "eliminate" | "clue" | "narrow";

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
  /** Wrong with boost armed: hit it at speed. */
  | "wreck"
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
