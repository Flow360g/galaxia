/** Shared types for the Galaxia engine. */

/** Rendering quality tier. 0 = high, 1 = mid, 2 = low. Indexes Tuning arrays. */
export type QualityTier = 0 | 1 | 2;

/** A question as authored in content/rounds/*.json. */
export type QuestionType = "numeric" | "ordinal" | "mcq";

export interface QuestionOption {
  label: string;
  /**
   * How close this option is to correct, 0..1. 1 is the right answer.
   * Present for `mcq`; the gradient mechanic consumes it.
   */
  proximity: number;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  /** Numeric/ordinal: the true value. MCQ: index of the correct option. */
  answer: number;
  /** Display unit for numeric answers, e.g. "year", "%", "million". */
  unit?: string;
  /** Numeric: the [min, max] band the gates span. */
  range?: [number, number];
  /** MCQ: the four answer asteroids, pre-ranked by proximity. */
  options?: QuestionOption[];
  /** Shown after the answer resolves. */
  fact?: string;
}

export interface Round {
  date: string;
  roundNumber: number;
  seed: number;
  theme: string;
  questions: Question[];
}

export type Band = "pinpoint" | "close" | "off" | "miss";

/** Live state the HUD reads each frame. Kept flat and primitive on purpose. */
export interface GameState {
  /** Total distance travelled this round, world units. */
  distance: number;
  /** Current world speed, world units/sec. */
  speed: number;
  /** Continuous lane position, e.g. 2.4 = 40% from lane 2 toward lane 3. */
  lanePosition: number;
  /** Nearest whole lane the ship currently occupies. */
  currentLane: number;
  /** Hull integrity 0..1. */
  hull: number;
  /** Points accumulated this round. */
  score: number;
  /** Index of the question currently approaching, or -1 between sets. */
  activeQuestion: number;
  /** Whether the approaching set is still steerable (not yet committed). */
  answering: boolean;
  /** Value the ship's current X maps to for a numeric question, else null. */
  liveGuess: number | null;
  /** Questions resolved so far. */
  questionsAnswered: number;
  running: boolean;
}

/** What the engine hands the scoring layer. */
export interface AnswerInput {
  question: Question;
  /** Continuous lane position at the moment of commit. */
  lanePosition: number;
  /** Whole lane at the moment of commit. */
  lane: number;
  /** Seconds between the question appearing and the commit. */
  elapsed: number;
  /** Seconds the player had in total before the commit line. */
  window: number;
}

export interface AnswerResult {
  /** 0..1. How right the answer was. The gradient. */
  accuracy: number;
  /** Points awarded. */
  points: number;
  /** Speed multiplier to apply as a consequence. 1 = no change. */
  speedMultiplier: number;
  /** Hull delta, negative for damage. */
  hullDelta: number;
  /** Bucket for the share grid. */
  band: Band;
  /** What the player effectively answered, formatted for the HUD. */
  guessText: string;
  /** The correct answer, formatted for the HUD. */
  answerText: string;
}

/** Emitted when a question resolves. */
export interface AnswerEvent {
  questionIndex: number;
  question: Question;
  result: AnswerResult;
}

/** Emitted once every question in the round has resolved. */
export interface RoundSummary {
  score: number;
  distance: number;
  hull: number;
  bands: Band[];
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
