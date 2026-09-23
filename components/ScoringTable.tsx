"use client";

import { useState, type MouseEvent } from "react";
import type { ScoringRow } from "@/lib/game/phases";
import styles from "./ScoringTable.module.css";

/**
 * A phase's scoring, as a tight two-column table: what happened on the left,
 * what it was worth on the right. Arcade type at the smallest size the game
 * allows, because it has to fit under a card that already fills the band.
 */
export function ScoringTable({
  rows,
  testId = "scoring",
}: {
  rows: ScoringRow[];
  testId?: string;
}) {
  return (
    <dl className={styles.table} data-testid={testId}>
      {rows.map((row) => (
        <div key={row.label} className={`${styles.row} ${styles[`row_${row.tone}`]}`}>
          <dt className="arcade">{row.label}</dt>
          <dd className="arcade">{row.worth}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The phase's finer print and its table behind a button, collapsed by default. For the cards inside
 * the run, where the band has no room to show the scoring to a player who
 * already knows it, and every room in the world for one who does not.
 *
 * The button swallows its click: the cards it sits on advance on a tap, and
 * opening the table must never count as one.
 */
export function ScoringDisclosure({
  rows,
  details = [],
  label = "MORE DETAIL",
  className = "",
}: {
  rows: ScoringRow[];
  /** The phase's finer print, shown above the table once opened. */
  details?: string[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    setOpen((current) => !current);
  };
  return (
    <div className={`${styles.disclosure} ${className}`} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`${styles.toggle} arcade`}
        onClick={toggle}
        aria-expanded={open}
        data-testid="scoring-toggle"
      >
        {label}
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.more} data-testid="more-detail">
          {details.map((line) => (
            <p key={line} className={styles.detail}>
              {line}
            </p>
          ))}
          <ScoringTable rows={rows} />
        </div>
      ) : null}
    </div>
  );
}
