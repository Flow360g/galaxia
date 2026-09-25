"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { allShips } from "@/lib/game/ships";
import { loadSimNotes } from "@/lib/game/storage";
import { countNoted } from "@/lib/game/simFeedback";
import styles from "./SimDays.module.css";
import profile from "./Profile.module.css";

export interface SimDay {
  date: string;
  weekday: string;
  roundNumber: number;
  /** Has a round file of its own, rather than one rotated in from the pool. */
  authored: boolean;
  today: boolean;
}

/**
 * The day list on `/dev`: every coming day, what it has been flown to and how
 * many of its questions carry a note, and the hull to fly it in. The hull rides
 * on the URL like a practice run's (`&ship=`), so the player's own selection,
 * unlocks and purchases are never touched.
 */
export function SimDays({ days }: { days: SimDay[] }) {
  const [ship, setShip] = useState<string | undefined>(undefined);
  // Notes live in localStorage, so the status column fills in after hydration.
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const options: { id: string | undefined; name: string }[] = [
    { id: undefined, name: "Yours" },
    ...allShips().map((s) => ({ id: s.id, name: s.name })),
  ];
  const shipParam = ship ? `&ship=${encodeURIComponent(ship)}` : "";

  return (
    <>
      <ol className={styles.days} data-testid="sim-days">
        {days.map((day) => {
          const notes = hydrated ? loadSimNotes(day.date) : null;
          const noted = notes ? countNoted(notes) : 0;
          const flagged = notes ? Object.values(notes.questions).filter((q) => q.flag).length : 0;
          return (
            <li key={day.date} className={styles.day} data-testid={`sim-day-${day.date}`}>
              <div className={styles.dayHead}>
                <span className={`${styles.weekday} arcade`}>
                  {day.weekday}
                  {day.today ? <span className={styles.today}> Today</span> : null}
                </span>
                <span className={styles.date}>{day.date}</span>
              </div>
              <span className={styles.status}>
                Round {day.roundNumber} · {day.authored ? "own file" : "rotated from pool"}
                {notes?.runs ? ` · flown ${notes.runs}x, last ${notes.lastScore} of ${notes.lastMaxScore}` : ""}
                {noted ? ` · ${noted} noted` : ""}
                {flagged ? ` · ${flagged} flagged` : ""}
              </span>
              <div className={styles.dayActions}>
                <Link
                  href={`/play?round=${day.date}&sim=1${shipParam}`}
                  className={`${styles.fly} arcade`}
                  data-testid={`sim-fly-${day.date}`}
                >
                  Fly it
                </Link>
                <Link
                  href={`/dev/review?round=${day.date}`}
                  className={`${styles.notes} arcade`}
                  data-testid={`sim-notes-${day.date}`}
                >
                  Notes{notes && (noted || notes.general.trim()) ? " *" : ""}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>

      <span className={`${profile.shipLabel} label`}>Ship for the simulation</span>
      <div className={profile.shipPick} role="radiogroup" aria-label="Ship for the simulation">
        {options.map((option) => (
          <button
            key={option.id ?? "yours"}
            type="button"
            role="radio"
            aria-checked={ship === option.id}
            className={`${profile.shipOption} arcade`}
            onClick={() => setShip(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </>
  );
}

function noop(): () => void {
  return () => {};
}
