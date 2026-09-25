import { shiftDay } from "@/lib/content/clock";
import type { RunSummary } from "./types";

/**
 * Local record of runs. One entry per date plus a single best.
 *
 * localStorage is absent in some private modes and throws when full, so every
 * touch is wrapped and every reader returns null on trouble. Nothing here is
 * load-bearing for the flight itself.
 */

const RUN_PREFIX = "galaxia:run:";
const BEST_KEY = "galaxia:best";
const MUTED_KEY = "galaxia:muted";
const FLOWN_KEY = "galaxia:flown";
const MAYDAY_KEY = "galaxia:mayday";
const SHIP_KEY = "galaxia:ship";
const OWNED_KEY = "galaxia:owned";
const PRACTICE_KEY = "galaxia:practice";

export interface BestRecord {
  /**
   * The score, and what a perfect run that day would have scored. Both are
   * optional because a record written before the score existed has neither;
   * such a record is still shown, on its distance alone.
   */
  score?: number;
  maxScore?: number;
  distance: number;
  date: string;
  roundNumber: number;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    store()?.setItem(key, JSON.stringify(value));
  } catch {
    // Full, blocked or absent. The run still happened.
  }
}

/**
 * Records the run under its date, counts it toward the flight log and lifts
 * the best if it was beaten. Hands back the summary stamped with the day
 * streak and whether it was a new best, which is what gets stored, so the
 * card on a revisit still says it.
 *
 * A date already on file does not count again, so the `?replay=1` escape
 * hatch cannot be used to farm an unlock.
 *
 * NEW BEST needs a best to beat: a first ever run is not a record, it is the
 * only run. A best set earlier the same day (the replay hatch) still counts.
 */
export function saveRun(summary: RunSummary): RunSummary {
  const firstToday = loadRun(summary.date) === null;
  const best = loadBest();
  const newBest = best !== null && beats(summary, best) && num(summary.score) > num(best.score);
  const stamped: RunSummary = {
    ...summary,
    dayStreak: streakBack(summary.date, 1),
    newBest,
  };
  write(`${RUN_PREFIX}${summary.date}`, stamped);
  if (firstToday) write(FLOWN_KEY, loadFlown() + 1);

  if (!best || beats(summary, best)) {
    const record: BestRecord = {
      score: num(summary.score),
      maxScore: num(summary.maxScore),
      distance: summary.distance,
      date: summary.date,
      roundNumber: summary.roundNumber,
    };
    write(BEST_KEY, record);
  }
  return stamped;
}

/**
 * Days in a row, walking back from `date`, with a completed run on file.
 * `counted` is how many are already known to be there (the run being saved).
 *
 * Derived from the stored runs rather than kept as a counter, so it cannot
 * drift: a QA flight of a future round (`?round=`) is a run on a day nobody
 * has reached yet and breaks nothing, where a counter would have reset. The
 * one hole is the replay hatch clearing today's run, and flying it again puts
 * it back.
 */
function streakBack(date: string, counted: number): number {
  let days = counted;
  let day = shiftDay(date, -counted);
  // A year is plenty of walk and bounds the loop on a device with odd keys.
  while (days < 366 && loadRun(day) !== null) {
    days += 1;
    day = shiftDay(day, -1);
  }
  return days;
}

/**
 * The streak as it stands on `today`: counted through today if today has been
 * flown, through yesterday if not. A streak is not broken until a whole round
 * goes by unplayed, so the morning after a run it still reads as alive.
 */
export function loadDayStreak(today: string): number {
  if (loadRun(today) !== null) return streakBack(today, 1);
  return streakBack(shiftDay(today, -1), 0);
}

/**
 * The longest run of consecutive days ever flown on this device, read off
 * the stored runs. Zero with no runs, or no storage.
 */
export function loadLongestStreak(): number {
  const dates: string[] = [];
  try {
    const s = store();
    if (!s) return 0;
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k?.startsWith(RUN_PREFIX)) dates.push(k.slice(RUN_PREFIX.length));
    }
  } catch {
    return 0;
  }
  dates.sort();
  let longest = 0;
  let current = 0;
  let previous: string | null = null;
  for (const date of dates) {
    current = previous !== null && shiftDay(previous, 1) === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

/**
 * Best means highest score, because the score is what the run is played for.
 * Distance only breaks a tie, which it does often: two clean runs can score
 * the same 2,400 and the faster flight is the better one.
 *
 * A record from before the score existed scores 0 here, so the first scored
 * run replaces it. That is the honest outcome: the two are not comparable,
 * and the anchored figure is the one worth keeping.
 */
function beats(summary: RunSummary, best: BestRecord): boolean {
  const score = num(summary.score);
  const bestScore = num(best.score);
  if (score !== bestScore) return score > bestScore;
  return summary.distance > num(best.distance);
}

function num(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Today's stored run, or null. Only distance is checked, so a summary written
 * before the score existed still replays; readers guard `score` themselves.
 */
export function loadRun(date: string): RunSummary | null {
  const run = read<RunSummary>(`${RUN_PREFIX}${date}`);
  return run && typeof run === "object" && typeof run.distance === "number"
    ? run
    : null;
}

/**
 * The stored best, or null. Distance and date are the only fields an old
 * record is guaranteed to have, so they are all that is validated; the score
 * is normalised and simply comes back undefined when the record predates it.
 */
export function loadBest(): BestRecord | null {
  const best = read<BestRecord>(BEST_KEY);
  if (
    !best ||
    typeof best !== "object" ||
    typeof best.distance !== "number" ||
    typeof best.date !== "string"
  ) {
    return null;
  }
  return {
    ...best,
    score: optional(best.score),
    maxScore: optional(best.maxScore),
  };
}

function optional(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Sound on or off, remembered between runs. Sound is on by default. */
export function loadMuted(): boolean {
  return read<boolean>(MUTED_KEY) === true;
}

export function saveMuted(muted: boolean): void {
  write(MUTED_KEY, muted);
}

/**
 * Runs flown on this device, ever. The flight log: what earns a hull, and
 * what decides whether a player has flown before and needs the briefing.
 *
 * Deliberately not derived from the stored runs: those are keyed by date and
 * the escape hatch clears them, and an unlock that can be undone by clearing
 * today's run is not an unlock.
 */
export function loadFlown(): number {
  const flown = read<number>(FLOWN_KEY);
  return typeof flown === "number" && Number.isFinite(flown) && flown > 0
    ? Math.floor(flown)
    : 0;
}

/**
 * The round date Sergeant Soap's Mayday was last heard on. It opens each day's
 * first run and not the ones after it. It used to be heard once per device,
 * ever (`galaxia:briefed`), which read as the story sometimes playing and
 * sometimes not.
 */
export function loadMaydayDate(): string | null {
  const date = read<string>(MAYDAY_KEY);
  return typeof date === "string" ? date : null;
}

export function saveMaydayDate(date: string): void {
  write(MAYDAY_KEY, date);
}

/** The hull the player last chose, or null for the standard issue one. */
export function loadShipId(): string | null {
  const id = read<string>(SHIP_KEY);
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function saveShipId(id: string): void {
  write(SHIP_KEY, id);
}

/**
 * Hulls bought outright. Local only, like everything else here, so a cleared
 * browser loses them; see `purchaseShip` in ships.ts for where a real
 * entitlement check belongs.
 */
export function loadOwnedShips(): string[] {
  const owned = read<string[]>(OWNED_KEY);
  return Array.isArray(owned) ? owned.filter((id) => typeof id === "string") : [];
}

export function saveOwnedShip(id: string): void {
  const owned = loadOwnedShips();
  if (owned.includes(id)) return;
  write(OWNED_KEY, [...owned, id]);
}

export function clearRun(date: string): void {
  try {
    store()?.removeItem(`${RUN_PREFIX}${date}`);
  } catch {
    // Nothing to clear, or nowhere to clear it from.
  }
}

/**
 * The next practice deal on this device, as a `<deck>.<n>` seed for
 * `/play?shuffle=` (see `dealFromDeck` in `lib/content/round.ts`).
 *
 * One deck per device, made up on the first practice run, and a counter that
 * moves on one deal per run, so a tester sees every question in the pool
 * before any comes round again. It is a hatch's bookmark and nothing more: it
 * never touches the flight log, the best or a stored run. Without storage it
 * still hands back a fresh one-off deck, which is the old behaviour.
 */
export function nextPracticeDeal(): string {
  const last = read<{ deck?: unknown; n?: unknown }>(PRACTICE_KEY);
  const known = typeof last?.deck === "string" && /^[a-z0-9]+$/.test(last.deck) && Number.isInteger(last.n);
  const deck = known ? (last.deck as string) : Math.random().toString(36).slice(2, 10);
  const n = known ? (last.n as number) + 1 : 0;
  write(PRACTICE_KEY, { deck, n });
  return `${deck}.${n}`;
}
