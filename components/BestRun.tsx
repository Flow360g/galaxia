"use client";

import { useSyncExternalStore } from "react";
import { loadBest, loadRun } from "@/lib/game/storage";
import { formatDistance } from "@/lib/game/format";

interface Record {
  best: number | null;
  today: number | null;
}

/**
 * Title-screen record. Read from localStorage through a store snapshot, so
 * the server render and the first client paint agree and nothing flashes.
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
          {record.best !== null ? `${formatDistance(record.best)} KM` : "NO FLIGHTS"}
        </span>
      </div>
      <div className={className}>
        <span className="label">Today</span>
        <span className="metaValue arcade" data-testid="today-run">
          {record.today !== null ? `${formatDistance(record.today)} KM` : "NOT FLOWN"}
        </span>
      </div>
    </>
  );
}

const EMPTY: Record = { best: null, today: null };
let cached: { date: string; record: Record } | null = null;

function snapshot(date: string): Record {
  if (!cached || cached.date !== date) {
    cached = {
      date,
      record: {
        best: loadBest()?.distance ?? null,
        today: loadRun(date)?.distance ?? null,
      },
    };
  }
  return cached.record;
}

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    cached = null;
    onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
