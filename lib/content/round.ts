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
import round20261006 from "@/content/rounds/2026-10-06.json";
import round20261007 from "@/content/rounds/2026-10-07.json";
import round20261008 from "@/content/rounds/2026-10-08.json";
import round20261009 from "@/content/rounds/2026-10-09.json";
import round20261010 from "@/content/rounds/2026-10-10.json";
import round20261011 from "@/content/rounds/2026-10-11.json";
import round20261012 from "@/content/rounds/2026-10-12.json";
import round20261013 from "@/content/rounds/2026-10-13.json";
import round20261014 from "@/content/rounds/2026-10-14.json";
import round20261015 from "@/content/rounds/2026-10-15.json";
import round20261016 from "@/content/rounds/2026-10-16.json";
import round20261017 from "@/content/rounds/2026-10-17.json";
import round20261018 from "@/content/rounds/2026-10-18.json";
import round20261019 from "@/content/rounds/2026-10-19.json";
import round20261020 from "@/content/rounds/2026-10-20.json";
import round20261021 from "@/content/rounds/2026-10-21.json";
import round20261022 from "@/content/rounds/2026-10-22.json";
import round20261023 from "@/content/rounds/2026-10-23.json";
import round20261024 from "@/content/rounds/2026-10-24.json";
import round20261025 from "@/content/rounds/2026-10-25.json";
import round20261026 from "@/content/rounds/2026-10-26.json";
import round20261027 from "@/content/rounds/2026-10-27.json";
import round20261028 from "@/content/rounds/2026-10-28.json";
import round20261029 from "@/content/rounds/2026-10-29.json";
import round20261030 from "@/content/rounds/2026-10-30.json";
import round20261031 from "@/content/rounds/2026-10-31.json";
import round20261101 from "@/content/rounds/2026-11-01.json";
import round20261102 from "@/content/rounds/2026-11-02.json";
import round20261103 from "@/content/rounds/2026-11-03.json";
import round20261104 from "@/content/rounds/2026-11-04.json";
import round20261105 from "@/content/rounds/2026-11-05.json";
import round20261106 from "@/content/rounds/2026-11-06.json";
import round20261107 from "@/content/rounds/2026-11-07.json";
import round20261108 from "@/content/rounds/2026-11-08.json";
import round20261109 from "@/content/rounds/2026-11-09.json";
import round20261110 from "@/content/rounds/2026-11-10.json";
import round20261111 from "@/content/rounds/2026-11-11.json";
import round20261112 from "@/content/rounds/2026-11-12.json";
import round20261113 from "@/content/rounds/2026-11-13.json";
import round20261114 from "@/content/rounds/2026-11-14.json";
import round20261115 from "@/content/rounds/2026-11-15.json";
import { pickSites } from "@/lib/content/sites";
import {
  ROUND_PROFILE,
  checkVector,
  rangeFor,
  trackShare,
} from "@/lib/content/difficulty";
import { nextPracticeDeal } from "@/lib/game/storage";
import { TOPICS } from "@/lib/game/types";
import type { EarthQuestion, Question, Round, Topic } from "@/lib/game/types";
import { roundKey } from "./clock";

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

/**
 * A vector asks for a magnitude, never a date.
 *
 * The scoring bands are fractions of the answer, and a calendar year has no
 * true zero to take a fraction of: five percent of 2001 is a century, so every
 * "in which year" question in the pool covered the whole slider and handed out
 * a direct hit for any position at all. The geometry rule below would let an
 * author "fix" that by widening the range to 200..3000, which passes the maths
 * and is a worse question, so the shape is rejected by name instead.
 */
const DATE_PROMPT = /\b(what|which)\s+year\b/i;

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
  round20261006,
  round20261007,
  round20261008,
  round20261009,
  round20261010,
  round20261011,
  round20261012,
  round20261013,
  round20261014,
  round20261015,
  round20261016,
  round20261017,
  round20261018,
  round20261019,
  round20261020,
  round20261021,
  round20261022,
  round20261023,
  round20261024,
  round20261025,
  round20261026,
  round20261027,
  round20261028,
  round20261029,
  round20261030,
  round20261031,
  round20261101,
  round20261102,
  round20261103,
  round20261104,
  round20261105,
  round20261106,
  round20261107,
  round20261108,
  round20261109,
  round20261110,
  round20261111,
  round20261112,
  round20261113,
  round20261114,
  round20261115,
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
 * It also holds the two difficulty rules, because how hard a round is turned
 * out to be just as malformable as its shape and nothing was watching. Every
 * quiz question declares a level, and every vector's slider has to put the
 * scoring bands within reach: see `lib/content/difficulty.ts` for why that is
 * a property of `min..max` rather than of the question.
 *
 * `authored` marks a round somebody wrote as a day, which is held to the two
 * rules a random draw cannot be: no more than two questions from any one
 * corner, and one difficulty profile for every day. The practice shuffle
 * passes false, because a draw from the whole pool can legitimately land three
 * of a kind and a hatch nobody but a tester sees is not worth failing the
 * build over. See `getShuffledRound`, which steers rather than throws.
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
    // Same reason as the corner above: the JSON is cast, so a question that
    // forgot to declare how hard it is gets here intact.
    const level = question.difficulty as number | undefined;
    if (level !== 1 && level !== 2 && level !== 3) {
      throw new Error(
        `Round ${round.date} ${question.type} ${question.id}: difficulty "${level}" is not 1, 2 or 3. ` +
          `See content/AUTHORING.md.`,
      );
    }
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
    checkProfile(round);
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
      if (DATE_PROMPT.test(question.prompt)) {
        throw new Error(
          `Round ${round.date} vector ${question.id}: a slider asks for a magnitude, not a date. ` +
            `The bands are fractions of the answer and a calendar year has no zero to take a ` +
            `fraction of, so every position scores. Ask for a duration or a count instead.`,
        );
      }
      // How hard a vector is comes down to how much of the slider the scoring
      // bands cover, which nothing checked until this existed. See
      // `lib/content/difficulty.ts` for what the numbers mean.
      const faults = checkVector(question);
      if (faults.length > 0) {
        const fixed = rangeFor(question.answer);
        throw new Error(
          `Round ${round.date} vector ${question.id} ("${question.prompt}"): ${faults.join("; ")}. ` +
            `Try min ${fixed.min}, max ${fixed.max}, which puts the close band at ` +
            `${Math.round(trackShare({ ...question, ...fixed, log: false }) * 1000) / 10}% of the slider.`,
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

/**
 * One authored day's difficulty profile.
 *
 * The sum is what makes two days comparable: a round of six 1s and a round of
 * six 3s both used to pass, and a score out of 1,800 means nothing if today
 * was a gift and yesterday was not. The counts stop a round reaching the sum
 * by pairing gifts with obscurities, which is the same problem wearing a
 * disguise. The opener is capped because the run is the product and a hard
 * first question ends it before the player is warm.
 *
 * Authored rounds only, like `TOPIC_CAP`: a draw from the whole pool cannot
 * control its own profile, and failing the build over a hatch nobody but a
 * tester sees is not worth it. See `getShuffledRound`, which steers instead.
 */
function checkProfile(round: Round): void {
  const levels = round.questions
    .filter((question) => question.type !== "earth")
    .map((question) => question.difficulty as number);
  const sum = levels.reduce((total, level) => total + level, 0);
  const { sum: band, maxEasy, maxHard, openerMax } = ROUND_PROFILE;
  const shape = levels.join(", ");
  if (sum < band.min || sum > band.max) {
    throw new Error(
      `Round ${round.date}: difficulty sums to ${sum} (${shape}), outside ${band.min}..${band.max}. ` +
        `Two days have to be worth comparing.`,
    );
  }
  const easy = levels.filter((level) => level === 1).length;
  if (easy > maxEasy) {
    throw new Error(`Round ${round.date}: ${easy} questions at difficulty 1 (${shape}), at most ${maxEasy}.`);
  }
  const hard = levels.filter((level) => level === 3).length;
  if (hard > maxHard) {
    throw new Error(`Round ${round.date}: ${hard} questions at difficulty 3 (${shape}), at most ${maxHard}.`);
  }
  const opener = levels[0];
  if (opener !== undefined && opener > openerMax) {
    throw new Error(
      `Round ${round.date}: the run opens on difficulty ${opener} (${shape}), at most ${openerMax}. ` +
        `A hard first question ends a run before the player is warm.`,
    );
  }
}

/**
 * Today's round date as YYYY-MM-DD, on the one clock the whole world shares
 * (`DAILY` in `Tuning.ts`, worked out in `clock.ts`).
 */
export function todayKey(now: Date = new Date()): string {
  return roundKey(now);
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
 *
 * It is a deal from this device's deck (`<deck>.<n>`, see `nextPracticeDeal`)
 * rather than a random string, so a tester works through the whole pool
 * before any question comes round again.
 */
export function newShuffleSeed(): string {
  return nextPracticeDeal();
}

/**
 * The address of a practice run: its seed, and the hull to fly it in when one
 * was picked on `/profile?debug=1`.
 */
export function practiceUrl(seed: string, ship?: string): string {
  const shipParam = ship ? `&ship=${encodeURIComponent(ship)}` : "";
  return `/play?shuffle=${seed}&debug=1${shipParam}`;
}

/** `<deck>.<n>`: the nth deal from a device's deck. Anything else is a one-off draw. */
const DEAL = /^([a-z0-9]+)\.(\d{1,5})$/;

export function getShuffledRound(seed: string): Round {
  const deal = DEAL.exec(seed);
  const questions = deal
    ? dealFromDeck(deal[1] ?? "", Number(deal[2]))
    : draw((type) => seededShuffle(quizOf(type), `${seed}:${type}`));
  return practiceRound(questions, seed);
}

/** Every question of one kind in the pool, in pool order. */
function quizOf(type: Question["type"]): Question[] {
  return POOL.flatMap((round) => round.questions).filter((q) => q.type === type);
}

/**
 * The nth deal from a deck: no question comes round twice until every
 * question of its kind has been dealt.
 *
 * A one-off draw of two from the pool looks fresh on paper, but a tester
 * flies dozens of practice runs, and with any pool the birthday problem does
 * the rest: the repeats start within a handful of runs and never stop. So a
 * device keeps one deck per kind, shuffled on its own seed, and each run
 * deals from the top. When a kind runs short the rest of its deck goes first
 * and a fresh shuffle follows it.
 *
 * Replayed from deal 0 on every call rather than stored, so a `<deck>.<n>`
 * seed still rebuilds the identical round anywhere it is opened. The steering
 * in `draw` may pass over a question to keep a round's corners and difficulty
 * in shape; it stays in the deck and comes up on a later deal.
 */
function dealFromDeck(deck: string, n: number): Question[] {
  const kinds = MIX.map(({ type }) => type);
  const cycle = new Map(kinds.map((type) => [type, 0]));
  const left = new Map(kinds.map((type) => [type, seededShuffle(quizOf(type), `${deck}:${type}:0`)]));
  let dealt: Question[] = [];
  for (let i = 0; i <= n; i += 1) {
    for (const { type, count } of MIX) {
      const rest = left.get(type) ?? [];
      if (rest.length >= count) continue;
      const next = (cycle.get(type) ?? 0) + 1;
      cycle.set(type, next);
      const fresh = seededShuffle(quizOf(type), `${deck}:${type}:${next}`).filter((q) => !rest.includes(q));
      left.set(type, [...rest, ...fresh]);
    }
    // `draw` splices what it takes out of the arrays it is handed, which is
    // exactly how the deck is used up.
    dealt = draw((type) => left.get(type) ?? []);
  }
  return dealt;
}

/**
 * Pick a round's six quiz questions from per-kind orderings, steering the
 * corners and the difficulty as it goes. Takes each question by splicing it
 * out of the array `order` returned for its kind.
 */
function draw(order: (type: Question["type"]) => Question[]): Question[] {
  const questions: Question[] = [];
  // Spread the corners as the draw goes. A blind draw from a pool this size
  // handed testers three space questions often enough to be the reason the
  // pool was widened in the first place. It only ever reads the already
  // seeded order, so a seed still rebuilds the identical round.
  const corners = new Map<Topic, number>();
  // And steer the difficulty the same way. An authored day is held to a
  // profile by `checkProfile`; a draw cannot be held to one, because the pool
  // it is drawing from might not contain a question that satisfies it. So it
  // is a preference here rather than a promise: prefer a pick that leaves the
  // profile still reachable, and take what is left if none does.
  const quizSlots = MIX.reduce((total, { count }) => total + count, 0);
  let levels = 0;

  for (const { type, count } of MIX) {
    const shuffled = order(type);
    for (let taken = 0; taken < count; taken += 1) {
      const room = (q: Question) => q.type !== "earth" && (corners.get(q.topic) ?? 0) < TOPIC_CAP;
      // After this pick, can the remaining slots still land inside the band?
      const reachable = (q: Question) => {
        if (q.type === "earth") return false;
        const left = quizSlots - questions.length - 1;
        const total = levels + q.difficulty;
        return total + left * 3 >= ROUND_PROFILE.sum.min && total + left <= ROUND_PROFILE.sum.max;
      };
      // First choice that keeps both; then one that keeps the corner cap;
      // then the first one left, because a hatch has to hand back a round.
      let index = shuffled.findIndex((q) => room(q) && reachable(q));
      if (index < 0) index = shuffled.findIndex(room);
      const picked = shuffled.splice(index >= 0 ? index : 0, 1)[0];
      if (!picked) break;
      if (picked.type !== "earth") {
        corners.set(picked.topic, (corners.get(picked.topic) ?? 0) + 1);
        levels += picked.difficulty;
      }
      questions.push(picked);
    }
  }
  return questions;
}

/** A practice round around six drawn quiz questions. */
function practiceRound(drawn: Question[], seed: string): Round {
  const questions = [...drawn];
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
