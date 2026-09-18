import { SCORING, WORLD } from "./Tuning";
import type { AnswerInput, AnswerResult, Band, Question } from "./types";

/**
 * The gradient-of-correctness mechanic. A hybrid:
 *
 *   - numeric questions read the ship's continuous `lanePosition` as a point
 *     on the question's number line (flight path as answer). Accuracy falls
 *     off linearly with distance from the truth and hits zero at
 *     `SCORING.numericTolerance` of the band.
 *   - MCQ questions read the whole `lane` and take the option's authored
 *     `proximity` as the accuracy.
 *
 * Time decay is deliberately not applied yet: the commit window is fixed by
 * world speed, so it would only double-count the speed ramp. `elapsed` and
 * `window` stay on `AnswerInput` for when that changes.
 */
export function scoreAnswer(input: AnswerInput): AnswerResult {
  const { question } = input;

  let accuracy: number;
  let guessText: string;
  let answerText: string;

  if (question.type === "mcq" && question.options) {
    const lane = clampInt(input.lane, 0, question.options.length - 1);
    const option = question.options[lane]!;
    accuracy = clamp01(option.proximity);
    guessText = option.label;
    answerText = question.options[question.answer]?.label ?? "";
  } else {
    const guess = laneToValue(question, input.lanePosition);
    const [min, max] = question.range ?? [0, 100];
    const span = Math.max(max - min, 1e-6);
    const error = Math.abs(guess - question.answer) / span;
    accuracy = clamp01(1 - error / SCORING.numericTolerance);
    guessText = formatValue(question, guess);
    answerText = formatValue(question, question.answer);
  }

  const band = bandFor(accuracy);
  // A miss scores nothing, whatever residual accuracy the curve leaves.
  const points =
    band === "miss"
      ? 0
      : Math.round(SCORING.maxPoints * Math.pow(accuracy, SCORING.pointCurve));

  return {
    accuracy,
    points,
    speedMultiplier: SCORING.multiplierFloor + SCORING.multiplierRange * accuracy,
    hullDelta: band === "miss" ? -SCORING.missHullDamage : 0,
    band,
    guessText,
    answerText,
  };
}

export function bandFor(accuracy: number): Band {
  if (accuracy >= SCORING.pinpoint) return "pinpoint";
  if (accuracy >= SCORING.close) return "close";
  if (accuracy >= SCORING.off) return "off";
  return "miss";
}

/** Map a continuous lane position onto the question's numeric range. */
export function laneToValue(question: Question, lanePosition: number): number {
  const [min, max] = question.range ?? [0, 100];
  const t = clamp01(lanePosition / Math.max(WORLD.laneCount - 1, 1));
  return min + (max - min) * t;
}

/** Numeric value rounded to a step that suits the question's range. */
export function roundValue(question: Question, value: number): number {
  const [min, max] = question.range ?? [0, 100];
  const span = max - min;
  return span > 50 ? Math.round(value) : Math.round(value * 10) / 10;
}

/** Value displayed on a numeric question, with its unit. */
export function formatValue(question: Question, value: number): string {
  const rounded = roundValue(question, value);
  const unit = question.unit;
  if (!unit || unit === "year") return `${rounded}`;
  if (unit === "%") return `${rounded}%`;
  return `${rounded} ${unit}`;
}

/**
 * Lane labels for a question. MCQ shows its options; numeric shows the gate
 * value at each lane's centre, since the answer is read continuously.
 *
 * Numeric labels carry no unit: four lanes are only a few dozen pixels apart
 * at the range they first appear, and "100 bones" is wider than that gap.
 * The HUD readout and the resolve toast carry the unit instead.
 */
export function labelsForQuestion(question: Question, laneCount: number): string[] {
  if (question.type === "mcq" && question.options) {
    return question.options.slice(0, laneCount).map((option) => option.label);
  }

  const labels: string[] = [];
  for (let lane = 0; lane < laneCount; lane += 1) {
    labels.push(`${roundValue(question, laneToValue(question, lane))}`);
  }
  return labels;
}

/**
 * Share-grid glyphs, kept here so the mechanic and its Wordle-style share
 * encoding stay in one place.
 */
export const BAND_GLYPH: Record<Band, string> = {
  pinpoint: "\u{1F7E6}",
  close: "\u{1F7E8}",
  off: "\u{2B1C}",
  miss: "\u{2B1B}",
};

export const BAND_LABEL: Record<Band, string> = {
  pinpoint: "PINPOINT",
  close: "CLOSE",
  off: "OFF",
  miss: "MISS",
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  return rounded < min ? min : rounded > max ? max : rounded;
}
