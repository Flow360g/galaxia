"use client";

import Link from "next/link";
import type { Round, RoundSummary } from "@/lib/game/types";
import { formatDistance, formatRoundNumber, formatScore } from "@/lib/game/format";
import { BAND_GLYPH } from "@/lib/game/scoring";
import styles from "./RoundEnd.module.css";

interface Props {
  round: Round;
  summary: RoundSummary;
}

/** End-of-round results, over the frozen final frame. */
export function RoundEnd({ round, summary }: Props) {
  return (
    <div className={styles.overlay} data-testid="round-end">
      <div className={styles.panel}>
        <span className="eyebrow">
          {formatRoundNumber(round.roundNumber)} / ROUND COMPLETE
        </span>
        <h2 className={`${styles.title} arcade`}>GAME OVER</h2>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className="label">Score</span>
            <span className={`${styles.statValue} arcade`} data-testid="final-score">
              {formatScore(summary.score)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className="label">Distance</span>
            <span className={`${styles.statValue} arcade`}>
              {formatDistance(summary.distance)}
              <span className={styles.unit}>KM</span>
            </span>
          </div>
        </div>

        <div className={styles.grid} aria-label="Answer grid" data-testid="share-grid">
          {summary.bands.map((band, i) => (
            <span key={i} className={styles.glyph}>
              {BAND_GLYPH[band]}
            </span>
          ))}
        </div>

        <Link href="/play" className={`${styles.again} arcade`}>
          PLAY AGAIN
        </Link>
      </div>
    </div>
  );
}
