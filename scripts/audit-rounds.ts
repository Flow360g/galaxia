/**
 * What the question pool currently looks like.
 *
 * CLAUDE.md has always said the pool is levelled by hand when it drifts and
 * that the spread should be checked after adding a batch. This is that check,
 * as a command, because "by hand" meant nobody did it: the pool reached a
 * 260-fold difficulty swing inside GUESS THE NUMBER without anybody seeing it.
 *
 * It reads the JSON directly rather than through `lib/content/round.ts`, which
 * throws on a bad round at import. That is deliberate: this is the tool for
 * fixing a pool that does not validate yet, so it has to survive one. The
 * maths comes from `lib/content/difficulty.ts`, the same module the build
 * validates with, so the audit and the build can never disagree.
 *
 *     npm run audit:rounds
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pickSites } from "@/lib/content/sites";
import {
  ROUND_PROFILE,
  TRACK_SHARE,
  answerAt,
  checkVector,
  rangeFor,
  trackShare,
} from "@/lib/content/difficulty";
import type { Question, Round, Topic, VectorQuestion } from "@/lib/game/types";

const DIR = join(process.cwd(), "content", "rounds");

const rounds: Round[] = readdirSync(DIR)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(DIR, name), "utf8")) as Round);

const quiz = (round: Round) => round.questions.filter((q) => q.type !== "earth");
const levelOf = (q: Question) => (q.type === "earth" ? 0 : ((q.difficulty as number) ?? 0));

let faults = 0;
const flag = (line: string) => {
  faults += 1;
  return `  !! ${line}`;
};

// ------------------------------------------------------------ per round
head("ROUNDS", "difficulty profile and topic spread");
for (const round of rounds) {
  const levels = quiz(round).map(levelOf);
  const sum = levels.reduce((a, b) => a + b, 0);
  const shape = levels.map((l) => (l === 0 ? "?" : l)).join("");
  const notes: string[] = [];
  if (levels.some((l) => l === 0)) notes.push(flag("a question has not declared its difficulty"));
  else {
    if (sum < ROUND_PROFILE.sum.min || sum > ROUND_PROFILE.sum.max) {
      notes.push(flag(`sum ${sum} is outside ${ROUND_PROFILE.sum.min}..${ROUND_PROFILE.sum.max}`));
    }
    const easy = levels.filter((l) => l === 1).length;
    const hard = levels.filter((l) => l === 3).length;
    if (easy > ROUND_PROFILE.maxEasy) notes.push(flag(`${easy} at difficulty 1`));
    if (hard > ROUND_PROFILE.maxHard) notes.push(flag(`${hard} at difficulty 3`));
    if ((levels[0] ?? 0) > ROUND_PROFILE.openerMax) notes.push(flag(`opens on difficulty ${levels[0]}`));
  }
  const corners = new Map<Topic, number>();
  for (const q of quiz(round)) corners.set(q.topic, (corners.get(q.topic) ?? 0) + 1);
  const heavy = [...corners.entries()].filter(([, n]) => n > 2);
  for (const [topic, n] of heavy) notes.push(flag(`${n} questions on ${topic}`));
  console.log(`  ${round.date}  ${shape}  sum ${String(sum).padStart(2)}  ${spread(corners)}`);
  for (const note of notes) console.log(note);
}

// ----------------------------------------------------- pool difficulty
head("DIFFICULTY", "across the whole pool");
for (const type of ["cluster", "vector", "mcq"] as const) {
  const all = rounds.flatMap((r) => r.questions).filter((q) => q.type === type);
  const counts = [1, 2, 3].map((l) => all.filter((q) => levelOf(q) === l).length);
  const untagged = all.filter((q) => levelOf(q) === 0).length;
  const mean = all.length ? counts.reduce((a, n, i) => a + n * (i + 1), 0) / (all.length - untagged || 1) : 0;
  console.log(
    `  ${type.padEnd(8)} 1:${String(counts[0]).padStart(3)}  2:${String(counts[1]).padStart(3)}  ` +
      `3:${String(counts[2]).padStart(3)}  untagged:${String(untagged).padStart(3)}  mean ${mean.toFixed(2)}`,
  );
}

// ------------------------------------------------------ vector geometry
head("GUESS THE NUMBER", `close band must cover ${pct(TRACK_SHARE.min)}..${pct(TRACK_SHARE.max)} of the slider`);
console.log("  round       id    answer         range                 band    at    ");
for (const round of rounds) {
  for (const q of round.questions) {
    if (q.type !== "vector") continue;
    const v = q as VectorQuestion;
    const bad = checkVector(v);
    const range = `${fmt(v.min)}..${fmt(v.max)}${v.log ? " log" : ""}`;
    console.log(
      `  ${round.date}  ${v.id.padEnd(4)}  ${fmt(v.answer).padStart(10)}  ${range.padEnd(20)}  ` +
        `${pct(trackShare(v)).padStart(6)}  ${answerAt(v).toFixed(2)}  ${bad.length ? "FAIL" : "ok"}`,
    );
    for (const fault of bad) console.log(flag(fault));
    if (bad.length) {
      const fix = rangeFor(v.answer);
      console.log(`     try min ${fmt(fix.min)}, max ${fmt(fix.max)}`);
    }
  }
}

// --------------------------------------------------------- lane spread
head("CORRECT LANE", "a player who notices a pattern stops reading the question");
const clusterLanes = new Array(6).fill(0);
for (const q of rounds.flatMap((r) => r.questions)) {
  if (q.type === "cluster") for (const i of q.answers) clusterLanes[i] += 1;
}
console.log(`  cluster  ${clusterLanes.map((n, i) => `${i + 1}:${String(n).padStart(3)}`).join("  ")}`);
const mcqLanes = new Array(4).fill(0);
for (const q of rounds.flatMap((r) => r.questions)) {
  if (q.type === "mcq") mcqLanes[q.answer] += 1;
}
console.log(`  pick one ${mcqLanes.map((n, i) => `${i + 1}:${String(n).padStart(3)}`).join("  ")}`);
lean(clusterLanes, "cluster");
lean(mcqLanes, "pick one");
// Odd against even, because that is the shape the bias actually took: answers
// written into lanes 1, 3 and 5 balance per-lane counts well enough to pass a
// per-lane check while still being a pattern a player can read off the row.
const odd = clusterLanes.filter((_, i) => i % 2 === 0).reduce((a: number, b: number) => a + b, 0);
const even = clusterLanes.filter((_, i) => i % 2 === 1).reduce((a: number, b: number) => a + b, 0);
if (Math.abs(odd - even) > (odd + even) * 0.15) {
  console.log(flag(`cluster answers sit on odd lanes ${odd} times against ${even} on even ones`));
}

function lean(lanes: number[], what: string): void {
  const level = lanes.reduce((a: number, b: number) => a + b, 0) / lanes.length;
  for (const [i, n] of lanes.entries()) {
    if (Math.abs(n - level) > Math.max(level * 0.3, 2)) {
      console.log(flag(`${what} lane ${i + 1} holds ${n} answers against an even ${level.toFixed(0)}`));
    }
  }
}

// --------------------------------------------------------- site tiers
head("WHERE ON EARTH", "the finale ramps: opener from easy or medium, closer from medium or hard");
const slots = [new Map<string, number>(), new Map<string, number>()];
for (let d = 0; d < 180; d += 1) {
  const key = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
  pickSites(key).forEach((site, i) => {
    const slot = slots[i] as Map<string, number>;
    slot.set(site.tier, (slot.get(site.tier) ?? 0) + 1);
  });
}
slots.forEach((slot, i) => {
  const parts = ["easy", "medium", "hard"].map((t) => `${t}:${String(slot.get(t) ?? 0).padStart(3)}`);
  console.log(`  site ${i + 1}   ${parts.join("  ")}`);
});

console.log(
  faults === 0
    ? "\n  Nothing to level.\n"
    : `\n  ${faults} thing${faults === 1 ? "" : "s"} to level. See content/AUTHORING.md.\n`,
);
process.exit(faults === 0 ? 0 : 1);

function head(title: string, note: string): void {
  console.log(`\n${title}  ${note}\n${"-".repeat(72)}`);
}

function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

function fmt(v: number): string {
  return v.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}

function spread(corners: Map<Topic, number>): string {
  return [...corners.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([topic, n]) => (n > 1 ? `${topic} x${n}` : topic))
    .join(", ");
}
