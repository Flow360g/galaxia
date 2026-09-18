"use client";

import type { GameState, Round } from "@/lib/game/types";
import { formatDistance, formatRoundNumber, formatSpeed } from "@/lib/game/format";
import styles from "./Hud.module.css";

interface Props {
  state: GameState | null;
  round: Round;
}

/**
 * DOM overlay HUD.
 *
 * Kept in DOM rather than drawn into the canvas: sharp type at any DPR, the
 * design system's mono/sans split for free, no texture uploads, and content a
 * screen reader can actually reach.
 *
 * Every figure is mono with tabular numerals so nothing shifts as digits roll.
 */
export function Hud({ state, round }: Props) {
  const question = state && state.activeQuestion >= 0
    ? round.questions[state.activeQuestion]
    : undefined;

  return (
    <div className={styles.hud}>
      <div className={styles.top}>
        <div className={styles.readout}>
          <span className="label">Distance</span>
          <span className={`${styles.figure} mono`}>
            {formatDistance(state?.distance ?? 0)}
            <span className={styles.unit}>KM</span>
          </span>
        </div>

        <div className={styles.topRight}>
          <span className="eyebrow">
            {formatRoundNumber(round.roundNumber)} / GALAXIA
          </span>
          <div className={styles.readoutRight}>
            <span className="label">Velocity</span>
            <span className={`${styles.figureSmall} mono`}>
              {formatSpeed(state?.speed ?? 0)}
              <span className={styles.unit}>KM/S</span>
            </span>
          </div>
        </div>
      </div>

      {question ? (
        <div className={styles.question}>
          <span className="label">Incoming</span>
          <p className={styles.prompt}>{question.prompt}</p>
        </div>
      ) : null}

      <div className={styles.hint}>
        <span className="label">Drag to steer</span>
      </div>
    </div>
  );
}
