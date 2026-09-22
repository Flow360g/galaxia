import round20260918 from "@/content/rounds/2026-09-18.json";
import round20260920 from "@/content/rounds/2026-09-20.json";
import round20260921 from "@/content/rounds/2026-09-21.json";
import round20260922 from "@/content/rounds/2026-09-22.json";
import round20260923 from "@/content/rounds/2026-09-23.json";
import round20260924 from "@/content/rounds/2026-09-24.json";
import round20260925 from "@/content/rounds/2026-09-25.json";
import round20260926 from "@/content/rounds/2026-09-26.json";
import round20260927 from "@/content/rounds/2026-09-27.json";
import round20260928 from "@/content/rounds/2026-09-28.json";
import round20260929 from "@/content/rounds/2026-09-29.json";
import round20260930 from "@/content/rounds/2026-09-30.json";
import round20261001 from "@/content/rounds/2026-10-01.json";
import round20261002 from "@/content/rounds/2026-10-02.json";
import round20261003 from "@/content/rounds/2026-10-03.json";
import round20261004 from "@/content/rounds/2026-10-04.json";
import round20261005 from "@/content/rounds/2026-10-05.json";
import { pickSites } from "@/lib/content/sites";
import { toleranceOf } from "@/lib/game/Run";
import { stepFor } from "@/lib/game/nova";
import { VECTOR } from "@/lib/game/Tuning";
import { TOPICS } from "@/lib/game/types";
import type { EarthQuestion, Question, Round, Topic } from "@/lib/game/types";

/**
 * Round loading.
 *
 * v1 keeps rounds as static JSON committed to the repo: zero infrastructure,
 * zero runtime cost, and the bundle is a few kilobytes. When the group
 * leaderboard lands this is the one module that changes.
 *
 * The rounds form a pool. A date with a round of its own gets that round; any
 * other date is served one from the pool, chosen by the day number, so a day
 * nobody authored still gets a fresh round, everyone on that day gets the
 * same one, and a shared link never lands on a blank screen. Adding a round
 * is one JSON file and one line in `POOL`.
 */

/** The corners, as a set, for the tag check below. */
const KNOWN_TOPICS = new Set<string>(TOPICS);

/** No round leans more than this many questions on one corner. */
const TOPIC_CAP = 2;

const POOL: Round[] = [
  round20260918,
  round20260920,
  round20260921,
  round20260922,
  round20260923,
  round20260924,
  round20260925,
  round20260926,
  round20260927,
  round20260928,
  round20260929,
  round20260930,
  round20261001,
  round20261002,
  round20261003,
  round20261004,
  round20261005,
]
  // Hydrate before validating: the earth slots carry no site of their own, so
  // validation has nothing to check until the pool has filled them in.
  .map((round) => validate(hydrateEarth(round as unknown as Round), true))
  .sort((a, b) => a.date.localeCompare(b.date));

const ROUNDS: Record<string, Round> = Object.fromEntries(POOL.map((round) => [round.date, round]));

const sampleRound = POOL[0]!;

/**
 * No two quiz questions in the pool may ask the same thing.
 *
 * Cross-round, so `validate` cannot hold it: a duplicate is only visible with
 * every round in hand. It shipped eight times before this existed, and the
 * practice shuffle is where it showed, because a draw of two from twenty-four
 * lands the same pair often. Earth slots are exempt: they carry the same two
 * lines in every round by design, and the site itself comes from `pickSites`.
 *
 * Normalised hard enough that "How many bones are in an adult human body?" and
 * "How many bones are there in an adult human body?" collide. A near-duplicate
 * that survives this (the same question with its unit spelled out) is still on
 * the author to spot; the rule is here to stop the exact repeat coming back.
 */
function askedAs(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(?:the|a|an|of|is|are|there|in|on|at|to|do|does|your|it)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

{
  const seen = new Map<string, string>();
  for (const round of POOL) {
    for (const question of round.questions) {
      if (question.type === "earth") continue;
      const key = askedAs(question.prompt);
      const first = seen.get(key);
      if (first) {
        throw new Error(
          `Round ${round.date} ${question.id} asks what ${first} already asks: ` +
            `"${question.prompt}". The pool is drawn from two at a time, so a ` +
            `repeat comes round fast. Write a different question.`,
        );
      }
      seen.set(key, `${round.date} ${question.id}`);
    }
  }
}

/**
 * WHERE ON EARTH slots carry only an id and a prompt; the site itself comes
 * from the pool, seeded by the round's own date. That is what lets a day be
 * generated rather than authored, and it keeps the pair identical for every
 * player on that date, which is the basis of comparing two runs.
 *
 * Seeded on `round.date` rather than on today, so a round is the same round
 * whenever it is loaded: replays, tests and the fallback all agree.
 */
function hydrateEarth(round: Round, seed: string = round.date): Round {
  const sites = pickSites(seed);
  let next = 0;
  const questions = round.questions.map((question) => {
    if (question.type !== "earth") return question;
    const site = sites[Math.min(next, sites.length - 1)];
    next += 1;
    if (!site) return question;
    // Lane order is seeded on the site id, so two players comparing runs saw
    // the same four names in the same order.
    const options = seededShuffle([site.name, ...site.decoys], site.id);
    const filled: EarthQuestion = {
      ...question,
      name: site.name,
      country: site.country,
      lat: site.lat,
      lon: site.lon,
      zoom: site.zoom,
      options,
      answer: options.indexOf(site.name),
      opener: site.opener,
      clue: site.clue,
      landmark: site.landmark,
      street: site.street,
      structure: site.structure,
      accept: site.accept,
      fact: site.fact,
    };
    return filled;
  });
  return { ...round, questions };
}

/** A string folded into an integer. The seed for everything stable below. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Stable shuffle: the same seed always gives the same order.
 *
 * Fisher-Yates on a seeded stream.
 *
 * The stream used to be a plain LCG read as `hash % (i + 1)`, and an LCG's low
 * bits are the ones that barely move: over 5,000 draws from a 34 question
 * pool, the first item never once came out in the leading two, while the
 * second came out three and a half times more often than chance. That, far
 * more than the size of the pool, is why a practice run kept asking the same
 * questions. So: a proper 32-bit mixer, read from the top bits down.
 */
function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = hashSeed(seed) | 0;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    const roll = (z ^ (z >>> 15)) >>> 0;
    const j = Math.floor((roll / 0x100000000) * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/**
 * A malformed round should fail at import, in the build, not mid-flight for
 * a player. Clusters are the fiddly ones: six lanes, three distinct answers.
 *
 * `authored` marks a round somebody wrote as a day, which is held to the one
 * rule a random draw cannot be: no more than two questions from any one
 * corner. The practice shuffle passes false, because a draw from the whole
 * pool can legitimately land three of a kind and a hatch nobody but a tester
 * sees is not worth failing the build over. See `getShuffledRound`.
 */
function validate(round: Round, authored = false): Round {
  const stages = round.stages ?? [];
  stages.forEach((stage, i) => {
    const previous = stages[i - 1];
    if (!Number.isInteger(stage.after) || stage.after < 0 || stage.after >= round.questions.length) {
      throw new Error(`Round ${round.date} stage ${stage.name}: after=${stage.after} out of range`);
    }
    if (previous && previous.after >= stage.after) {
      throw new Error(`Round ${round.date} stage ${stage.name}: stages must end in ascending order`);
    }
    // A stage may skip a phase number but never go backwards: the card
    // announces these, and they have to count up.
    if (stage.phase !== undefined) {
      const previousPhase = previous ? (previous.phase ?? i) : 0;
      if (!Number.isInteger(stage.phase) || stage.phase <= previousPhase) {
        throw new Error(`Round ${round.date} stage ${stage.name}: phase=${stage.phase} must count up`);
      }
    }
  });
  // The JSON is cast, never type-checked, so a question that forgot its corner
  // or invented one gets here intact. This is the only thing that catches it.
  const corners = new Map<Topic, number>();
  for (const question of round.questions) {
    if (question.type === "earth") continue;
    const topic = question.topic as string | undefined;
    if (!topic || !KNOWN_TOPICS.has(topic)) {
      throw new Error(
        `Round ${round.date} ${question.type} ${question.id}: topic "${topic}" is not a corner. ` +
          `One of: ${TOPICS.join(", ")}.`,
      );
    }
    corners.set(question.topic, (corners.get(question.topic) ?? 0) + 1);
  }
  if (authored) {
    for (const [topic, count] of corners) {
      if (count > TOPIC_CAP) {
        throw new Error(
          `Round ${round.date}: ${count} questions on ${topic}, at most ${TOPIC_CAP}. ` +
            `A day that leans on one corner reads as a specialist's quiz.`,
        );
      }
    }
  }
  for (const question of round.questions) {
    if (question.type === "earth") {
      const { options, answer, name, lat, lon, zoom } = question;
      if (options.length !== 4 || new Set(options).size !== 4) {
        throw new Error(`Round ${round.date} earth ${question.id}: need 4 distinct options`);
      }
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
        throw new Error(`Round ${round.date} earth ${question.id}: answer ${answer} out of range`);
      }
      if (options[answer] !== name) {
        throw new Error(`Round ${round.date} earth ${question.id}: options[answer] must be the name`);
      }
      if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) {
        throw new Error(`Round ${round.date} earth ${question.id}: lat/lon out of range`);
      }
      if (!Number.isInteger(zoom) || zoom < 1 || zoom > 18) {
        throw new Error(`Round ${round.date} earth ${question.id}: zoom must be 1..18`);
      }
      continue;
    }
    if (question.type === "vector") {
      const { min, max, answer, log } = question;
      if (!(min < answer && answer < max)) {
        throw new Error(`Round ${round.date} vector ${question.id}: answer must sit inside min..max`);
      }
      // The scoring bands are fractions of the answer, so zero has no bands.
      if (!(Math.abs(answer) > 0)) {
        throw new Error(`Round ${round.date} vector ${question.id}: answer must not be zero`);
      }
      if (log && !(min > 0)) {
        throw new Error(`Round ${round.date} vector ${question.id}: log scale needs min > 0`);
      }
      // A question with whole ends close together aims in whole units, so a
      // fractional answer has to be reachable: the nearest whole number must
      // still be a direct hit, or the question can never be answered fully.
      // An answer of 2.5 on a 1..10 slider is the shape that fails here.
      if (stepFor(question) > 0 && Math.abs(Math.round(answer) - answer) > toleranceOf(question).direct) {
        throw new Error(
          `Round ${round.date} vector ${question.id}: this slider aims in whole units and ${answer} ` +
            `is not reachable. Widen min..max past ${VECTOR.snapMaxSpan}, or round the answer.`,
        );
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
 * The round for a given date.
 *
 * A round authored for that exact date wins. Any other date rotates through
 * the pool by day number and is served stamped with the date asked for, so
 * the run is stored against the day it was flown and the title reads today.
 * Anything that is not a `YYYY-MM-DD` key is treated as today, which is what
 * makes `?round=` safe to leave in a shared link.
 */
export function getRound(date: string | undefined = todayKey()): Round {
  const key = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
  const exact = ROUNDS[key];
  if (exact) return exact;
  const rotated = POOL[((dayNumber(key) % POOL.length) + POOL.length) % POOL.length]!;
  // The quiz repeats, but the landing sites should not: re-seed them on the
  // date actually being played, so two days rotating to the same round still
  // get their own pair. Everyone on that day still sees the same two.
  return hydrateEarth({ ...rotated, date: key });
}

/** Whole days since the epoch for a `YYYY-MM-DD` key. */
function dayNumber(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

export function getSampleRound(): Round {
  return sampleRound;
}

// -------------------------------------------------------------- the shuffle

/** How many of each kind of question a round is built from. */
const MIX: ReadonlyArray<{ type: Question["type"]; count: number }> = [
  { type: "cluster", count: 2 },
  { type: "vector", count: 2 },
  { type: "mcq", count: 2 },
];

/**
 * A round built from the whole pool rather than authored as a day.
 *
 * **A dev and QA hatch, like `?replay=1` and `?round=`, and not a mode.** The
 * daily round is the product: one a day, the same eight questions for
 * everybody, and a score that means the same thing in a group chat. A round
 * you can reroll is none of those, which is why it is reachable only from
 * `/play?shuffle=` and why the run it produces is never recorded. It exists so
 * that testing the game does not mean answering the same eight questions
 * until they are memorised.
 *
 * Seeded on the string it is given, so a seed always rebuilds the same round:
 * a shuffle that could not be handed to somebody else is no use for reporting
 * a bug against.
 */
/**
 * A fresh seed for a practice run. Called from a click handler, never during
 * a render: the seed goes in the URL so the round it builds can be opened
 * again, which a seed made up on the server could not be.
 */
export function newShuffleSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function getShuffledRound(seed: string): Round {
  const questions: Question[] = [];
  // Spread the corners as the draw goes. A blind draw from a pool this size
  // handed testers three space questions often enough to be the reason the
  // pool was widened in the first place. It only ever reads the already
  // seeded order, so a seed still rebuilds the identical round.
  const corners = new Map<Topic, number>();

  for (const { type, count } of MIX) {
    const pool = POOL.flatMap((round) => round.questions).filter((q) => q.type === type);
    const shuffled = seededShuffle(pool, `${seed}:${type}`);
    for (let taken = 0; taken < count; taken += 1) {
      // First choice that keeps the round inside the cap; failing that, the
      // first one left, because a hatch has to hand back a round either way.
      const index = shuffled.findIndex(
        (q) => q.type !== "earth" && (corners.get(q.topic) ?? 0) < TOPIC_CAP,
      );
      const picked = shuffled.splice(index >= 0 ? index : 0, 1)[0];
      if (!picked) break;
      if (picked.type !== "earth") {
        corners.set(picked.topic, (corners.get(picked.topic) ?? 0) + 1);
      }
      questions.push(picked);
    }
  }
  // The earth slots carry only an id and a prompt wherever they come from, so
  // any round's will do; the sites come from `pickSites`, seeded here rather
  // than on a date so two shuffles are two different pairs.
  questions.push(...sampleRound.questions.filter((q) => q.type === "earth"));

  const round: Round = {
    date: todayKey(),
    roundNumber: 0,
    seed: Math.abs(hashSeed(seed)),
    theme: "General knowledge",
    stages: sampleRound.stages,
    // Ids have to be unique inside a round, and two rounds in the pool both
    // call their first cluster `q1`.
    questions: questions.map((question, i) => ({ ...question, id: `q${i + 1}` })),
  };
  return validate(hydrateEarth(round, seed));
}
