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

/** Records the run under its date and lifts the best if it was beaten. */
export function saveRun(summary: RunSummary): void {
  write(`${RUN_PREFIX}${summary.date}`, summary);

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

export function clearRun(date: string): void {
  try {
    store()?.removeItem(`${RUN_PREFIX}${date}`);
  } catch {
    // Nothing to clear, or nowhere to clear it from.
  }
}
