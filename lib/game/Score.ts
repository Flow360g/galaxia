import { SCORE } from "./Tuning";
import type { Outcome, Question, Round, ScoreLine } from "./types";

/**
 * The score: fixed points, whole multipliers, flat penalties.
 *
 * Pure, like `Flight`, and deliberately separate from it. Distance is a
 * speedometer integrated over the run and makes a poor anchor, because
 * nobody knows whether 12,000 km is a good day. The score is countable: seven
 * encounters, the same base each, a streak multiplier in whole steps, and a
 * flat dock for a wrong answer. "1,880 out of 2,400" reads the same to
 * everyone, which is what makes a run comparable in a group chat.
 *
 * The maximum is the perfect run: every encounter at full marks, so the
 * streak going into encounter `i` is exactly `i`. That gives every line of
 * the end-of-run tally an honest "of a possible" figure to sit against.
 */

/** Multiplier for the streak carried INTO an encounter. The top step holds. */
export function multiplierFor(streak: number): number {
  const steps = SCORE.streakMultipliers;
  const index = Math.min(Math.max(Math.floor(streak), 0), steps.length - 1);
  return steps[index]!;
}

/**
 * What an encounter is worth before the multiplier. WHERE ON EARTH is the
 * finale and carries double, so the quoted total rises with it rather than the
 * finale being worth no more than an mcq.
 */
export function baseFor(question: Question): number {
  return question.type === "earth" ? SCORE.earthBase : SCORE.perEncounter;
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
  // Docking is neutral until the satellite feed scores: nothing earned,
  // nothing docked, and the streak carried in is left exactly as it was.
  if (outcome.kind === "dock") return { base: 0, multiplier, points: 0 };
  const share = shareOf(outcome);

  if (share <= 0) {
    // Wrong, or out of time. A flat dock, and the streak is gone anyway,
    // which is the bigger half of what it costs.
    const penalty = outcome.timedOut
      ? SCORE.penalty.timeout
      : outcome.kind === "wreck"
        ? SCORE.penalty.wreck
        : SCORE.penalty.collision;
    return { base: 0, multiplier, points: -penalty };
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
  return 1;
}

/** One line of the end-of-run tally, per encounter that was actually flown. */
export function scoreLines(round: Round, outcomes: Outcome[]): ScoreLine[] {
  return outcomes.map((outcome, index) => {
    const question = round.questions[index];
    return {
      index,
      label: labelFor(question, index),
      detail: detailFor(outcome),
      base: outcome.base ?? 0,
      multiplier: outcome.multiplier ?? 1,
      points: outcome.points ?? 0,
      max: question ? maxPointsAt(question, index) : SCORE.perEncounter * multiplierFor(index),
      // A dock left nothing on the table: there was nothing on it yet.
      full:
        outcome.kind === "dock" ||
        (question ? (outcome.base ?? 0) >= baseFor(question) : false),
    };
  });
}

function labelFor(question: Question | undefined, index: number): string {
  switch (question?.type) {
    case "cluster":
      return "CLUSTER";
    case "vector":
      return "VECTOR";
    case "earth":
      return "WHERE ON EARTH";
    case "mcq":
      return "LANE";
    default:
      return `ENCOUNTER ${index + 1}`;
  }
}

/** The one short line the tally shows under a result. Arcade voice, no prose. */
function detailFor(outcome: Outcome): string {
  if (outcome.kind === "dock") return "FEED STANDING BY";
  if (outcome.timedOut) return "OUT OF TIME";
  if (!outcome.correct) return outcome.kind === "wreck" ? "WRECKED" : "MISSED";
  if (outcome.kind === "burn") {
    const charge = outcome.charge ?? 0;
    return `${charge} PLASMA BANKED`;
  }
  if (outcome.error !== undefined) {
    return outcome.kind === "slingshot" ? "DIRECT HIT" : "GLANCING HIT";
  }
  return outcome.kind === "slingshot" ? "SLINGSHOT" : "LANE CLEAR";
}
