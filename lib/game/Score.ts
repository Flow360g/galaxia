import { CLUSTER_FIND, PHASE_TITLE } from "./phaseTitles";
import { FINALE, SCORE, VECTOR } from "./Tuning";
import type { FinaleTier, Outcome, Question, Round, ScoreLine } from "./types";

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
    default:
      return outcome.timedOut
        ? SCORE.penalty.timeout
        : outcome.kind === "wreck"
          ? SCORE.penalty.wreck
          : SCORE.penalty.collision;
  }
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
  // A vector is scored on the ruler: the notches between the guess and the
  // answer, whatever kind of outcome that made. A graze earns here too; it is
  // neutral for the streak and the hull, not for the score.
  if (outcome.notches !== undefined && !outcome.timedOut) {
    if (outcome.notches > VECTOR.wildBeyond) {
      const penalty = penaltyFor(outcome, question);
      return { base: 0, multiplier, points: penalty > 0 ? -penalty : 0 };
    }
    const base = Math.round(
      (question ? baseFor(question) : SCORE.perEncounter) * vectorShare(outcome.notches),
    );
    return { base, multiplier, points: base * multiplier };
  }
  // Docking is neutral until the satellite feed scores.
  if (outcome.kind === "dock") {
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
      // A dock left nothing on the table: there was nothing on it yet.
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
  if (outcome.timedOut) return "TOO SLOW";
  if (outcome.notches !== undefined) return vectorVerdict(outcome.notches);
  if (!outcome.correct) return outcome.kind === "wreck" ? "WRONG · NO SHIELDS" : "WRONG";
  if (outcome.kind === "burn") {
    const charge = outcome.charge ?? 0;
    const found = outcome.found ?? charge;
    // A boulder on the cluster's shield wipes what was banked, so what was
    // found and what was scored can differ. Say both rather than undercount.
    return found > charge
      ? `${found} OF ${CLUSTER_FIND} FOUND · ${charge} COUNTED`
      : `${found} OF ${CLUSTER_FIND} FOUND`;
  }
  return outcome.kind === "slingshot" ? "CORRECT · BOOSTED" : "CORRECT";
}

/**
 * How well the run went, for the finale. Full marks is its own tier; below it
 * the thresholds are shares of the perfect run, in `FINALE.tiers`.
 */
export function finaleTier(score: number, max: number): FinaleTier {
  if (!(max > 0)) return "complete";
  if (score >= max) return "perfect";
  const share = score / max;
  if (share >= FINALE.tiers.legendary) return "legendary";
  if (share >= FINALE.tiers.great) return "great";
  if (share >= FINALE.tiers.good) return "good";
  return "complete";
}

/** A tier as 0..1, for anything that scales with it (the finale's sound). */
export function tierStrength(tier: FinaleTier): number {
  switch (tier) {
    case "perfect":
      return 1;
    case "legendary":
      return 0.8;
    case "great":
      return 0.55;
    case "good":
      return 0.3;
    default:
      return 0;
  }
}

/**
 * A vector's share of its base, from the notches between guess and answer: a
 * straight line from 1 at a gap of 0 to nothing at `VECTOR.zeroAt`. There is
 * no step inside it, so one notch more always costs the same, and a near miss
 * is always worth nearly as much as a hit.
 */
export function vectorShare(notches: number): number {
  return Math.max(0, 1 - notches / VECTOR.zeroAt);
}

/**
 * What a gap is called: DEAD ON, WITHIN 5%, and so on, as a share of the
 * ruler, or WAY OFF past `VECTOR.wildBeyond`. The toast, the tally and the
 * scoring card all say it the same way.
 */
export function vectorVerdict(notches: number): string {
  if (notches > VECTOR.wildBeyond) return "WAY OFF";
  const band = VECTOR.verdicts.find((verdict) => notches <= verdict.within);
  return band?.label ?? "WAY OFF";
}
