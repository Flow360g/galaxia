"use client";

import { useState } from "react";
import Link from "next/link";
import type { Round } from "@/lib/game/types";
import { SimReview } from "./SimReview";
import styles from "./SimSheet.module.css";

interface Props {
  round: Round;
  authored: boolean;
  /** The question on screen, or -1 before the first. */
  encounter: number;
  /** The run is over: every answer can show. */
  finished: boolean;
  /** Freeze the run while the sheet is up, clock included, and wake it after. */
  onPause: () => void;
  onResume: () => void;
}

/**
 * The simulation mode's pause button and the notes behind it. A tab on the
 * left edge, halfway down, on every screen of a simulated run: flight,
 * station, tally and share card alike. Tapping it freezes the run and opens
 * the notes for the question on screen; RESUME puts the run back exactly
 * where it was.
 *
 * It breaks the rule that nothing sits below the band, deliberately and only
 * here: a simulated run is flown by whoever is writing the questions, off
 * `/dev`, and never by a player.
 */
export function SimSheet({ round, authored, encounter, finished, onPause, onResume }: Props) {
  const [open, setOpen] = useState(false);

  const show = () => {
    onPause();
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    onResume();
  };

  if (!open) {
    return (
      <button type="button" className={`${styles.tab} arcade`} onClick={show} data-testid="sim-pause">
        Notes
      </button>
    );
  }

  const focus = !finished && encounter >= 0 ? encounter : undefined;
  const reached = finished ? round.questions.length : Math.max(encounter, 0);

  return (
    <div className={styles.sheet} role="dialog" aria-label="Simulation notes" data-testid="sim-sheet">
      <header className={styles.top}>
        <span className={`${styles.paused} arcade`}>{finished ? "Run over" : "Paused"}</span>
        <Link href="/dev" className={`${styles.days} arcade`}>
          Days
        </Link>
      </header>
      <div className={styles.scroll}>
        <SimReview round={round} authored={authored} focus={focus} reached={reached} />
      </div>
      <button type="button" className={`${styles.resume} arcade`} onClick={hide} data-testid="sim-resume">
        {finished ? "Close" : "Resume"}
      </button>
    </div>
  );
}
