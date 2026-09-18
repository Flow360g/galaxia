"use client";

import { useEffect, useState } from "react";
import type { AnswerEvent, GameState, Round } from "@/lib/game/types";
import { formatDistance, formatScore, formatSpeed } from "@/lib/game/format";
import { BAND_LABEL, formatValue, labelsForQuestion } from "@/lib/game/scoring";
import { SCORING, WORLD } from "@/lib/game/Tuning";
import styles from "./Hud.module.css";

interface Props {
  state: GameState | null;
  round: Round;
  lastAnswer: AnswerEvent | null;
}

const HULL_SEGMENTS = 5;

/**
 * DOM overlay HUD.
 *
 * Kept in DOM rather than drawn into the canvas: sharp type at any DPR, the
 * arcade face for figures and the sans face for prose, no texture uploads,
 * and content a screen reader can actually reach.
 */
export function Hud({ state, round, lastAnswer }: Props) {
  const question =
    state && state.activeQuestion >= 0
      ? round.questions[state.activeQuestion]
      : undefined;

  const toast = useToast(lastAnswer);
  const hull = state?.hull ?? 1;
  const litSegments = Math.round(hull * HULL_SEGMENTS);

  return (
    <div className={styles.hud}>
      {/* Question, or the resolve toast, at the top: the ship and the rocks
          arriving at the horizon keep the middle and lower screen clear. */}
      {question && state?.answering ? (
        <div className={styles.question} data-testid="question">
          <span className="label">
            Incoming {state.questionsAnswered + 1} / {round.questions.length}
          </span>
          <p className={styles.prompt}>{question.prompt}</p>
          {/* The four lanes in order, current lane lit. Lets the player
              pre-steer before the rocks are close enough to read. */}
          <div className={styles.lanes} data-testid="lanes">
            {labelsForQuestion(question, WORLD.laneCount).map((label, lane) => (
              <span
                key={lane}
                className={`${styles.lane} ${
                  lane === state.currentLane ? styles.laneOn : ""
                }`}
              >
                {label}
              </span>
            ))}
          </div>
          {state.liveGuess !== null ? (
            <span className={styles.guess}>
              <span className="label">Your answer</span>
              <span className={`${styles.guessValue} arcade`} data-testid="live-guess">
                {formatValue(question, state.liveGuess)}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {toast ? (
        <div
          className={`${styles.toast} ${styles[`toast_${toast.result.band}`]}`}
          data-testid="toast"
        >
          <span className={`${styles.toastBand} arcade`}>
            {BAND_LABEL[toast.result.band]}
            {toast.result.points > 0 ? ` +${toast.result.points}` : ""}
          </span>
          <span className={styles.toastAnswer}>
            Answer: <strong>{toast.result.answerText}</strong>
            {toast.result.band !== "pinpoint" ? (
              <>
                {" "}
                &middot; You: {toast.result.guessText}
              </>
            ) : null}
          </span>
          {toast.question.fact ? (
            <span className={styles.toastFact}>{toast.question.fact}</span>
          ) : null}
        </div>
      ) : null}

      {/* Only between questions: while a card is up the space is theirs. */}
      {!question && !toast ? (
        <div className={styles.hint}>
          <span className="label">Drag to steer into your answer</span>
        </div>
      ) : null}

      <div className={styles.bottom}>
        <div className={styles.column}>
          <div className={styles.readout}>
            <span className="label">Score</span>
            <span className={`${styles.figure} arcade`} data-testid="score">
              {formatScore(state?.score ?? 0)}
            </span>
          </div>
          <div className={styles.readout}>
            <span className="label">Distance</span>
            <span className={`${styles.figureSmall} arcade`}>
              {formatDistance(state?.distance ?? 0)}
              <span className={styles.unit}>KM</span>
            </span>
          </div>
        </div>

        <div className={styles.columnRight}>
          <div className={styles.readoutRight}>
            <span className="label">Hull</span>
            <span className={styles.hull} aria-label={`Hull ${Math.round(hull * 100)}%`}>
              {Array.from({ length: HULL_SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  className={i < litSegments ? styles.hullOn : styles.hullOff}
                />
              ))}
            </span>
          </div>
          <div className={styles.readoutRight}>
            <span className="label">Velocity</span>
            <span className={`${styles.figureSmall} arcade`}>
              {formatSpeed(state?.speed ?? 0)}
              <span className={styles.unit}>KM/S</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Holds the latest answer on screen for a few seconds, then clears it. */
function useToast(lastAnswer: AnswerEvent | null): AnswerEvent | null {
  // Track which answer has expired rather than copying the answer into state,
  // so the effect only ever sets state from its timer callback.
  const [expired, setExpired] = useState<AnswerEvent | null>(null);

  useEffect(() => {
    if (!lastAnswer) return;
    const handle = window.setTimeout(
      () => setExpired(lastAnswer),
      SCORING.toastSeconds * 1000,
    );
    return () => window.clearTimeout(handle);
  }, [lastAnswer]);

  return lastAnswer && expired !== lastAnswer ? lastAnswer : null;
}
