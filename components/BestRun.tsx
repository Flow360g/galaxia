"use client";

import { useSyncExternalStore } from "react";
import { loadBest, loadRun } from "@/lib/game/storage";
import { formatDistance, formatScore } from "@/lib/game/format";

/** One stored run, reduced to the two figures the title screen shows. */
interface Figures {
  /** Null on a run stored before the score existed. */
  score: number | null;
  max: number | null;
  distance: number;
}

interface Record {
  best: Figures | null;
  today: Figures | null;
}

/**
 * Title-screen record. Read from localStorage through a store snapshot, so
 * the server render and the first client paint agree and nothing flashes.
 *
 * The score leads both rows, because it is what the run is played for and it
 * is the figure a player compares. Distance trails it as the flight stat it
 * now is. A record written before the score existed has no anchor to quote,
 * so it shows its distance alone rather than an empty "/" or a NaN.
 */
export function BestRun({ date, className }: { date: string; className: string }) {
  const record = useSyncExternalStore(
    subscribe,
    () => snapshot(date),
    () => EMPTY,
  );

  return (
    <>
      <div className={className}>
        <span className="label">Best run</span>
        <span className="metaValue arcade" data-testid="best-run">
          {record.best ? line(record.best) : "NO FLIGHTS"}
        </span>
      </div>
      <div className={className}>
        <span className="label">Today</span>
        <span className="metaValue arcade" data-testid="today-run">
          {record.today ? line(record.today) : "NOT FLOWN"}
        </span>
      </div>
    </>
  );
}

/** "1,180 / 1,500 · 12,480 KM", or just the distance for a pre-score run. */
function line(figures: Figures): string {
  const distance = `${formatDistance(figures.distance)} KM`;
  if (figures.score === null || figures.max === null || figures.max <= 0) {
    return distance;
  }
  return `${formatScore(figures.score)} / ${formatScore(figures.max)} · ${distance}`;
}

const EMPTY: Record = { best: null, today: null };
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
