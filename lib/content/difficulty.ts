import { VECTOR } from "@/lib/game/Tuning";
import { toNotch } from "@/lib/game/nova";
import type { VectorQuestion } from "@/lib/game/types";

/**
 * How hard a question is allowed to be.
 *
 * Two rules live here. The first is the declared level, 1 to 3, on every
 * quiz question, because a cluster's difficulty lives in its decoys and no
 * amount of maths can read that off the JSON. `content/AUTHORING.md` is the
 * rubric; this file holds only the numbers the build enforces.
 *
 * The second is the shape of a number question's ruler. A vector is scored on
 * the notches between the guess and the answer (`VECTOR.notches`), so a range
 * is the band of believable answers and the score is where inside it the
 * truth falls. That makes two things worth checking. The answer must not sit
 * near either end, where one side of the ruler is wasted and a player learns
 * to aim at it. And every notch must be a round number, so the ruler reads
 * 5.8, 6, 6.2 and never 5.88, 6, 6.12: a readable step is also the one
 * objective test of "a range in round numbers".
 *
 * An earlier version scored against the answer and policed the range's width
 * instead. It ran the pool from a lottery (the Sun at 3.2% of the track) to
 * free points (every calendar year), and no setting of it was fun at both
 * ends. Scoring on the ruler removes the reason to police the width at all.
 *
 * Both the loader and `scripts/audit-rounds.ts` read this module, so what the
 * build enforces and what the audit reports can never drift apart.
 */

/**
 * Where the answer may sit on the ruler, in notches. Inside this, a guess
 * dropped in the middle is never more than `VECTOR.wildBeyond` notches off,
 * which is what keeps the wild-shot dock for confident guesses in the wrong
 * direction rather than for somebody who had no idea.
 */
export const ANSWER_NOTCHES = { min: 10, max: 90 } as const;

/** The top of any year ruler `rangeFor` suggests. */
const LATEST_YEAR = 2025;

/** The leading digits a notch may have: 1, 2, 2.5 or 5, times a power of ten. */
const READABLE = [1, 2, 2.5, 5] as const;

/** Declared difficulty. See `content/AUTHORING.md` for what each one means. */
export type Level = 1 | 2 | 3;

export const LEVELS: readonly Level[] = [1, 2, 3];

/**
 * The difficulty profile of one authored round's six quiz questions.
 *
 * A sum inside the band is what makes two days comparable; the counts are what
 * stop a round reaching that sum by pairing gifts with obscurities. The opener
 * is capped because a hard first question kills a run before the player is
 * warm, and the run is the product.
 */
export const ROUND_PROFILE = {
  sum: { min: 11, max: 13 },
  maxEasy: 2,
  maxHard: 2,
  /** The run's first question is never this hard. */
  openerMax: 2,
} as const;

/** Whether one notch covers a round amount: 0.2, 1, 2.5, 50, 5,000 and so on. */
export function isReadableStep(step: number): boolean {
  if (!(step > 0) || !Number.isFinite(step)) return false;
  const decade = Math.pow(10, Math.floor(Math.log10(step) + 1e-9));
  const lead = step / decade;
  return READABLE.some((digit) => Math.abs(lead - digit) < 1e-6);
}

/** What one notch of this question's ruler covers. */
export function stepOf(question: VectorQuestion): number {
  return (question.max - question.min) / VECTOR.notches;
}

/** Where the answer sits on the ruler, in notches from `min`. */
export function answerNotch(question: VectorQuestion): number {
  return toNotch(question, question.answer);
}

/**
 * How many notches a guess of twice the answer would land from it: the audit's
 * reading of how forgiving a range is. A wide range makes a factor of two
 * cheap; a tight one makes it wild.
 */
export function notchesForDouble(question: VectorQuestion): number {
  return Math.round((question.answer / stepOf(question)) * 1e6) / 1e6;
}

/** Every rule this module holds, as reasons it fails. Empty means it passes. */
export function checkVector(question: VectorQuestion): string[] {
  const faults: string[] = [];
  const step = stepOf(question);
  if (!isReadableStep(step)) {
    faults.push(
      `each of the ${VECTOR.notches} notches covers ${round(step)}, not a round number ` +
        `(1, 2, 2.5 or 5 times a power of ten)`,
    );
  }
  const at = answerNotch(question);
  if (at < ANSWER_NOTCHES.min || at > ANSWER_NOTCHES.max) {
    faults.push(
      `the answer sits at notch ${at}, outside ${ANSWER_NOTCHES.min} to ${ANSWER_NOTCHES.max}`,
    );
  }
  return faults;
}

/**
 * A range that passes every rule above, in round numbers, so the validator's
 * error can name one and a generated question can ask for one. From 0 where
 * it can be, which is how most believable ranges start; a year gets a
 * two-century window around it instead, because nobody guesses year 0.
 */
export function rangeFor(answer: number, year = false): { min: number; max: number } {
  if (year) {
    // A ruler that runs past today tells the player the answer is not in the
    // future, and wastes its top end doing it.
    const min = Math.min(Math.floor((answer - 100) / 50) * 50, LATEST_YEAR - 200);
    return { min, max: min + 200 };
  }
  const size = Math.abs(answer);
  for (let exponent = -3; exponent <= 12; exponent += 1) {
    for (const digit of READABLE) {
      const step = digit * Math.pow(10, exponent);
      const at = size / step;
      if (at <= 70 && at >= ANSWER_NOTCHES.min) {
        return { min: 0, max: round(step * VECTOR.notches) };
      }
    }
  }
  return { min: 0, max: round(size * 2) };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
