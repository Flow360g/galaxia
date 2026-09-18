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
  [sampleRound.date]: sampleRound as Round,
};

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
