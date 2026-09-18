"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  ClusterState,
  GameState,
  Outcome,
  OutcomeKind,
  Pulse,
  Round,
} from "@/lib/game/types";
import { CLUSTER, ENCOUNTER } from "@/lib/game/Tuning";
import { formatDelta, formatDistance, formatVelocity } from "@/lib/game/format";
import styles from "./Hud.module.css";

interface Props {
  state: GameState | null;
  round: Round;
  onAnswer: (option: number) => void;
  onPick: (lane: number) => void;
  onBurn: () => void;
  onToggleBoost: () => void;
  onNova: () => void;
  onAnomaly: (text: string) => void;
  /**
   * Where the answer squares ended up, as fractions of viewport width. The
   * engine steers the ship to the lane under the square that was tapped, so
   * it needs the real measured layout rather than an assumed one.
   */
  onLanes: (fractions: number[]) => void;
}

const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  thread: "LANE CLEAR",
  slingshot: "SLINGSHOT!",
  collision: "COLLISION",
  wreck: "WRECKED",
  timeout: "TOO SLOW",
  burn: "BURN",
};

const NOVA_LABEL = {
  eliminate: "NOVA: ONE OPTION RULED OUT",
  clue: "NOVA: CLUE",
  narrow: "NOVA: TWO MOST PLAUSIBLE",
} as const;

const FULL_CHARGE = CLUSTER.chargeMultiplier.length - 1;

/**
 * DOM overlay HUD.
 *
 * The whole thing lives in a band across the TOP of the screen: readouts,
 * question, the row of answer squares, the reactor and the tools. Below that
 * band is nothing at all, because that is where the ship flies. Covering the
 * ship with the thing the player is reading was the single worst part of the
 * old layout, and the rule now is simply that the bottom half is the game's.
 *
 * The answer squares are one horizontal row, and the row is the game's lane
 * map: square 3 sits over lane 3, so tapping it veers the ship to a point
 * genuinely underneath it. The row measures itself and hands the engine the
 * numbers, which is the only way that holds at every screen size.
 *
 * Kept in DOM rather than drawn into the canvas: sharp type at any DPR, the
 * arcade face for figures and the sans face for prose, no texture uploads,
 * and content a screen reader can actually reach.
 */
export function Hud({
  state,
  round,
  onAnswer,
  onPick,
  onBurn,
  onToggleBoost,
  onNova,
  onAnomaly,
  onLanes,
}: Props) {
  const question =
    state && state.encounter >= 0 ? round.questions[state.encounter] : undefined;
  const answering = state?.phase === "approach";
  const collecting = state?.phase === "collecting";
  const scanning = state?.phase === "scanning";
  const open = answering || collecting || scanning;
  const total = round.questions.length;
  const outcome = state?.outcome ?? null;
  const isCluster = question?.type === "cluster";
  const isAnomaly = question?.type === "anomaly";

  useKeyboard({ state, question, onAnswer, onPick, onBurn, onToggleBoost, onNova });
  // The overlay's CSS animation ends invisible, so it can simply live as long
  // as the full-burn outcome is current; no timer needed.
  const warp = outcome?.kind === "burn" && (outcome.charge ?? 0) >= FULL_CHARGE;

  const thrust = state?.thrust ?? 1;
  const seconds = Math.max(Math.ceil(thrust * ENCOUNTER.thrustSeconds), 0);
  const thrustLow = thrust < 0.35;
  const shields = state?.shields ?? 0;
  const maxShields = state?.maxShields ?? 0;

  return (
    <div className={styles.hud}>
      {warp ? <div className={styles.warp} data-testid="warp" aria-hidden="true" /> : null}
      {state?.pulse ? <PulseOverlay key={state.pulse.id} pulse={state.pulse} /> : null}

      <div className={styles.board}>
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
              {state && state.streak > 0 ? `STREAK x${state.streak}` : " "}
            </span>
            <span
              className={`${styles.shield} ${shields === 0 ? styles.shieldDown : ""} arcade`}
              data-testid="shield"
              data-shield={String(shields > 0)}
              data-shields={shields}
              aria-label={`${shields} of ${maxShields} shields`}
            >
              {shields > 0
                ? Array.from({ length: maxShields }, (_, i) => (
                    <span key={i} className={i < shields ? styles.pipUp : styles.pipOut}>
                      ◈
                    </span>
                  ))
                : "NO SHIELDS"}
            </span>
          </div>
        </header>

        {question && open ? (
          <section
            className={`${styles.panel} ${isAnomaly ? styles.panelAnomaly : ""} ${
              isCluster ? styles.panelCluster : ""
            }`}
            data-testid="question"
          >
            <div className={styles.panelHead}>
              {isAnomaly ? (
                <span className={`${styles.anomalyTag} arcade`}>AI ANOMALY</span>
              ) : isCluster ? (
                <span className={`${styles.clusterTag} arcade`}>CLUSTER · 3 OF 6</span>
              ) : (
                <span className={`${styles.clusterTag} arcade`}>PICK A LANE</span>
              )}
              {answering || scanning ? (
                <span
                  className={`${styles.clock} ${thrustLow ? styles.clockLow : ""} arcade`}
                  data-testid="clock"
                >
                  {seconds}s
                </span>
              ) : null}
            </div>

            <p className={styles.prompt}>{question.prompt}</p>

            {/* The clock, drawn as thrust draining rather than as a dial. */}
            {answering || scanning ? (
              <div
                className={styles.thrustTrack}
                aria-label={`Thrust ${Math.round(thrust * 100)}%`}
              >
                <div
                  className={`${styles.thrustFill} ${thrustLow ? styles.thrustLow : ""}`}
                  style={{ transform: `scaleX(${thrust})` }}
                  data-testid="thrust"
                />
              </div>
            ) : null}

            {state?.nova && !isAnomaly ? (
              <p className={styles.novaLine} data-testid="nova-result">
                <span className={`${styles.novaLabel} arcade`}>{NOVA_LABEL[state.nova.kind]}</span>
                {state.nova.clue ? <span> {state.nova.clue}</span> : null}
              </p>
            ) : null}

            {isCluster ? <Reactor cluster={state?.cluster ?? null} /> : null}

            {question.type === "anomaly" ? (
              <AnomalyForm
                question={question}
                disabled={!answering}
                scanning={scanning}
                onSubmit={onAnomaly}
              />
            ) : (
              <LaneRow
                options={question.options}
                picked={state?.cluster?.picked ?? []}
                eliminated={state?.nova?.eliminated ?? []}
                highlighted={state?.nova?.highlighted ?? []}
                disabled={!answering || collecting}
                onPick={question.type === "cluster" ? onPick : onAnswer}
                onLanes={onLanes}
              />
            )}

            <div className={styles.tools}>
              <button
                type="button"
                className={`${styles.tool} ${styles.nova} arcade`}
                disabled={
                  !answering || isAnomaly || !state || state.novaLeft <= 0 || !!state.nova
                }
                onClick={onNova}
                data-testid="nova"
              >
                NOVA <span className={styles.pips}>{"◆".repeat(state?.novaLeft ?? 0)}</span>
              </button>
              {isCluster ? (
                <button
                  type="button"
                  className={`${styles.tool} ${styles.burn} ${
                    (state?.cluster?.charge ?? 0) >= 2 ? styles.burnHot : ""
                  } arcade`}
                  disabled={!answering || (state?.cluster?.charge ?? 0) <= 0}
                  onClick={onBurn}
                  data-testid="burn"
                >
                  {(state?.cluster?.charge ?? 0) > 0
                    ? `BANK +${formatVelocity(state?.cluster?.projected ?? 0)}`
                    : "BANK"}
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.tool} ${styles.boost} ${
                    state?.boostArmed ? styles.boostOn : ""
                  } arcade`}
                  disabled={!answering || isAnomaly}
                  onClick={onToggleBoost}
                  aria-pressed={state?.boostArmed ?? false}
                  data-testid="boost"
                >
                  {state?.boostArmed ? "BOOST ARMED" : "BOOST"}
                </button>
              )}
            </div>
          </section>
        ) : null}

        {outcome ? <OutcomeToast outcome={outcome} fact={question?.fact} /> : null}

        {state?.phase === "intro" ? (
          <p className={`${styles.hint} arcade`}>Five seconds a lane. Pick fast.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The answer squares: one row, one square per lane, in lane order.
 *
 * The row measures itself after every layout and reports each square's centre
 * as a fraction of viewport width. That measurement is what makes the ship
 * arrive underneath the square the player tapped rather than at a lane the
 * engine guessed, at any aspect ratio and any label length.
 */
function LaneRow({
  options,
  picked,
  eliminated,
  highlighted,
  disabled,
  onPick,
  onLanes,
}: {
  options: string[];
  picked: number[];
  eliminated: number[];
  highlighted: number[];
  disabled: boolean;
  onPick: (lane: number) => void;
  onLanes: (fractions: number[]) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const report = useRef(onLanes);
  useEffect(() => {
    report.current = onLanes;
  });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const width = window.innerWidth || 1;
    const fractions = Array.from(row.children, (child) => {
      const box = (child as HTMLElement).getBoundingClientRect();
      return (box.left + box.width / 2) / width;
    });
    if (fractions.length) report.current(fractions);
  }, []);

  useLayoutEffect(() => {
    measure();
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, options]);

  return (
    <div className={styles.lanes} ref={rowRef}>
      {options.map((option, index) => {
        const got = picked.includes(index);
        const out = eliminated.includes(index);
        const lit = highlighted.includes(index);
        return (
          <button
            key={index}
            type="button"
            className={`${styles.lane} ${got ? styles.laneGot : ""} ${
              out ? styles.laneOut : ""
            } ${lit ? styles.laneLit : ""}`}
            disabled={disabled || got || out}
            onClick={() => onPick(index)}
            data-testid={`option-${index}`}
            data-got={got}
          >
            <span className={`${styles.laneKey} arcade`}>{index + 1}</span>
            <span className={styles.laneText}>{option}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The reactor: how much plasma is aboard, and what banking it is worth. */
function Reactor({ cluster }: { cluster: ClusterState | null }) {
  const charge = cluster?.charge ?? 0;
  const segments = Array.from({ length: FULL_CHARGE }, (_, i) => i < charge);
  return (
    <div className={styles.reactor} aria-label={`Plasma ${charge} of ${FULL_CHARGE}`}>
      <span className={`${styles.reactorLabel} arcade`}>PLASMA</span>
      <div className={styles.reactorTrack} data-testid="reactor" data-charge={charge}>
        {segments.map((lit, i) => (
          <span
            key={i}
            className={`${styles.reactorCell} ${lit ? styles.reactorLit : ""}`}
            data-testid={`plasma-${i}`}
            data-lit={lit}
          />
        ))}
      </div>
      <span className={`${styles.reactorValue} arcade`}>
        {charge > 0 ? `+${formatVelocity(cluster?.projected ?? 0)} KM/H` : "EMPTY"}
      </span>
    </div>
  );
}

/**
 * The one-shot banner for a collected pod or a lost shield. Its caller keys
 * it on the pulse id, so two identical pulses in a row replay the animation
 * instead of the second one landing on an element that already finished.
 */
function PulseOverlay({ pulse }: { pulse: Pulse }) {
  return (
    <div
      className={`${styles.pulse} ${styles[`pulse_${pulse.kind}`]}`}
      data-testid="pulse"
      data-kind={pulse.kind}
      aria-live="polite"
    >
      {pulse.kind === "shield" ? (
        <span className={styles.pulseRing} aria-hidden="true" />
      ) : null}
      <span className={`${styles.pulseLabel} arcade`}>{pulse.label}</span>
      <span className={`${styles.pulseDetail} arcade`}>{pulse.detail}</span>
    </div>
  );
}

function OutcomeToast({ outcome, fact }: { outcome: Outcome; fact: string | undefined }) {
  const delta = outcome.velocityAfter - outcome.velocityBefore;
  const full = outcome.kind === "burn" && (outcome.charge ?? 0) >= FULL_CHARGE;
  const label = full ? "FULL BURN!" : OUTCOME_LABEL[outcome.kind];
  return (
    <section
      className={`${styles.toast} ${styles[`toast_${outcome.kind}`]} ${full ? styles.toast_full : ""}`}
      data-testid="toast"
      data-outcome={outcome.kind}
      data-charge={outcome.charge}
    >
      <div className={styles.toastHead}>
        <span className={`${styles.toastKind} arcade`}>{label}</span>
        <span className={`${styles.toastDelta} arcade`}>{formatDelta(delta)} KM/H</span>
      </div>
      {outcome.kind === "burn" ? (
        <span className={styles.toastAnswer}>
          Banked <strong>{outcome.charge} plasma</strong>
          {(outcome.charge ?? 0) < FULL_CHARGE ? <> &middot; All three: {outcome.answerText}</> : null}
        </span>
      ) : outcome.picks ? (
        <span className={styles.toastAnswer}>
          The three: <strong>{outcome.answerText}</strong>
          {!outcome.correct && outcome.chosen !== null ? <> &middot; You hit: {outcome.guessText}</> : null}
          {!outcome.correct && outcome.picks.length > 1 ? (
            <> &middot; {outcome.picks.length - 1} plasma lost</>
          ) : null}
        </span>
      ) : outcome.anomalyVerdict ? (
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

/**
 * 1-4 answer (1-6 on a cluster), Enter or Space banks, B arms boost, N fires
 * a scan. Ignored while typing.
 */
function useKeyboard({
  state,
  question,
  onAnswer,
  onPick,
  onBurn,
  onToggleBoost,
  onNova,
}: Pick<Props, "state" | "onAnswer" | "onPick" | "onBurn" | "onToggleBoost" | "onNova"> & {
  question: Round["questions"][number] | undefined;
}) {
  const latest = useRef({ state, question, onAnswer, onPick, onBurn, onToggleBoost, onNova });
  useEffect(() => {
    latest.current = { state, question, onAnswer, onPick, onBurn, onToggleBoost, onNova };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const current = latest.current;
      if (current.state?.phase !== "approach") return;
      const cluster = current.question?.type === "cluster";

      if (cluster && event.key >= "1" && event.key <= "6") {
        current.onPick(Number(event.key) - 1);
      } else if (cluster && (event.key === "Enter" || event.key === " ")) {
        current.onBurn();
      } else if (!cluster && event.key >= "1" && event.key <= "4") {
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
