import { CLUSTER_FIND, PHASE_TITLE } from "./phaseTitles";
import { SCORE } from "./Tuning";
import type { Outcome, Question, Round, ScoreLine } from "./types";

/**
 * The score: fixed points, whole multipliers, flat penalties.
 *
 * Pure, like `Flight`, and deliberately separate from it. Distance is a
 * speedometer integrated over the run and makes a poor anchor, because
 * nobody knows whether 12,000 km is a good day. The score is countable: eight
 * encounters at a fixed base, no points multiplier, and a flat dock only where
 * the player took a risk on. The four phases weight evenly (400, 400, 400,
 * with WHERE ON EARTH the 600 finale), so "1,240 out of 1,800" reads the same
 * to everyone, which is what makes a run comparable in a group chat.
 *
 * The maximum is the perfect run: every encounter at full marks. The streak
 * multiplier is flat, so that is simply every base summed, and every line of
 * the end-of-run tally has an honest "of a possible" figure to sit against.
 */

/** Multiplier for the streak carried INTO an encounter. The top step holds. */
export function multiplierFor(streak: number): number {
  const steps = SCORE.streakMultipliers;
  const index = Math.min(Math.max(Math.floor(streak), 0), steps.length - 1);
  return steps[index]!;
}

/**
 * What an encounter is worth at full marks. WHERE ON EARTH has a base of its
 * own in `SCORE` so the finale can be weighted apart from the flight; it is
 * heavier than the rest (300 a site against 200), which is what makes its
 * phase the 600 to every other phase's 400.
 */
export function baseFor(question: Question): number {
  return question.type === "earth" ? SCORE.earthBase : SCORE.perEncounter;
}

/**
 * What a wrong answer costs, by where it went wrong. A cluster never docks:
 * losing one is worth zero and no less. A general knowledge lane docks only
 * with Boost pressed first, because that is the player choosing the stake.
 * The scout and the station keep the flat dock, doubled with no shields up.
 */
export function penaltyFor(outcome: Outcome, question?: Question): number {
  switch (question?.type) {
    case "cluster":
      return SCORE.penalty.cluster;
    case "mcq":
      return outcome.boosted ? SCORE.penalty.laneBoosted : SCORE.penalty.lane;
    case "vector":
      // The flat dock is what a WILD shot costs. A shot that missed by a
      // hair outside the graze band is not a wild shot and should not pay
      // like one, so the same severity that softens the impact softens the
      // dock, rounded to a multiple of 5 so the toast stays arcade. A
      // timeout is not a shot at all and keeps the flat figure.
      return outcome.timedOut
        ? SCORE.penalty.timeout
        : roundTo5(
            (outcome.kind === "wreck" ? SCORE.penalty.wreck : SCORE.penalty.collision) *
              (outcome.severity ?? 1),
          );
    default:
      return outcome.timedOut
        ? SCORE.penalty.timeout
        : outcome.kind === "wreck"
          ? SCORE.penalty.wreck
          : SCORE.penalty.collision;
  }
}

/** Docks land on a multiple of 5: -10, never -7. */
function roundTo5(points: number): number {
  return Math.round(points / 5) * 5;
}

/** Points on offer at encounter `index` of a perfect run. */
export function maxPointsAt(question: Question, index: number): number {
  return baseFor(question) * multiplierFor(index);
}

/** The perfect run's total: what every score is quoted out of. */
export function maxScoreFor(round: Round): number {
  return round.questions.reduce(
    (sum, question, index) => sum + maxPointsAt(question, index),
    0,
  );
}

/**
 * What an encounter earned, or cost. `base` is before the multiplier so the
 * tally can show the sum the player is being credited with.
 */
export function scoreOutcome(
  outcome: Outcome,
  question?: Question,
): { base: number; multiplier: number; points: number } {
  const multiplier = multiplierFor(outcome.streakBefore);
  // Docking is neutral until the satellite feed scores, and a vector graze is
  // neutral full stop: nothing earned, nothing docked, and the streak carried
  // in is left exactly as it was.
  if (outcome.kind === "dock" || outcome.kind === "graze") {
    return { base: 0, multiplier, points: 0 };
  }
  const share = shareOf(outcome);

  if (share <= 0) {
    // Wrong, or out of time. Usually nothing, sometimes a flat dock, and the
    // streak is gone either way, which is the bigger half of what it costs.
    const penalty = penaltyFor(outcome, question);
    // `-0` would print as a dock of nothing; a zero penalty is a plain 0.
    return { base: 0, multiplier, points: penalty > 0 ? -penalty : 0 };
  }

  const base = Math.round((question ? baseFor(question) : SCORE.perEncounter) * share);
  return { base, multiplier, points: base * multiplier };
}

/** The fraction of an encounter's base points the outcome earned, 0..1. */
function shareOf(outcome: Outcome): number {
  if (!outcome.correct) return 0;

  // WHERE ON EARTH: a right call, less whatever was bought to get there. The
  // floor keeps a fully assisted call worth having, so a player who needs the
  // help is not better off guessing blind.
  if (outcome.earthIntel !== undefined || outcome.earthOptics !== undefined) {
    const spent =
      SCORE.earthIntelCost * (outcome.earthIntel ?? 0) +
      SCORE.earthOpticsCost * (outcome.earthOptics ?? 0);
    return Math.max(SCORE.earthFloor, 1 - spent);
  }

  if (outcome.kind === "burn") {
    const charge = outcome.charge ?? 0;
    if (charge <= 0) return 0;
    return SCORE.clusterShare[Math.min(charge, SCORE.clusterShare.length) - 1] ?? 0;
  }
  if (outcome.error !== undefined) {
    return outcome.kind === "slingshot" ? SCORE.vectorDirect : SCORE.vectorGlance;
  }
  // A lane: full marks only with boost pressed before the answer. The perfect
  // run assumes it was, so the fixed total is the boosted one.
  return outcome.boosted ? 1 : SCORE.laneShare;
}

/** One line of the end-of-run tally, per encounter that was actually flown. */
export function scoreLines(round: Round, outcomes: Outcome[]): ScoreLine[] {
  return outcomes.map((outcome, index) => {
    const question = round.questions[index];
    return {
      index,
      type: question?.type,
      label: labelFor(question, index),
      detail: detailFor(outcome),
      base: outcome.base ?? 0,
      multiplier: outcome.multiplier ?? 1,
      points: outcome.points ?? 0,
      max: question ? maxPointsAt(question, index) : SCORE.perEncounter * multiplierFor(index),
      // A dock left nothing on the table: there was nothing on it yet. A
      // graze left all of it, and says so.
      full:
        outcome.kind === "dock" ||
        (question ? (outcome.base ?? 0) >= baseFor(question) : false),
    };
  });
}

function labelFor(question: Question | undefined, index: number): string {
  return question ? PHASE_TITLE[question.type] : `QUESTION ${index + 1}`;
}

/** The one short line the tally shows under a result. Arcade voice, no prose. */
function detailFor(outcome: Outcome): string {
  if (outcome.kind === "dock") return "ARRIVED";
  if (outcome.kind === "graze") return "NEAR MISS";
  if (outcome.timedOut) return "TOO SLOW";
  if (!outcome.correct) return outcome.kind === "wreck" ? "WRONG · NO SHIELDS" : "WRONG";
  if (outcome.kind === "burn") {
    const charge = outcome.charge ?? 0;
    return `${charge} OF ${CLUSTER_FIND} FOUND`;
  }
  if (outcome.error !== undefined) {
    return outcome.kind === "slingshot" ? "SPOT ON" : "CLOSE";
  }
  return outcome.kind === "slingshot" ? "CORRECT · BOOSTED" : "CORRECT";
}
