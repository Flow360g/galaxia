"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { GameState, Outcome, OutcomeKind, Round } from "@/lib/game/types";
import { formatDelta, formatDistance, formatVelocity } from "@/lib/game/format";
import styles from "./Hud.module.css";

interface Props {
  state: GameState | null;
  round: Round;
  onAnswer: (option: number) => void;
  onToggleBoost: () => void;
  onNova: () => void;
  onAnomaly: (text: string) => void;
}

const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  thread: "THREADED",
  slingshot: "SLINGSHOT!",
  collision: "COLLISION",
  wreck: "WRECKED",
  timeout: "THRUST OUT",
};

const NOVA_LABEL = {
  eliminate: "NOVA: ONE OPTION RULED OUT",
  clue: "NOVA: CLUE",
  narrow: "NOVA: TWO MOST PLAUSIBLE",
} as const;

/**
 * DOM overlay HUD.
 *
 * Kept in DOM rather than drawn into the canvas: sharp type at any DPR, the
 * arcade face for figures and the sans face for prose, no texture uploads,
 * and content a screen reader can actually reach. The readouts at the top
 * are the speedometer; the panel at the bottom is the only thing that takes
 * taps. The middle of the screen, where the rock looms, stays clear.
 */
export function Hud({ state, round, onAnswer, onToggleBoost, onNova, onAnomaly }: Props) {
  const question =
    state && state.encounter >= 0 ? round.questions[state.encounter] : undefined;
  const answering = state?.phase === "approach";
  const scanning = state?.phase === "scanning";
  const total = round.questions.length;
  const outcome = state?.outcome ?? null;

  useKeyboard({ state, onAnswer, onToggleBoost, onNova });

  const thrust = state?.thrust ?? 1;
  const thrustLow = thrust < 0.3;

  return (
    <div className={styles.hud}>
      <header className={styles.top}>
        <div className={styles.readout}>
          <span className="label">
            {state && state.encounter >= 0
              ? `Encounter ${state.encounter + 1} / ${total}`
              : state?.phase === "finished"
                ? "Run complete"
                : "Engines lit"}
          </span>
          <span className={`${styles.distance} arcade`} data-testid="distance">
            {formatDistance(state?.distance ?? 0)}
            <span className={styles.unit}>KM</span>
          </span>
        </div>

        <div className={styles.readoutRight}>
          <span className="label">Velocity</span>
          <span
            className={`${styles.velocity} arcade ${
              outcome && !outcome.correct ? styles.velocityHit : ""
            }`}
            data-testid="velocity"
          >
            {formatVelocity(state?.velocity ?? 0)}
            <span className={styles.unit}>KM/H</span>
          </span>
          <span className={`${styles.streak} arcade`} data-testid="streak">
            {state && state.streak > 0 ? `STREAK x${state.streak}` : " "}
          </span>
        </div>
      </header>

      {/* Thrust: the answer timer, drawn as fuel draining rather than a clock. */}
      {question && (answering || scanning) ? (
        <div className={styles.thrustRow} aria-label={`Thrust ${Math.round(thrust * 100)}%`}>
          <span className="label">Thrust</span>
          <div className={styles.thrustTrack}>
            <div
              className={`${styles.thrustFill} ${thrustLow ? styles.thrustLow : ""}`}
              style={{ transform: `scaleX(${thrust})` }}
              data-testid="thrust"
            />
          </div>
        </div>
      ) : null}

      <div className={styles.bottom}>
        {question && (answering || scanning) ? (
          <section
            className={`${styles.panel} ${question.type === "anomaly" ? styles.panelAnomaly : ""}`}
            data-testid="question"
          >
            {question.type === "anomaly" ? (
              <span className={`${styles.anomalyTag} arcade`}>AI ANOMALY</span>
            ) : null}
            <p className={styles.prompt}>{question.prompt}</p>

            {question.type === "mcq" ? (
              <>
                {state?.nova ? (
                  <p className={styles.novaLine} data-testid="nova-result">
                    <span className={`${styles.novaLabel} arcade`}>
                      {NOVA_LABEL[state.nova.kind]}
                    </span>
                    {state.nova.clue ? <span> {state.nova.clue}</span> : null}
                  </p>
                ) : null}
                <div className={styles.options}>
                  {question.options.map((option, index) => {
                    const eliminated = state?.nova?.eliminated.includes(index) ?? false;
                    const highlighted = state?.nova?.highlighted.includes(index) ?? false;
                    return (
                      <button
                        key={index}
                        type="button"
                        className={`${styles.option} ${eliminated ? styles.optionOut : ""} ${
                          highlighted ? styles.optionLit : ""
                        }`}
                        disabled={!answering || eliminated}
                        onClick={() => onAnswer(index)}
                        data-testid={`option-${index}`}
                      >
                        <span className={`${styles.optionKey} arcade`}>{index + 1}</span>
                        <span className={styles.optionText}>{option}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <AnomalyForm
                question={question}
                disabled={!answering}
                scanning={scanning}
                onSubmit={onAnomaly}
              />
            )}

            <div className={styles.tools}>
              <button
                type="button"
                className={`${styles.tool} ${styles.nova} arcade`}
                disabled={!answering || question.type !== "mcq" || !state || state.novaLeft <= 0 || !!state.nova}
                onClick={onNova}
                data-testid="nova"
              >
                NOVA <span className={styles.pips}>{"◆".repeat(state?.novaLeft ?? 0)}</span>
              </button>
              <button
                type="button"
                className={`${styles.tool} ${styles.boost} ${state?.boostArmed ? styles.boostOn : ""} arcade`}
                disabled={!answering}
                onClick={onToggleBoost}
                aria-pressed={state?.boostArmed ?? false}
                data-testid="boost"
              >
                {state?.boostArmed ? "BOOST ARMED" : "BOOST"}
              </button>
            </div>
          </section>
        ) : null}

        {outcome ? <OutcomeToast outcome={outcome} fact={question?.fact} /> : null}

        {state?.phase === "intro" ? (
          <p className={`${styles.hint} arcade`}>Answer fast. Thrust is burning.</p>
        ) : null}
      </div>
    </div>
  );
}

function OutcomeToast({ outcome, fact }: { outcome: Outcome; fact: string | undefined }) {
  const delta = outcome.velocityAfter - outcome.velocityBefore;
  return (
    <section
      className={`${styles.toast} ${styles[`toast_${outcome.kind}`]}`}
      data-testid="toast"
      data-outcome={outcome.kind}
    >
      <div className={styles.toastHead}>
        <span className={`${styles.toastKind} arcade`}>{OUTCOME_LABEL[outcome.kind]}</span>
        <span className={`${styles.toastDelta} arcade`}>{formatDelta(delta)} KM/H</span>
      </div>
      {outcome.anomalyVerdict ? (
        <span className={styles.toastAnswer}>
          <strong>{outcome.anomalyVerdict}</strong>
          {" "}
          &middot; Scanner score {Math.round((outcome.anomalyScore ?? 0) * 100)}%
        </span>
      ) : (
        <span className={styles.toastAnswer}>
          Answer: <strong>{outcome.answerText}</strong>
          {!outcome.correct && outcome.chosen !== null ? <> &middot; You: {outcome.guessText}</> : null}
        </span>
      )}
      {outcome.streakAfter >= 2 ? (
        <span className={`${styles.toastStreak} arcade`}>STREAK x{outcome.streakAfter}</span>
      ) : outcome.streakBefore >= 2 && !outcome.correct ? (
        <span className={`${styles.toastStreak} ${styles.toastStreakLost} arcade`}>
          STREAK x{outcome.streakBefore} LOST
        </span>
      ) : null}
      {fact ? <span className={styles.toastFact}>{fact}</span> : null}
    </section>
  );
}

function AnomalyForm({
  question,
  disabled,
  scanning,
  onSubmit,
}: {
  question: Extract<Round["questions"][number], { type: "anomaly" }>;
  disabled: boolean;
  scanning: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    onSubmit(text);
  };

  return (
    <form className={styles.anomaly} onSubmit={submit}>
      {question.kind === "visual" && question.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.anomalyImage}
          src={question.image}
          alt={question.imageAlt ?? ""}
          width={512}
          height={512}
        />
      ) : null}
      <div className={styles.anomalyRow}>
        <input
          ref={inputRef}
          className={styles.anomalyInput}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="send"
          maxLength={200}
          placeholder={scanning ? "Scanning..." : "Type your answer"}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          data-testid="anomaly-input"
        />
        <button
          type="submit"
          className={`${styles.transmit} arcade`}
          disabled={disabled}
          data-testid="anomaly-submit"
        >
          {scanning ? "SCANNING" : "TRANSMIT"}
        </button>
      </div>
    </form>
  );
}

/** 1-4 answer, B arms boost, N fires a scan. Ignored while typing. */
function useKeyboard({
  state,
  onAnswer,
  onToggleBoost,
  onNova,
}: Pick<Props, "state" | "onAnswer" | "onToggleBoost" | "onNova">) {
  const latest = useRef({ state, onAnswer, onToggleBoost, onNova });
  useEffect(() => {
    latest.current = { state, onAnswer, onToggleBoost, onNova };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const current = latest.current;
      if (current.state?.phase !== "approach") return;

      if (event.key >= "1" && event.key <= "4") {
        current.onAnswer(Number(event.key) - 1);
      } else if (event.key === "b" || event.key === "B") {
        current.onToggleBoost();
      } else if (event.key === "n" || event.key === "N") {
        current.onNova();
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
