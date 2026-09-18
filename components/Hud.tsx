"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ClusterQuestion,
  ClusterState,
  GameState,
  Outcome,
  OutcomeKind,
  Rating,
  Round,
  VectorQuestion,
  VectorState,
  WaypointState,
} from "@/lib/game/types";
import { CLUSTER, WAYPOINT } from "@/lib/game/Tuning";
import { formatValue } from "@/lib/game/Run";
import { formatDelta, formatDistance, formatVelocity } from "@/lib/game/format";
import styles from "./Hud.module.css";

interface Props {
  state: GameState | null;
  round: Round;
  onAnswer: (option: number) => void;
  onPick: (lane: number) => void;
  onBurn: () => void;
  onAim: (t: number) => void;
  onLockVector: () => void;
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
 * Kept in DOM rather than drawn into the canvas: sharp type at any DPR, the
 * arcade face for figures and the sans face for prose, no texture uploads,
 * and content a screen reader can actually reach. The readouts at the top
 * are the speedometer; the panel at the bottom is the only thing that takes
 * taps. The middle of the screen, where the rock looms, stays clear.
 */
export function Hud({
  state,
  round,
  onAnswer,
  onPick,
  onBurn,
  onAim,
  onLockVector,
  onToggleBoost,
  onNova,
  onAnomaly,
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
  const isVector = question?.type === "vector";
  const waypoint = state?.phase === "waypoint" ? state.waypoint : null;

  useKeyboard({ state, question, onAnswer, onPick, onBurn, onAim, onLockVector, onToggleBoost, onNova });
  // The overlay's CSS animation ends invisible, so it can simply live as long
  // as the full-burn outcome is current; no timer needed.
  const warp = outcome?.kind === "burn" && (outcome.charge ?? 0) >= FULL_CHARGE;

  const thrust = state?.thrust ?? 1;
  const thrustLow = thrust < 0.3;

  return (
    <div className={styles.hud}>
      {warp ? <div className={styles.warp} data-testid="warp" aria-hidden="true" /> : null}
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
          <span
            className={`${styles.shield} ${state && !state.shield ? styles.shieldDown : ""} arcade`}
            data-testid="shield"
            data-shield={state ? String(state.shield) : "true"}
          >
            {state && !state.shield ? "SHIELD DOWN" : "◈ SHIELD"}
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
        {question && open ? (
          <section
            className={`${styles.panel} ${question.type === "anomaly" ? styles.panelAnomaly : ""} ${
              isCluster ? styles.panelCluster : ""
            } ${isVector ? styles.panelVector : ""}`}
            data-testid="question"
          >
            {question.type === "anomaly" ? (
              <span className={`${styles.anomalyTag} arcade`}>AI ANOMALY</span>
            ) : null}
            {isCluster ? (
              <span className={`${styles.clusterTag} arcade`}>CLUSTER · 3 OF 6</span>
            ) : null}
            {isVector ? (
              <span className={`${styles.vectorTag} arcade`}>VECTOR · FIRING SOLUTION</span>
            ) : null}
            <p className={styles.prompt}>{question.prompt}</p>

            {question.type === "vector" ? (
              <VectorPanel
                question={question}
                vector={state?.vector ?? null}
                answering={answering}
                narrowed={!!state?.nova}
                onAim={onAim}
                onLock={onLockVector}
              />
            ) : question.type === "cluster" ? (
              <ClusterPanel
                question={question}
                cluster={state?.cluster ?? null}
                answering={answering}
                collecting={collecting}
                onPick={onPick}
                onBurn={onBurn}
              />
            ) : question.type === "mcq" ? (
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
                disabled={
                  !answering ||
                  question.type === "anomaly" ||
                  !state ||
                  state.novaLeft <= 0 ||
                  !!state.nova
                }
                onClick={onNova}
                data-testid="nova"
              >
                NOVA <span className={styles.pips}>{"◆".repeat(state?.novaLeft ?? 0)}</span>
              </button>
              {isCluster || isVector ? null : (
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
              )}
            </div>
          </section>
        ) : null}

        {outcome ? <OutcomeToast outcome={outcome} fact={question?.fact} /> : null}

        {waypoint ? <WaypointCard waypoint={waypoint} /> : null}

        {state?.phase === "intro" ? (
          <p className={`${styles.hint} arcade`}>Answer fast. Thrust is burning.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The cluster panel: reactor gauge, six lanes, and the BURN decision. The
 * projected gain is shown on the button so the risk is a number, not a vibe.
 */
function ClusterPanel({
  question,
  cluster,
  answering,
  collecting,
  onPick,
  onBurn,
}: {
  question: ClusterQuestion;
  cluster: ClusterState | null;
  answering: boolean;
  collecting: boolean;
  onPick: (lane: number) => void;
  onBurn: () => void;
}) {
  const charge = cluster?.charge ?? 0;
  const picked = cluster?.picked ?? [];
  const eliminated = cluster?.eliminated ?? [];
  const segments = Array.from({ length: FULL_CHARGE }, (_, i) => i < charge);

  return (
    <div className={styles.cluster}>
      <div className={styles.reactor} aria-label={`Plasma ${charge} of ${FULL_CHARGE}`}>
        <span className={`${styles.reactorLabel} arcade`}>REACTOR</span>
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
          {charge > 0 ? `${charge} PLASMA` : "EMPTY"}
        </span>
      </div>

      <div className={styles.lanes}>
        {question.options.map((option, index) => {
          const got = picked.includes(index);
          const out = eliminated.includes(index);
          return (
            <button
              key={index}
              type="button"
              className={`${styles.option} ${styles.lane} ${got ? styles.laneGot : ""} ${
                out ? styles.optionOut : ""
              }`}
              disabled={!answering || got || out || collecting}
              onClick={() => onPick(index)}
              data-testid={`option-${index}`}
              data-got={got}
            >
              <span className={`${styles.optionKey} arcade`}>{index + 1}</span>
              <span className={styles.optionText}>{option}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.burnRow}>
        <button
          type="button"
          className={`${styles.burn} ${charge >= 2 ? styles.burnHot : ""} arcade`}
          disabled={!answering || charge <= 0}
          onClick={onBurn}
          data-testid="burn"
        >
          {charge > 0 ? `BURN  +${formatVelocity(cluster?.projected ?? 0)} KM/H` : "PICK A LANE"}
        </button>
        <span className={styles.burnNext}>
          {charge > 0 && charge < FULL_CHARGE
            ? `one more: +${formatVelocity(cluster?.projectedNext ?? 0)} km/h, or lose it all`
            : charge === 0
              ? "each correct lane charges the reactor"
              : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * The vector panel: aim on a slider, the ship follows, LOCK fires. The value
 * is shown live in answer units; the track shows the window a NOVA scan
 * left open.
 */
function VectorPanel({
  question,
  vector,
  answering,
  narrowed,
  onAim,
  onLock,
}: {
  question: VectorQuestion;
  vector: VectorState | null;
  answering: boolean;
  narrowed: boolean;
  onAim: (t: number) => void;
  onLock: () => void;
}) {
  const t = vector?.t ?? 0.5;
  const [lo, hi] = vector?.window ?? [0, 1];
  const value = vector?.value ?? (question.min + question.max) / 2;
  const nudge = (direction: -1 | 1) => onAim(t + direction * NUDGE);

  return (
    <div className={styles.vector}>
      <div className={styles.aimReadout}>
        <span className={`${styles.aimLabel} arcade`}>AIM</span>
        <span className={`${styles.aimValue} arcade`} data-testid="aim-value">
          {formatValue(value, question.unit)}
        </span>
        {narrowed ? <span className={`${styles.aimNova} arcade`}>NOVA: WINDOW</span> : null}
      </div>
      <div className={styles.sliderRow}>
        <button
          type="button"
          className={`${styles.nudge} arcade`}
          disabled={!answering}
          onClick={() => nudge(-1)}
          aria-label="Aim lower"
        >
          {"\u2039"}
        </button>
        <div className={styles.sliderTrack}>
          <div
            className={styles.sliderWindow}
            style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
          />
          <input
            className={styles.slider}
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(t * 1000)}
            disabled={!answering}
            onChange={(event) => onAim(Number(event.target.value) / 1000)}
            aria-label={`Aim, ${formatValue(value, question.unit)}`}
            data-testid="aim"
          />
        </div>
        <button
          type="button"
          className={`${styles.nudge} arcade`}
          disabled={!answering}
          onClick={() => nudge(1)}
          aria-label="Aim higher"
        >
          {"\u203a"}
        </button>
      </div>
      <div className={styles.sliderEnds}>
        <span>{formatValue(question.min, question.unit)}</span>
        <span>{formatValue(question.max, question.unit)}</span>
      </div>
      <button
        type="button"
        className={`${styles.lock} arcade`}
        disabled={!answering}
        onClick={onLock}
        data-testid="lock"
      >
        LOCK &amp; FIRE
      </button>
    </div>
  );
}

const RATING_TEXT: Record<Rating, string> = {
  S: "FLAWLESS",
  A: "SHARP",
  B: "STEADY",
  C: "ROUGH",
};

/** Between stages: what you just flew, the rating, and what is coming. */
function WaypointCard({ waypoint }: { waypoint: WaypointState }) {
  const rated = waypoint.t >= WAYPOINT.ratingAt;
  const entering = waypoint.t >= WAYPOINT.enteringAt;
  return (
    <section
      className={`${styles.waypoint} ${entering ? styles.waypointEntering : ""}`}
      data-testid="waypoint"
      data-rating={waypoint.rating}
    >
      {!entering ? (
        <>
          <span className={`${styles.wpStage} arcade`}>STAGE CLEAR · {waypoint.stage.toUpperCase()}</span>
          {rated ? (
            <>
              <span
                className={`${styles.wpRating} ${styles[`wpRating_${waypoint.rating}`]} arcade`}
                data-testid="rating"
              >
                {waypoint.rating}
              </span>
              <span className={`${styles.wpRatingText} arcade`}>{RATING_TEXT[waypoint.rating]}</span>
              <ul className={styles.wpTally}>
                <li>{waypoint.plasma} / 6 PLASMA</li>
                <li>{waypoint.shield ? "SHIELD INTACT" : "SHIELD DOWN"}</li>
                <li>PEAK {formatVelocity(waypoint.peakVelocity)} KM/H</li>
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <>
          <span className={`${styles.wpEntering} arcade`}>ENTERING PHASE 2</span>
          <span className={`${styles.wpNext} arcade`}>{waypoint.next.toUpperCase()}</span>
          <span className={styles.wpHint}>An alien scout is shadowing you. Aim, lock, fire.</span>
        </>
      )}
    </section>
  );
}

const NUDGE = 0.01;

function OutcomeToast({ outcome, fact }: { outcome: Outcome; fact: string | undefined }) {
  const delta = outcome.velocityAfter - outcome.velocityBefore;
  const full = outcome.kind === "burn" && (outcome.charge ?? 0) >= FULL_CHARGE;
  const vector = outcome.error !== undefined;
  const label = full
    ? "FULL BURN!"
    : vector
      ? outcome.kind === "slingshot"
        ? "DIRECT HIT!"
        : outcome.kind === "thread"
          ? "GLANCING HIT"
          : outcome.timedOut
            ? "NO SOLUTION"
            : "MISS"
      : OUTCOME_LABEL[outcome.kind];
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
      {vector ? (
        <span className={styles.toastAnswer}>
          Truth: <strong>{outcome.answerText}</strong>
          {!outcome.timedOut ? <> &middot; You aimed {outcome.guessText}</> : null}
          {outcome.salvage ? (
            <>
              {" "}
              &middot;{" "}
              <strong data-testid="salvage">
                SALVAGE: {outcome.salvage === "shield" ? "SHIELD RESTORED" : "+1 NOVA"}
              </strong>
            </>
          ) : null}
        </span>
      ) : outcome.kind === "burn" ? (
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
 * 1-4 answer (1-6 on a cluster), Enter or Space burns, B arms boost, N fires
 * a scan. Ignored while typing.
 */
function useKeyboard({
  state,
  question,
  onAnswer,
  onPick,
  onBurn,
  onAim,
  onLockVector,
  onToggleBoost,
  onNova,
}: Pick<
  Props,
  "state" | "onAnswer" | "onPick" | "onBurn" | "onAim" | "onLockVector" | "onToggleBoost" | "onNova"
> & {
  question: Round["questions"][number] | undefined;
}) {
  const latest = useRef({
    state,
    question,
    onAnswer,
    onPick,
    onBurn,
    onAim,
    onLockVector,
    onToggleBoost,
    onNova,
  });
  useEffect(() => {
    latest.current = {
      state,
      question,
      onAnswer,
      onPick,
      onBurn,
      onAim,
      onLockVector,
      onToggleBoost,
      onNova,
    };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.tagName === "TEXTAREA") return;
      if (target && target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range") return;
      const current = latest.current;
      if (current.state?.phase !== "approach") return;
      const cluster = current.question?.type === "cluster";
      const vector = current.question?.type === "vector";

      if (vector && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const t = current.state?.vector?.t ?? 0.5;
        current.onAim(t + (event.key === "ArrowLeft" ? -NUDGE : NUDGE));
      } else if (vector && event.key === "Enter") {
        current.onLockVector();
      } else if (cluster && event.key >= "1" && event.key <= "6") {
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
