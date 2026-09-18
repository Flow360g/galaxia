import type { AnswerInput, AnswerResult } from "./types";

/**
 * SCORING IS DELIBERATELY NOT IMPLEMENTED YET.
 *
 * The gradient-of-correctness mechanic is still an open design decision. The
 * four candidates are:
 *
 *   1. Flight path as answer  — continuous `lanePosition` read against a
 *                               numeric band. Gradient is distance on a
 *                               number line, so it is objective.
 *   2. Proximity-ranked MCQ   — whole `lane` picks an option; the option's
 *                               authored `proximity` is the gradient.
 *   3. Confidence wager       — binary correctness times a pre-committed
 *                               thrust multiplier.
 *   4. Hybrid                 — 1 for numeric questions, 2 for everything else.
 *
 * `AnswerInput` carries the union of what all four need (continuous position,
 * discrete lane, elapsed time and the answer window), so choosing a mechanic
 * means filling in this one function. Nothing else in the engine changes.
 *
 * Time decay is orthogonal and layers onto any of them: `elapsed / window`.
 */
export function scoreAnswer(input: AnswerInput): AnswerResult {
  void input;

  // Neutral result. The engine runs, the HUD renders, nothing is scored.
  return {
    accuracy: 0,
    points: 0,
    speedMultiplier: 1,
    hullDelta: 0,
    band: "miss",
  };
}

/**
 * Share-grid glyphs, kept here so the mechanic and its Wordle-style share
 * encoding stay in one place when scoring lands.
 */
export const BAND_GLYPH: Record<AnswerResult["band"], string> = {
  pinpoint: "\u{1F7E6}",
  close: "\u{1F7E8}",
  off: "\u{2B1C}",
  miss: "\u{2B1B}",
};
