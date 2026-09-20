import round20260918 from "@/content/rounds/2026-09-18.json";
import round20260920 from "@/content/rounds/2026-09-20.json";
import round20260921 from "@/content/rounds/2026-09-21.json";
import round20260922 from "@/content/rounds/2026-09-22.json";
import round20260923 from "@/content/rounds/2026-09-23.json";
import round20260924 from "@/content/rounds/2026-09-24.json";
import { pickSites } from "@/lib/content/sites";
import type { EarthQuestion, Round } from "@/lib/game/types";

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

const POOL: Round[] = [
  round20260918,
  round20260920,
  round20260921,
  round20260922,
  round20260923,
  round20260924,
]
  // Hydrate before validating: the earth slots carry no site of their own, so
  // validation has nothing to check until the pool has filled them in.
  .map((round) => validate(hydrateEarth(round as unknown as Round)))
  .sort((a, b) => a.date.localeCompare(b.date));

const ROUNDS: Record<string, Round> = Object.fromEntries(POOL.map((round) => [round.date, round]));

const sampleRound = POOL[0]!;

/**
 * WHERE ON EARTH slots carry only an id and a prompt; the site itself comes
 * from the pool, seeded by the round's own date. That is what lets a day be
 * generated rather than authored, and it keeps the pair identical for every
 * player on that date, which is the basis of comparing two runs.
 *
 * Seeded on `round.date` rather than on today, so a round is the same round
 * whenever it is loaded: replays, tests and the fallback all agree.
 */
function hydrateEarth(round: Round): Round {
  const sites = pickSites(round.date);
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

/** Stable shuffle: the same seed always gives the same order. */
function seededShuffle(items: string[], seed: string): string[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    const j = hash % (i + 1);
    const a = out[i] as string;
    out[i] = out[j] as string;
    out[j] = a;
  }
  return out;
}

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
    // A stage may skip a phase number but never go backwards: the card
    // announces these, and they have to count up.
    if (stage.phase !== undefined) {
      const previousPhase = previous ? (previous.phase ?? i) : 0;
      if (!Number.isInteger(stage.phase) || stage.phase <= previousPhase) {
        throw new Error(`Round ${round.date} stage ${stage.name}: phase=${stage.phase} must count up`);
      }
    }
  });
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
