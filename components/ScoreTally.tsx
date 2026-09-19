"use client";

import { useEffect, useState } from "react";
import { formatPoints, formatScore } from "@/lib/game/format";
import type { RunSummary } from "@/lib/game/types";
import styles from "./ScoreTally.module.css";

/** Seconds between one line of the tally landing and the next. */
const REVEAL_MS = 240;
/** How long after the last line before the total stamps in. */
const TOTAL_MS = 420;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * The scorecard, between the last encounter and the share card.
 *
 * The run is over and the question it has to answer is "how did I do?". The
 * distance figure never answered it, because nobody knows whether 12,000 km is
 * a good day. A score out of a fixed maximum does, and the tally under it says
 * where the points came from and where they were left behind, one line per
 * encounter, so the answer is legible rather than asserted.
 *
 * Lines land one at a time, fast: this is a beat on the way to the share card,
 * not a screen to sit on. Tapping anywhere skips straight to the end of the
 * reveal, and tapping again moves on.
 */
export function ScoreTally({ summary, onDone }: { summary: RunSummary; onDone: () => void }) {
  const lines = summary.lines ?? [];
  // Reduced motion gets the whole tally at once rather than a slower version
  // of the reveal. Decided once, on mount: this only ever renders on the
  // client, after a run has ended.
  const [revealed, setRevealed] = useState(() => (prefersReducedMotion() ? lines.length : 0));
  const done = revealed >= lines.length;

  useEffect(() => {
    if (revealed >= lines.length) return;
    const timer = window.setTimeout(() => setRevealed((n) => n + 1), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed, lines.length]);

  // The total lands a beat after the last line, so it reads as the sum of
  // them rather than as a number that was always there.
  const [totalIn, setTotalIn] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setTotalIn(true), TOTAL_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  const advance = () => {
    if (!done) {
      setRevealed(lines.length);
      return;
    }
    onDone();
  };

  const max = summary.maxScore ?? 0;
  const score = summary.score ?? 0;

  return (
    <div
      className={styles.overlay}
      data-testid="tally"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tally-heading"
    >
      <button
        type="button"
        className={styles.catcher}
        onClick={advance}
        data-testid="tally-tap"
        aria-label={done ? "Continue to the share card" : "Show the whole tally"}
      />

      <section className={styles.panel}>
        <h2 id="tally-heading" className={`${styles.heading} arcade`}>
          Run complete
        </h2>

        <ol className={styles.lines}>
          {lines.map((line, index) => {
            const shown = index < revealed;
            // Called out only when the encounter itself left points behind. A
            // full-marks answer at x1 is short of `max` through the streak
            // alone, and flagging that red would call a clean answer a miss.
            const missed = !line.full;
            return (
              <li
                key={line.index}
                className={`${styles.line} ${shown ? styles.lineIn : ""}`}
                data-testid={`tally-line-${line.index}`}
                aria-hidden={shown ? undefined : true}
              >
                <span className={`${styles.lineLabel} arcade`}>{line.label}</span>
                <span className={styles.lineDetail}>{line.detail}</span>
                <span className={styles.lineSum}>
                  {line.points > 0 ? (
                    <span className={`${styles.lineMath} arcade`}>
                      {line.base} x{line.multiplier}
                    </span>
                  ) : null}
                  <span
                    className={`${styles.linePoints} ${
                      line.points < 0 ? styles.linePointsDown : ""
                    } ${line.points === 0 ? styles.linePointsNil : ""} arcade`}
                  >
                    {formatPoints(line.points)}
                  </span>
                  <span className={`${styles.lineMax} ${missed ? styles.lineMissed : ""} arcade`}>
                    / {line.max}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className={`${styles.total} ${totalIn ? styles.totalIn : ""}`}>
          <span className="label">You scored</span>
          <span className={`${styles.totalValue} arcade`} data-testid="tally-total">
            {formatScore(score)}
            <span className={styles.totalOutOf}>/ {formatScore(max)}</span>
          </span>
        </div>

        <button
          type="button"
          className={`${styles.continue} arcade ${done ? "" : styles.continueWaiting}`}
          onClick={advance}
          data-testid="tally-continue"
        >
          {done ? "TAP TO CONTINUE" : "SKIP"}
        </button>
      </section>
    </div>
  );
}
