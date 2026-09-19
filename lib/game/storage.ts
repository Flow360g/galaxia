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
const BRIEFED_KEY = "galaxia:briefed";
const SHIP_KEY = "galaxia:ship";
const OWNED_KEY = "galaxia:owned";

export interface BestRecord {
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
 * the best if it was beaten.
 *
 * A date already on file does not count again, so the `?replay=1` escape
 * hatch cannot be used to farm an unlock.
 */
export function saveRun(summary: RunSummary): void {
  const firstToday = loadRun(summary.date) === null;
  write(`${RUN_PREFIX}${summary.date}`, summary);
  if (firstToday) write(FLOWN_KEY, loadFlown() + 1);

  const best = loadBest();
  if (!best || summary.distance > best.distance) {
    const record: BestRecord = {
      distance: summary.distance,
      date: summary.date,
      roundNumber: summary.roundNumber,
    };
    write(BEST_KEY, record);
  }
}

export function loadRun(date: string): RunSummary | null {
  const run = read<RunSummary>(`${RUN_PREFIX}${date}`);
  return run && typeof run === "object" && typeof run.distance === "number"
    ? run
    : null;
}

export function loadBest(): BestRecord | null {
  const best = read<BestRecord>(BEST_KEY);
  return best &&
    typeof best === "object" &&
    typeof best.distance === "number" &&
    typeof best.date === "string"
    ? best
    : null;
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

/** Whether the pre-flight briefing has been read through to the end. */
export function loadBriefed(): boolean {
  return read<boolean>(BRIEFED_KEY) === true;
}

export function saveBriefed(briefed: boolean): void {
  write(BRIEFED_KEY, briefed);
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
