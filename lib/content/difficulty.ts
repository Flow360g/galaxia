import { VECTOR } from "@/lib/game/Tuning";
import { toSlider } from "@/lib/game/nova";
import type { VectorQuestion } from "@/lib/game/types";

/**
 * How hard a question is allowed to be.
 *
 * Two separate rules live here, one for each way the pool used to drift.
 *
 * The first is geometry, and it is the one nobody could see. A vector is
 * scored on bands that are fractions of the ANSWER (`VECTOR.bands`), but it is
 * aimed on a slider that runs over an authored `min..max`. So how hard a
 * vector actually is comes down to how much of the slider track those bands
 * happen to cover, and that was never checked. Measured over the pool it ran
 * from 2.8% of the track to 100%: the Sun's surface temperature was a lottery
 * a hint could not rescue, while every "in which year" question covered the
 * whole track and handed out a direct hit for any slider position at all.
 *
 * The second is a declared level, 1 to 3, on every quiz question, because a
 * cluster's difficulty lives in its decoys and no amount of maths can read
 * that off the JSON. `content/AUTHORING.md` is the rubric; this file holds
 * only the numbers the build enforces.
 *
 * Both the loader and `scripts/audit-rounds.ts` read this module, so the rule
 * the build enforces and the rule the audit reports can never drift apart.
 * `toSlider` is borrowed from `nova.ts` rather than reimplemented for the same
 * reason: it is the maths the player's slider actually runs on.
 */

/**
 * How much of the slider track the CLOSE band (the answer give or take
 * `VECTOR.bands.close`) has to cover.
 *
 * Below the floor the question stops being knowledge and becomes a lottery.
 * The Sun's surface temperature shipped at 3.2%, so even after a hint narrowed
 * the slider to `VECTOR.novaWindow` the target was under a tenth of what was
 * lit, and a player who knew the answer to within a factor of two still took
 * the hit. Above the ceiling it is free points: at 100% every position on the
 * track scores, which is what five date questions were quietly doing.
 *
 * The floor is the number that matters. At 10% the graze band, which is where
 * damage stops, covers 15% of the track, so being roughly right is safe, and a
 * hint leaves the graze covering nearly half the lit window.
 */
export const TRACK_SHARE = { min: 0.1, max: 0.2 } as const;

/**
 * How far from either end of the slider the answer has to sit.
 *
 * The pool skewed hard to the left: thirteen of thirty-four answers sat in the
 * first third of the track, which wastes most of the slider and tells a player
 * who notices to aim low. It also keeps both ends of the track well outside
 * the graze band, so the extremes are always a real miss.
 */
export const ANSWER_INSET = 0.2;

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

/**
 * The share of the slider track covered by the close band.
 *
 * Deliberately unclamped: a band that runs off the end of the slider is the
 * symptom being looked for, and clamping it to 1 would hide how far off it is.
 */
export function trackShare(question: VectorQuestion): number {
  const { min, max, answer, log } = question;
  const close = VECTOR.bands.close;
  if (log && min > 0) {
    return Math.log((1 + close) / (1 - close)) / Math.log(max / min);
  }
  return (2 * close * answer) / (max - min);
}

/** Where the answer sits along the track, 0 at `min` and 1 at `max`. */
export function answerAt(question: VectorQuestion): number {
  return toSlider(question, question.answer);
}

/**
 * How far the slider's opening position is from the answer, as a share of the
 * track. The slider opens at the midpoint, so an answer parked near the middle
 * is a direct hit for touching nothing at all.
 */
export const SLIDER_OPENS_AT = 0.5;

/** Every rule this module holds, as pass or fail with a reason. */
export function checkVector(question: VectorQuestion): string[] {
  const faults: string[] = [];
  const share = trackShare(question);
  const at = answerAt(question);
  if (share < TRACK_SHARE.min) {
    faults.push(
      `the close band covers ${pct(share)} of the slider, under the ${pct(TRACK_SHARE.min)} floor`,
    );
  }
  if (share > TRACK_SHARE.max) {
    faults.push(
      `the close band covers ${pct(share)} of the slider, over the ${pct(TRACK_SHARE.max)} ceiling`,
    );
  }
  if (at < ANSWER_INSET || at > 1 - ANSWER_INSET) {
    faults.push(`the answer sits at ${pct(at)} along the slider, outside ${pct(ANSWER_INSET)} of either end`);
  }
  if (Math.abs(at - SLIDER_OPENS_AT) <= share / 2) {
    faults.push("the slider opens on the answer, so doing nothing scores");
  }
  return faults;
}

function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

/**
 * A `min..max` that satisfies every rule above, in round numbers.
 *
 * This exists so the validator's error message can name the range to use
 * rather than leaving an author to guess at it, and so a generated question
 * can ask for its range instead of inventing one. It aims at the middle of the
 * allowed band with the answer a little past the midpoint, then walks a short
 * grid of readable endpoints and returns the first pair that passes.
 */
export function rangeFor(answer: number): { min: number; max: number } {
  const close = VECTOR.bands.close;
  for (const share of [0.15, 0.14, 0.16, 0.13, 0.17, 0.12, 0.18]) {
    for (const at of [0.6, 0.62, 0.58, 0.65, 0.55, 0.68]) {
      const span = (2 * close * answer) / share;
      const min = readable(answer - at * span);
      const max = readable(min + span);
      if (min <= 0 || max <= min) continue;
      const candidate = { ...FAKE, answer, min, max } as VectorQuestion;
      if (checkVector(candidate).length === 0) return { min, max };
    }
  }
  // Nothing readable fit, which takes an answer small enough that rounding
  // swamps the span. Hand back the exact arithmetic rather than nothing.
  const span = (2 * close * answer) / 0.15;
  return { min: answer - 0.6 * span, max: answer + 0.4 * span };
}

/** The fields `checkVector` never reads, so a candidate can be built cheaply. */
const FAKE = { id: "", type: "vector", prompt: "", topic: "misc", difficulty: 2 } as const;

/**
 * A number an author would actually write on a slider end. One or two
 * significant figures, on the steps a person counts in.
 */
function readable(value: number): number {
  if (value <= 0) return 0;
  const decade = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const scaled = value / decade;
  let best = steps[0] as number;
  for (const step of steps) {
    if (Math.abs(step - scaled) < Math.abs(best - scaled)) best = step;
  }
  return Math.round(best * decade * 1000) / 1000;
}
