import type { Question } from "./types";

/**
 * What each kind of question is called on screen: a plain phrase that says
 * what the player does, in words they already own. Imports nothing, so both
 * `phases.ts` (the cards) and `Score.ts` (the tally) can read it without a
 * cycle, and the run says one name for one game everywhere.
 *
 * The cluster's count is a constant here rather than read from `CLUSTER`
 * because Score.ts must stay free of feel constants; `phases.ts` asserts
 * the two agree at import.
 */
export const CLUSTER_FIND = 3;

export const PHASE_TITLE: Record<Question["type"], string> = {
  cluster: `FIND THE ${CLUSTER_FIND}`,
  vector: "GUESS THE NUMBER",
  mcq: "PICK ONE",
  earth: "NAME THE PLACE",
};
