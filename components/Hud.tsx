"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";
import type {
  ClusterState,
  GameState,
  Outcome,
  OutcomeKind,
  Pulse,
  Rating,
  Round,
  VectorQuestion,
  VectorState,
  WaypointState,
} from "@/lib/game/types";
import { COUNTDOWN, ENCOUNTER, SCORE, WAYPOINT } from "@/lib/game/Tuning";
import { FULL_CHARGE, isMaxThrust } from "@/lib/game/Flight";
import { formatValue } from "@/lib/game/Run";
import {
  formatDelta,
  formatDistance,
  formatPoints,
  formatScore,
  formatVelocity,
} from "@/lib/game/format";
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
  /** WHERE ON EARTH: ENTER SPACE STATION, once the engine reports the ship alongside. */
  onEnterStation: () => void;
  /** Tap to move past a verdict or a waypoint card. Nothing else advances them. */
  onConfirm: () => void;
  /**
   * Where the answer squares ended up, as fractions of viewport width. The
   * engine steers the ship to the lane under the square that was tapped, so
   * it needs the real measured layout rather than an assumed one.
   */
  onLanes: (fractions: number[]) => void;
  /** Sound off. The engine owns the audio; this is only its switch. */
  muted: boolean;
  onToggleSound: () => void;
}

const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  thread: "LANE CLEAR",
  slingshot: "SLINGSHOT!",
  collision: "COLLISION",
  wreck: "WRECKED",
  timeout: "TOO SLOW",
  burn: "BURN",
  dock: "DOCKED",
};

const NOVA_LABEL = {
  eliminate: "NOVA: ONE OPTION RULED OUT",
  clue: "NOVA: CLUE",
  narrow: "NOVA: TWO MOST PLAUSIBLE",
} as const;

/** Slider step for a nudge button or an arrow key. */
const NUDGE = 0.01;

const RATING_TEXT: Record<Rating, string> = {
  S: "FLAWLESS",
  A: "SHARP",
  B: "STEADY",
  C: "ROUGH",
};

/**
 * What a Vector is worth, read from the scoring table rather than typed out,
 * so retuning the score can never leave the briefing lying about it. The
 * bands are named, not given as percentages: `VECTOR.perfectBand` is a
 * fraction of the question's authored tolerance, not of the answer, so "within
 * 15%" would be wrong however true it looks.
 */
const VECTOR_BANDS: Array<[string, string]> = [
  ["DEAD ON", `${Math.round(SCORE.perEncounter * SCORE.vectorDirect)} PTS`],
  ["CLOSE", `${Math.round(SCORE.perEncounter * SCORE.vectorGlance)} PTS`],
  ["WIDE", `-${SCORE.penalty.collision} AND A SHIELD`],
];
const TOP_MULTIPLIER = Math.max(...SCORE.streakMultipliers);

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
  onAim,
  onLockVector,
  onToggleBoost,
  onNova,
  onEnterStation,
  onConfirm,
  onLanes,
  muted,
  onToggleSound,
}: Props) {
  const question =
    state && state.encounter >= 0 ? round.questions[state.encounter] : undefined;
  const answering = state?.phase === "approach";
  const collecting = state?.phase === "collecting";
  // WHERE ON EARTH: the question is up while the ship flies in, but nothing
  // is tappable until it arrives and no clock runs.
  const station = state?.phase === "station";
  const open = answering || collecting || station;
  const total = round.questions.length;
  const outcome = state?.outcome ?? null;
  const isCluster = question?.type === "cluster";
  const isEarth = question?.type === "earth";
  const isVector = question?.type === "vector";
  const waypoint = state?.phase === "waypoint" ? state.waypoint : null;

  const awaitingTap = state?.awaitingTap ?? false;
  useKeyboard({
    state,
    question,
    onAnswer,
    onPick,
    onBurn,
    onAim,
    onLockVector,
    onToggleBoost,
    onNova,
    onEnterStation,
    onConfirm,
  });
  // The overlay's CSS animations end invisible, so they can simply live as
  // long as the MAXIMUM THRUST outcome is current; no timer needed.
  const maxThrust = isMaxThrust(outcome);

  const thrust = state?.thrust ?? 1;
  const seconds = Math.max(Math.ceil(thrust * (state?.clockSeconds ?? ENCOUNTER.thrustSeconds)), 0);
  const thrustLow = thrust < 0.35;
  const shields = state?.shields ?? 0;
  const maxShields = state?.maxShields ?? 0;

  return (
    <div className={styles.hud}>
      {maxThrust ? <MaxThrust /> : null}
      {state?.countdown !== null && state?.countdown !== undefined ? (
        <Countdown step={state.countdown} />
      ) : null}
      {state?.pulse ? <PulseOverlay key={state.pulse.id} pulse={state.pulse} /> : null}

      {/* Tap anywhere to move past a verdict. It covers the whole screen, which
          is the one time anything is allowed to: the run is parked, the ship is
          coasting, and there is nothing under it to reach. It sits behind the
          band so the sound toggle still takes its own taps. */}
      {awaitingTap ? (
        <button
          type="button"
          className={styles.tapCatcher}
          onClick={onConfirm}
          data-testid="continue"
          aria-label="Continue"
        />
      ) : null}

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
            {/* The score leads. Distance is still tracked and still the story
                the share card tells, but a speedometer reading is a poor
                anchor: "1,880 of 2,400" tells you how the run went. */}
            <span className={`${styles.score} arcade`} data-testid="score">
              {formatScore(state?.score ?? 0)}
              <span className={styles.outOf}>/ {formatScore(state?.maxScore ?? 0)}</span>
            </span>
            <span className={`${styles.distance} arcade`} data-testid="distance">
              {formatDistance(state?.distance ?? 0)}
              <span className={styles.unit}>KM</span>
            </span>
          </div>

          {/* The one control outside the question panel, and small enough to
              leave the readouts either side of it room on a narrow phone. */}
          <button
            type="button"
            className={`${styles.sound} ${muted ? styles.soundOff : ""} arcade`}
            onClick={onToggleSound}
            aria-pressed={muted}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            data-testid="sound"
            data-muted={String(muted)}
          >
            {muted ? "SOUND OFF" : "SOUND ON"}
          </button>

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
            className={`${styles.panel} ${isEarth ? styles.panelEarth : ""} ${
              isCluster ? styles.panelCluster : ""
            } ${isVector ? styles.panelVector : ""}`}
            data-testid="question"
          >
            <div className={styles.panelHead}>
              {isEarth ? (
                <span className={`${styles.earthTag} arcade`}>WHERE ON EARTH</span>
              ) : isCluster ? (
                <span className={`${styles.clusterTag} arcade`}>CLUSTER · 3 OF 6</span>
              ) : isVector ? (
                <span className={`${styles.vectorTag} arcade`}>VECTOR · FIRING SOLUTION</span>
              ) : (
                <span className={`${styles.clusterTag} arcade`}>PICK A LANE</span>
              )}
              {answering ? (
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
            {answering ? (
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

            {state?.nova && !isEarth ? (
              <p className={styles.novaLine} data-testid="nova-result">
                <span className={`${styles.novaLabel} arcade`}>
                  {isVector ? "NOVA: WINDOW NARROWED" : NOVA_LABEL[state.nova.kind]}
                </span>
                {state.nova.clue ? <span> {state.nova.clue}</span> : null}
              </p>
            ) : null}

            {isCluster ? <Reactor cluster={state?.cluster ?? null} /> : null}

            {question.type === "earth" ? (
              <StationApproach
                ready={state?.stationReady ?? false}
                onEnter={onEnterStation}
              />
            ) : question.type === "vector" ? (
              <VectorPanel
                question={question}
                vector={state?.vector ?? null}
                answering={answering}
                onAim={onAim}
                onLock={onLockVector}
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

            {/* No tools on the approach to the station: there is nothing to
                scan and nothing to boost through. */}
            {!isEarth ? (
            <div className={styles.tools}>
              <button
                type="button"
                className={`${styles.tool} ${styles.nova} arcade`}
                disabled={!answering || !state || state.novaLeft <= 0 || !!state.nova}
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
              ) : isVector ? (
                <button
                  type="button"
                  className={`${styles.tool} ${styles.lock} arcade`}
                  disabled={!answering}
                  onClick={onLockVector}
                  data-testid="lock"
                >
                  LOCK &amp; FIRE
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.tool} ${styles.boost} ${
                    state?.boostArmed ? styles.boostOn : ""
                  } arcade`}
                  disabled={!answering}
                  onClick={onToggleBoost}
                  aria-pressed={state?.boostArmed ?? false}
                  data-testid="boost"
                >
                  {state?.boostArmed ? "BOOST ARMED" : "BOOST"}
                </button>
              )}
            </div>
            ) : null}
          </section>
        ) : null}

        {outcome ? (
          <OutcomeToast
            outcome={outcome}
            fact={question?.fact}
            awaitingTap={awaitingTap}
            onConfirm={onConfirm}
          />
        ) : null}

        {waypoint ? (
          <WaypointCard waypoint={waypoint} awaitingTap={awaitingTap} onConfirm={onConfirm} />
        ) : null}

        {state?.phase === "intro" ? (
          <p className={`${styles.hint} arcade`}>Pick fast. The clock is your thrust.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 3, 2, 1, GO over the engines lighting.
 *
 * Keyed on the number so each one replays the animation from the top, which
 * is what makes it read as a countdown rather than a label changing. Drawn
 * above the ship and below the band, takes no pointer events, and is gone by
 * the time the first prompt lands.
 */
function Countdown({ step }: { step: number }) {
  // The number is on screen for exactly as long as it is the current number:
  // the animation is handed the step's own length from `Tuning.ts` rather
  // than guessing at one in CSS, so retuning the countdown cannot leave a
  // hole between two numbers or clip one short.
  const hold = (step > 0 ? COUNTDOWN.stepSeconds : COUNTDOWN.goSeconds) * 1000;
  return (
    <div
      className={styles.countdown}
      data-testid="countdown"
      data-step={step}
      aria-live="assertive"
      style={{ "--count-hold": `${Math.round(hold)}ms` } as CSSProperties}
    >
      <span key={step} className={`${styles.countdownNumber} arcade`}>
        {step > 0 ? step : "GO"}
      </span>
    </div>
  );
}

/**
 * MAXIMUM THRUST: every lane of a cluster found, and the whole reactor dumped
 * into the engines at once.
 *
 * The only outcome with a full-screen treatment of its own. Radial speed
 * lines, and a hazard placard that reads as a warning light coming on rather
 * than a score: the ship is doing something it was not built to do, which is
 * the point. The shake lives on the shell so the scene and the HUD move
 * together; see GameCanvas.
 */
function MaxThrust() {
  return (
    <>
      <div className={styles.warp} data-testid="warp" aria-hidden="true" />
      <div className={styles.maxThrust} data-testid="max-thrust" aria-live="assertive">
        <div className={styles.hazard}>
          <span className={styles.hazardSign} aria-hidden="true">
            &#9888;
          </span>
          <span className={`${styles.hazardText} arcade`}>MAXIMUM THRUST</span>
          <span className={styles.hazardSign} aria-hidden="true">
            &#9888;
          </span>
        </div>
        <span className={`${styles.hazardSub} arcade`}>REACTOR DUMPED &middot; HOLD ON</span>
      </div>
    </>
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

/**
 * The vector panel: aim on a slider, the ship follows. The value is shown
 * live in answer units; the track shows the window a NOVA scan left open.
 * LOCK & FIRE lives in the tools row below, where BANK and BOOST sit.
 */
function VectorPanel({
  question,
  vector,
  answering,
  onAim,
  onLock,
}: {
  question: VectorQuestion;
  vector: VectorState | null;
  answering: boolean;
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
        <span className={styles.aimEnds}>
          {formatValue(question.min, question.unit)} to {formatValue(question.max, question.unit)}
        </span>
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
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onLock();
              }
            }}
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
    </div>
  );
}

/**
 * TAP TO CONTINUE. Lives inside the card it belongs to, in the top band, so
 * the ship's half of the screen stays empty. Anywhere is a tap: the card it
 * sits in takes one, and behind everything a catcher covers the rest of the
 * screen, drawn nowhere.
 */
function TapPrompt({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <span className={`${styles.tapPrompt} arcade`} data-testid="tap-prompt">
      TAP TO CONTINUE
    </span>
  );
}

/** Between stages: what you just flew, the rating, and what is coming. */
function WaypointCard({
  waypoint,
  awaitingTap,
  onConfirm,
}: {
  waypoint: WaypointState;
  awaitingTap: boolean;
  onConfirm: () => void;
}) {
  const rated = waypoint.t >= WAYPOINT.ratingAt;
  const entering = waypoint.t >= WAYPOINT.enteringAt;
  return (
    <section
      className={`${styles.panel} ${styles.waypoint} ${entering ? styles.waypointEntering : ""} ${
        awaitingTap ? styles.tapReady : ""
      }`}
      data-testid="waypoint"
      data-rating={waypoint.rating}
      onClick={awaitingTap ? onConfirm : undefined}
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
                <li>{waypoint.shields} SHIELD{waypoint.shields === 1 ? "" : "S"} UP</li>
                <li>PEAK {formatVelocity(waypoint.peakVelocity)} KM/H</li>
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <>
          <span className={`${styles.wpEntering} arcade`}>
            ENTERING PHASE {waypoint.nextPhase}
          </span>
          <span className={`${styles.wpNext} arcade`}>{waypoint.next.toUpperCase()}</span>
          {waypoint.nextType === "earth" ? (
            <>
              <span className={styles.wpHint}>
                The scout is down, but its fleet has already landed on Earth. Dock at
                Wikiplanet Station ahead and read its satellite feed: find where they came
                down, then call the fleet in. No clock on the approach.
              </span>
              <span className={`${styles.wpStreak} arcade`} data-testid="waypoint-standby">
                SATELLITE FEED · STANDING BY
              </span>
            </>
          ) : waypoint.nextType === "vector" ? (
            <>
              <span className={styles.wpHint}>
                An alien scout is shadowing you. Every question now wants a number. Slide
                the scout onto your answer and fire. Closest wins.
              </span>
              <dl className={styles.wpScore} data-testid="waypoint-scoring">
                {VECTOR_BANDS.map(([band, worth]) => (
                  <div key={band} className={styles.wpScoreRow}>
                    <dt className="arcade">{band}</dt>
                    <dd className="arcade">{worth}</dd>
                  </div>
                ))}
              </dl>
              <span className={`${styles.wpStreak} arcade`}>
                STREAK MULTIPLIES UP TO x{TOP_MULTIPLIER}
              </span>
            </>
          ) : (
            <span className={styles.wpHint}>Same rules, faster sky. Keep the streak alive.</span>
          )}
        </>
      )}
      <TapPrompt shown={awaitingTap} />
    </section>
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
    <>
      {/* Taking a hit is the one pulse that owns the whole screen: the scout
          has just put a bolt through the hull, and a small caption in the
          middle of the frame would not say so. Drawn nowhere near a touch:
          pointer-events none, gone in a second. */}
      {pulse.kind === "damage" ? (
        <div className={styles.damage} data-testid="damage" aria-hidden="true" />
      ) : null}
      <div
        className={`${styles.pulse} ${styles[`pulse_${pulse.kind}`]}`}
        data-testid="pulse"
        data-kind={pulse.kind}
        aria-live="polite"
      >
        {pulse.kind === "shield" || pulse.kind === "damage" ? (
          <span className={styles.pulseRing} aria-hidden="true" />
        ) : null}
        <span className={`${styles.pulseLabel} arcade`}>{pulse.label}</span>
        <span className={`${styles.pulseDetail} arcade`}>{pulse.detail}</span>
      </div>
    </>
  );
}

/**
 * How wide a vector miss was, in tolerances. The number the damage is scaled
 * by, so the player can see why a near miss cost less than a wild one.
 */
function formatError(error: number): string {
  return error >= 10 ? String(Math.round(error)) : (Math.round(error * 10) / 10).toFixed(1);
}

function OutcomeToast({
  outcome,
  fact,
  awaitingTap,
  onConfirm,
}: {
  outcome: Outcome;
  fact: string | undefined;
  awaitingTap: boolean;
  onConfirm: () => void;
}) {
  const delta = outcome.velocityAfter - outcome.velocityBefore;
  const points = outcome.points ?? 0;
  const full = isMaxThrust(outcome);
  const vector = outcome.error !== undefined;
  const label = full
    ? "MAXIMUM THRUST"
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
      className={`${styles.toast} ${styles[`toast_${outcome.kind}`]} ${
        full ? styles.toast_full : ""
      } ${awaitingTap ? styles.tapReady : ""}`}
      data-testid="toast"
      data-outcome={outcome.kind}
      data-charge={outcome.charge}
      onClick={awaitingTap ? onConfirm : undefined}
    >
      <div className={styles.toastHead}>
        <span className={`${styles.toastKind} arcade`}>{label}</span>
        <span className={styles.toastFigures}>
          <span
            className={`${styles.toastPoints} ${points < 0 ? styles.toastPointsDown : ""} arcade`}
            data-testid="toast-points"
          >
            {formatPoints(points)}
            {outcome.base && (outcome.multiplier ?? 1) > 1 ? (
              <span className={styles.toastMultiplier}>
                {outcome.base} x{outcome.multiplier}
              </span>
            ) : null}
          </span>
          <span className={`${styles.toastDelta} arcade`}>{formatDelta(delta)} KM/H</span>
        </span>
      </div>
      {vector ? (
        <span className={styles.toastAnswer}>
          Truth: <strong>{outcome.answerText}</strong>
          {!outcome.timedOut ? <> &middot; You aimed {outcome.guessText}</> : null}
          {!outcome.correct && !outcome.timedOut && outcome.error !== undefined ? (
            <>
              {" "}
              &middot; <strong data-testid="wide-by">wide by {formatError(outcome.error)}x</strong>
            </>
          ) : null}
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
      <TapPrompt shown={awaitingTap} />
    </section>
  );
}

/**
 * WHERE ON EARTH, on the flight: the station is coming alongside and the
 * one thing in the band is the door. Always rendered, so the band does not
 * jump when the engine reports arrival; the button simply arms.
 */
function StationApproach({ ready, onEnter }: { ready: boolean; onEnter: () => void }) {
  return (
    <div className={styles.station}>
      <span className={`${styles.stationStatus} arcade`} data-testid="station-status">
        {ready ? "WIKIPLANET STATION · ALONGSIDE" : "WIKIPLANET STATION · ON APPROACH"}
      </span>
      <button
        type="button"
        className={`${styles.enterStation} ${ready ? styles.enterStationReady : ""} arcade`}
        disabled={!ready}
        onClick={onEnter}
        data-testid="enter-station"
        data-ready={String(ready)}
      >
        {ready ? "ENTER SPACE STATION" : "CLOSING..."}
      </button>
    </div>
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
  onAim,
  onLockVector,
  onToggleBoost,
  onNova,
  onEnterStation,
  onConfirm,
}: Pick<
  Props,
  | "state"
  | "onAnswer"
  | "onPick"
  | "onBurn"
  | "onAim"
  | "onLockVector"
  | "onToggleBoost"
  | "onNova"
  | "onEnterStation"
  | "onConfirm"
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
    onEnterStation,
    onConfirm,
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
      onEnterStation,
      onConfirm,
    };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.tagName === "TEXTAREA") return;
      if (target && target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range") return;
      const current = latest.current;
      // Parked on a verdict: the only key that does anything is the one that
      // moves past it. Checked before the phase gate, which only opens on an
      // approach.
      if (current.state?.awaitingTap) {
        if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
          current.onConfirm();
        }
        return;
      }
      // Alongside the station: Enter is the door. Desktop convenience only.
      if (current.state?.phase === "station") {
        if (current.state.stationReady && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          current.onEnterStation();
        }
        return;
      }
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
