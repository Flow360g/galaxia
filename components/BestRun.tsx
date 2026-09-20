"use client";

import { useSyncExternalStore } from "react";
import { loadBest, loadFlown, loadRun } from "@/lib/game/storage";
import { formatDistance, formatScore } from "@/lib/game/format";

/** One stored run, reduced to the two figures the profile shows. */
interface Figures {
  /** Null on a run stored before the score existed. */
  score: number | null;
  max: number | null;
  distance: number;
}

interface Record {
  best: Figures | null;
  today: Figures | null;
  /** Runs completed, one per date. What earns a hull in the bay. */
  flown: number;
}

/**
 * The player's record, for the profile page. Read from localStorage through
 * a store snapshot, so the server render and the first client paint agree
 * and nothing flashes.
 *
 * The score leads both rows, because it is what the run is played for and it
 * is the figure a player compares. Distance trails it as the flight stat it
 * now is. A record written before the score existed has no anchor to quote,
 * so it shows its distance alone rather than an empty "/" or a NaN.
 *
 * The empty states are plain words: a player who has never played should
 * read "not played yet", not a flight-log term they have to decode.
 */
export function BestRun({
  date,
  className,
  valueClassName,
}: {
  date: string;
  className: string;
  valueClassName: string;
}) {
  const record = useSyncExternalStore(
    subscribe,
    () => snapshot(date),
    () => EMPTY,
  );
  const value = `${valueClassName} arcade`;

  return (
    <>
      <div className={className}>
        <span className="label">Today</span>
        <span className={value} data-testid="today-run">
          {record.today ? line(record.today) : "NOT PLAYED YET"}
        </span>
      </div>
      <div className={className}>
        <span className="label">Best score</span>
        <span className={value} data-testid="best-run">
          {record.best ? line(record.best) : "NO RUNS YET"}
        </span>
      </div>
      <div className={className}>
        <span className="label">Runs played</span>
        <span className={value} data-testid="runs-played">
          {record.flown}
        </span>
      </div>
    </>
  );
}

/** "1,880 / 2,400 · 12,480 KM", or just the distance for a pre-score run. */
function line(figures: Figures): string {
  const distance = `${formatDistance(figures.distance)} KM`;
  if (figures.score === null || figures.max === null || figures.max <= 0) {
    return distance;
  }
  return `${formatScore(figures.score)} / ${formatScore(figures.max)} · ${distance}`;
}

const EMPTY: Record = { best: null, today: null, flown: 0 };
let cached: { date: string; record: Record } | null = null;

function snapshot(date: string): Record {
  if (!cached || cached.date !== date) {
    const best = loadBest();
    const today = loadRun(date);
    cached = {
      date,
      record: {
        best: best ? figures(best.score, best.maxScore, best.distance) : null,
        today: today ? figures(today.score, today.maxScore, today.distance) : null,
        flown: loadFlown(),
      },
    };
  }
  return cached.record;
}

/** Anything non-finite, or missing on an older record, reads as "no score". */
function figures(
  score: number | undefined,
  max: number | undefined,
  distance: number | undefined,
): Figures {
  return {
    score: finite(score),
    max: finite(max),
    distance: finite(distance) ?? 0,
  };
}

function finite(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    cached = null;
    onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
