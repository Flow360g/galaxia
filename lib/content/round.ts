import sampleRound from "@/content/rounds/2026-09-18.json";
import type { Round } from "@/lib/game/types";

/**
 * Round loading.
 *
 * v1 keeps rounds as static JSON committed to the repo: zero infrastructure,
 * zero runtime cost, and the bundle is a few kilobytes. When the group
 * leaderboard lands this is the one module that changes, and its signature
 * already returns a promise so callers do not need to.
 */

const ROUNDS: Record<string, Round> = {
  [sampleRound.date]: validate(sampleRound as Round),
};

/**
 * A malformed round should fail at import, in the build, not mid-flight for
 * a player. Clusters are the fiddly ones: six lanes, three distinct answers.
 */
function validate(round: Round): Round {
  const stages = round.stages ?? [];
  stages.forEach((stage, i) => {
    const previous = stages[i - 1];
    if (!Number.isInteger(stage.after) || stage.after < 0 || stage.after >= round.questions.length) {
      throw new Error(`Round ${round.date} stage ${stage.name}: after=${stage.after} out of range`);
    }
    if (previous && previous.after >= stage.after) {
      throw new Error(`Round ${round.date} stage ${stage.name}: stages must end in ascending order`);
    }
  });
  for (const question of round.questions) {
    if (question.type === "vector") {
      const { min, max, answer, tolerance, log } = question;
      if (!(min < answer && answer < max)) {
        throw new Error(`Round ${round.date} vector ${question.id}: answer must sit inside min..max`);
      }
      if (!(tolerance > 0)) {
        throw new Error(`Round ${round.date} vector ${question.id}: tolerance must be positive`);
      }
      if (log && !(min > 0)) {
        throw new Error(`Round ${round.date} vector ${question.id}: log scale needs min > 0`);
      }
      continue;
    }
    if (question.type !== "cluster") continue;
    const lanes = question.options.length;
    const answers = new Set(question.answers);
    if (lanes !== 6) {
      throw new Error(`Round ${round.date} cluster ${question.id}: ${lanes} options, need 6`);
    }
    if (answers.size !== 3 || question.answers.length !== 3) {
      throw new Error(`Round ${round.date} cluster ${question.id}: need 3 distinct answers`);
    }
    for (const index of answers) {
      if (!Number.isInteger(index) || index < 0 || index >= lanes) {
        throw new Error(`Round ${round.date} cluster ${question.id}: answer ${index} out of range`);
      }
    }
  }
  return round;
}

/** Local calendar date as YYYY-MM-DD. Rounds turn over at the player's midnight. */
export function todayKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The round for a given date, falling back to the sample.
 *
 * The fallback is deliberate: a missing day must never be a blank screen for
 * someone who followed a shared link.
 */
export function getRound(date: string = todayKey()): Round {
  return ROUNDS[date] ?? (sampleRound as Round);
}

export function getSampleRound(): Round {
  return sampleRound as Round;
}
