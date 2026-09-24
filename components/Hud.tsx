"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";
import type {
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
import { CLUSTER, COUNTDOWN, ENCOUNTER, NOVA, SCORE, VECTOR, WAYPOINT } from "@/lib/game/Tuning";
import { FULL_CHARGE, isMaxThrust } from "@/lib/game/Flight";
import { formatOnRuler, fromSlider } from "@/lib/game/nova";
import { multiplierFor, vectorVerdict } from "@/lib/game/Score";
import { phaseGuide } from "@/lib/game/phases";
import { ScoringDisclosure } from "./ScoringTable";
import { formatPoints, formatScore, formatVelocity } from "@/lib/game/format";
import styles from "./Hud.module.css";

interface Props {
  state: GameState | null;
  round: Round;
  onAnswer: (option: number) => void;
  onPick: (lane: number) => void;
  /** Cluster: READY on the read screen. Opens the lanes and starts the pick clock. */
  onReady: () => void;
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

/**
 * The verdict, in the plainest word for it. The arcade flavour (plasma, the
 * reactor, the hull) rides on the pulse below the band and on the toast's
 * second line, never on the headline: a first-time player reads CORRECT or
 * WRONG before anything else.
 */
const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  thread: "CORRECT",
  slingshot: "CORRECT · BOOSTED",
  collision: "WRONG",
  wreck: "WRONG · NO SHIELDS",
  timeout: "TOO SLOW",
  burn: "BANKED",
  dock: "ARRIVED",
  graze: "NEAR MISS",
};

/** What the hint did, after the HINT: tag. A clue prints itself. */
const NOVA_DETAIL = {
  eliminate: "One wrong answer removed.",
  clue: "",
  narrow: "Two answers left lit. One is correct.",
  vector: "The answer is inside the lit part of the slider.",
} as const;

/**
 * What BANK pays right now: the cluster share for this many found, times the
 * streak carried in. The dial used to quote the km/h a burn would add, which
 * is a speedometer figure next to a game played for points.
 */
function bankPoints(charge: number, streak: number): number {
  const share = SCORE.clusterShare[Math.min(charge, SCORE.clusterShare.length) - 1] ?? 0;
  return Math.round(SCORE.perEncounter * share) * multiplierFor(streak);
}

/** Slider step for a nudge button or an arrow key: one notch of the ruler. */
const NUDGE = 1 / VECTOR.notches;

const RATING_TEXT: Record<Rating, string> = {
  S: "FLAWLESS",
  A: "SHARP",
  B: "STEADY",
  C: "ROUGH",
};

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
  onReady,
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
  // Cluster: the question on its own, no lanes yet. READY (or the read clock)
  // opens them.
  const reading = state?.phase === "reading";
  // WHERE ON EARTH: the question is up while the ship flies in, but nothing
  // is tappable until it arrives and no clock runs.
  const station = state?.phase === "station";
  const open = answering || collecting || station || reading;
  /** Lanes are up: the cockpit corners belong on screen. */
  const flying = answering || collecting;
  const total = round.questions.length;
  // Every FIND THE 3 answer in the round, for the waypoint's "4 OF 6 FOUND".
  const foundMax = round.questions.filter((q) => q.type === "cluster").length * FULL_CHARGE;
  const outcome = state?.outcome ?? null;
  const isCluster = question?.type === "cluster";
  /*
   * The dial is the only thing that banks a charge, and a first-time player
   * does not know it wants pressing: testers kept picking lanes on the very
   * first Cluster until a boulder took the lot. So the run's FIRST Cluster,
   * and only that one, puts a flashing callout and an arrow over the dial the
   * moment there is something to bank. After that the player has been told.
   */
  const bankNudge =
    isCluster &&
    state?.encounter === 0 &&
    state?.phase === "approach" &&
    (state?.cluster?.charge ?? 0) > 0;
  /*
   * The same nudge for BOOST, on the run's first PICK ONE question only.
   * Testers could not tell whether BOOST was pressed before the answer or
   * after it, so until it is armed a callout over the button says: first.
   */
  const boostNudge =
    question?.type === "mcq" &&
    state?.encounter === round.questions.findIndex((q) => q.type === "mcq") &&
    answering &&
    !state?.boostArmed;
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
    onReady,
  });
  // The overlay's CSS animations end invisible, so they can simply live as
  // long as the MAXIMUM THRUST outcome is current; no timer needed.
  const maxThrust = isMaxThrust(outcome);

  // On the read screen the bar and the figure are the read clock; everywhere
  // else they are thrust, which is the pick clock.
  const readSeconds = state?.readSeconds ?? 0;
  const thrust = reading ? readSeconds / CLUSTER.readSeconds : (state?.thrust ?? 1);
  const seconds = reading
    ? Math.max(Math.ceil(readSeconds), 0)
    : Math.max(Math.ceil(thrust * (state?.clockSeconds ?? ENCOUNTER.thrustSeconds)), 0);
  const thrustLow = thrust < 0.35;
  const clockShown = answering || reading;
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
                ? `Question ${state.encounter + 1} of ${total}`
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
            {/* What the last answer was worth is quoted once, in the verdict
                toast, where the answer it belongs to is. It used to be here
                too, under the score, and the same figure in two places read
                as two different figures. */}
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
                outcome && !outcome.correct && outcome.kind !== "graze" ? styles.velocityHit : ""
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
              <span
                className={`${
                  isEarth ? styles.earthTag : isVector ? styles.vectorTag : styles.clusterTag
                } arcade`}
              >
                {phaseGuide(question.type).title}
              </span>
              {clockShown ? (
                <span
                  className={`${styles.clock} ${thrustLow ? styles.clockLow : ""} arcade`}
                  data-testid="clock"
                >
                  {seconds}s
                </span>
              ) : null}
            </div>

            <p className={styles.prompt}>{question.prompt}</p>

            {/* The clock, drawn as thrust draining rather than as a dial. On
                the read screen it is the read clock draining instead. */}
            {clockShown ? (
              <div
                className={styles.thrustTrack}
                aria-label={reading ? `${seconds} seconds to read` : `Thrust ${Math.round(thrust * 100)}%`}
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
                <span className={`${styles.novaLabel} arcade`}>HINT:</span>
                <span>
                  {" "}
                  {state.nova.clue ?? NOVA_DETAIL[isVector ? "vector" : state.nova.kind]}
                  {" "}
                  <span className={`${styles.novaBonus} arcade`}>+{NOVA.bonusSeconds} SEC</span>
                </span>
              </p>
            ) : null}

            {reading ? (
              <ClusterRead
                shields={state?.cluster?.shields ?? CLUSTER.shields}
                onReady={onReady}
              />
            ) : question.type === "earth" ? (
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
                struck={state?.cluster?.struck ?? []}
                eliminated={state?.nova?.eliminated ?? []}
                highlighted={state?.nova?.highlighted ?? []}
                disabled={!answering || collecting}
                onPick={question.type === "cluster" ? onPick : onAnswer}
                onLanes={onLanes}
              />
            )}

            {/* No tools on the approach to the station: there is nothing to
                scan and nothing to boost through. */}
            {!isEarth && !reading ? (
            <div className={styles.tools}>
              <button
                type="button"
                className={`${styles.tool} ${styles.nova} arcade`}
                disabled={!answering || !state || state.novaLeft <= 0 || !!state.nova}
                onClick={onNova}
                data-testid="nova"
              >
                HINT <span className={styles.pips}>{"◆".repeat(state?.novaLeft ?? 0)}</span>
              </button>
              {isCluster ? null : isVector ? (
                <button
                  type="button"
                  className={`${styles.tool} ${styles.lock} arcade`}
                  disabled={!answering || !state?.vector?.placed}
                  onClick={onLockVector}
                  data-testid="lock"
                >
                  FIRE
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

            {boostNudge ? (
              <div className={styles.boostNudge} data-testid="boost-nudge" aria-hidden="true">
                <span className={styles.boostNudgeArrow} />
                <span className={styles.bankNudgeCall}>
                  <span className={`${styles.bankNudgeLead} arcade`}>TAP BOOST FIRST</span>
                  <span className={`${styles.bankNudgeSub} arcade`}>IF YOU ARE SURE</span>
                </span>
              </div>
            ) : null}
          </section>
        ) : null}

        {outcome ? (
          <OutcomeToast
            outcome={outcome}
            vector={question?.type === "vector" ? question : undefined}
            fact={question?.type === "vector" ? (question.route ?? question.fact) : question?.fact}
            awaitingTap={awaitingTap}
            onConfirm={onConfirm}
          />
        ) : null}

        {waypoint ? (
          <WaypointCard
            waypoint={waypoint}
            round={round}
            foundMax={foundMax}
            awaitingTap={awaitingTap}
            onConfirm={onConfirm}
          />
        ) : null}

        {state?.phase === "intro" ? (
          <p className={`${styles.hint} arcade`}>Answer before the clock runs out.</p>
        ) : null}
      </div>

      {/*
        The two cockpit corners. A Cluster is the one encounter that hands the
        player something to hold and then spend, and the band has no room left
        to dramatise it, so the gauge takes the bottom left of the screen and
        the button that fires it takes the bottom right, a thumb's reach apart
        either side of the ship. They are the only things the run draws below
        the band; both hug the safe area, and the gauge takes no taps at all.
      */}
      {isCluster && (flying || (state?.burnDrain ?? 0) > 0) ? (
        <BoostGauge
          charge={flying ? (state?.cluster?.charge ?? 0) : (state?.burnCharge ?? 0)}
          drain={flying ? 1 : (state?.burnDrain ?? 0)}
          full={state?.cluster?.full ?? false}
        />
      ) : null}

      {bankNudge ? (
        <div className={styles.bankNudge} data-testid="bank-nudge" aria-hidden="true">
          <span className={styles.bankNudgeCall}>
            <span className={`${styles.bankNudgeLead} arcade`}>
              {state?.cluster?.full ? "TAP TO FIRE" : "TAP TO BANK"}
            </span>
            {state?.cluster?.full ? null : (
              <span className={`${styles.bankNudgeSub} arcade`}>OR KEEP GOING</span>
            )}
          </span>
          <span className={styles.bankNudgeArrow} />
        </div>
      ) : null}

      {isCluster && flying ? (
        <button
          type="button"
          className={`${styles.burnDial} ${
            (state?.cluster?.charge ?? 0) >= 2 || bankNudge ? styles.burnHot : ""
          } ${state?.cluster?.full ? styles.burnFull : ""} arcade`}
          disabled={!answering || (state?.cluster?.charge ?? 0) <= 0}
          onClick={onBurn}
          data-testid="burn"
        >
          {/* Bezel, then the cap that sits proud of it and travels on a
              press: an arcade button, not a circle with a label. */}
          <span className={styles.burnDialCap}>
            <span className={styles.burnDialLabel}>
              {state?.cluster?.full ? "FIRE" : "BANK"}
            </span>
            <span className={styles.burnDialValue}>
              {(state?.cluster?.charge ?? 0) > 0
                ? `+${bankPoints(state?.cluster?.charge ?? 0, state?.streak ?? 0)} PTS`
                : "BOOST"}
            </span>
          </span>
        </button>
      ) : null}
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
const NO_LANES: number[] = [];

function LaneRow({
  options,
  picked,
  struck = NO_LANES,
  eliminated,
  highlighted,
  disabled,
  onPick,
  onLanes,
}: {
  options: string[];
  picked: number[];
  /** Cluster: wrong lanes the cluster's shield already took. */
  struck?: number[];
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
    fitLabels(row);
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
    // A late web font changes every word's width; fit again once it lands.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, options]);

  return (
    <div className={styles.lanes} ref={rowRef}>
      {options.map((option, index) => {
        const got = picked.includes(index);
        const hit = struck.includes(index);
        const out = eliminated.includes(index);
        const lit = highlighted.includes(index);
        return (
          <button
            key={index}
            type="button"
            className={`${styles.lane} ${got ? styles.laneGot : ""} ${
              hit ? styles.laneStruck : ""
            } ${out ? styles.laneOut : ""} ${lit ? styles.laneLit : ""}`}
            disabled={disabled || got || hit || out}
            onClick={() => onPick(index)}
            data-testid={`option-${index}`}
            data-got={got}
            data-struck={hit}
          >
            <span className={`${styles.laneKey} arcade`}>{index + 1}</span>
            <span className={styles.laneText} data-lane-text>
              {option}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Smallest a lane label may shrink to before a word is allowed to break. */
const LANE_TEXT_MIN_PX = 7;

/**
 * Shrink each lane label until its longest word fits the square. A word must
 * never start on one line and finish on the next ("Kangchenju / nga"), and a
 * sixth of a phone is narrow, so a long word takes a smaller size instead.
 * Only if even the floor cannot hold it is the word allowed to break.
 */
function fitLabels(row: HTMLElement): void {
  row.querySelectorAll<HTMLElement>("[data-lane-text]").forEach((label) => {
    label.style.fontSize = "";
    label.style.letterSpacing = "";
    label.style.overflowWrap = "";
    const width = label.clientWidth;
    if (!width || label.scrollWidth <= width) return;
    // Squeezed labels also close up a touch, which buys a size or two back.
    label.style.letterSpacing = "-0.03em";
    let size = parseFloat(getComputedStyle(label).fontSize);
    while (size > LANE_TEXT_MIN_PX && label.scrollWidth > width) {
      size -= 0.5;
      label.style.fontSize = `${size}px`;
    }
    if (label.scrollWidth > width) label.style.overflowWrap = "anywhere";
  });
}

/**
 * The vector panel: a ruler of `VECTOR.notches` steps, the ship following the
 * aim. It opens empty: no thumb and no figure until the player touches it,
 * because a guess sitting on the slider before anyone chose it is a free
 * guess, and FIRE (in the tools row, where BANK and BOOST sit) waits for one.
 * The value is shown live in answer units; the track shows the window a hint
 * left lit.
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
  const notches = VECTOR.notches;
  const placed = vector?.placed ?? false;
  const t = vector?.t ?? 0.5;
  const [lo, hi] = vector?.window ?? [0, 1];
  const value = vector?.value ?? fromSlider(question, t);
  const nudge = (direction: -1 | 1) => onAim(t + direction * NUDGE);
  const aimText = formatOnRuler(question, value);

  return (
    <div className={styles.vector}>
      <div className={styles.aimReadout}>
        <span className={`${styles.aimLabel} arcade`}>AIM</span>
        <span
          className={`${placed ? styles.aimValue : styles.aimPrompt} arcade`}
          data-testid="aim-value"
        >
          {placed ? aimText : "TAP TO GUESS"}
        </span>
        <span className={styles.aimEnds}>
          {formatOnRuler(question, question.min)} to {formatOnRuler(question, question.max)}
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
            className={`${styles.slider} ${placed ? "" : styles.sliderEmpty}`}
            type="range"
            min={0}
            max={notches}
            step={1}
            value={Math.round(t * notches)}
            disabled={!answering}
            onChange={(event) => onAim(Number(event.target.value) / notches)}
            // A tap that lands where the hidden thumb already sits changes
            // nothing, so no change event fires; the click still places it.
            onClick={(event) => {
              if (!placed) onAim(Number(event.currentTarget.value) / notches);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onLock();
              }
            }}
            aria-label={placed ? `Aim, ${aimText}` : "Aim, no guess yet"}
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
 * The ruler under a number verdict: the whole slider, where the guess landed
 * and where the answer was. The gap between the two marks IS the score, so
 * this is the explanation of it, drawn rather than written. YOU hangs under
 * the line and ANSWER over it, so the two labels never sit on each other.
 */
function Ruler({ guess, answer, wild }: { guess: number; answer: number; wild: boolean }) {
  const at = (notch: number) => (notch / VECTOR.notches) * 100;
  const g = at(guess);
  const a = at(answer);
  // Slide each label by its own position, so one at either end stays inside
  // the toast rather than hanging off its edge.
  const label = (position: number): CSSProperties => ({ transform: `translateX(-${position}%)` });
  return (
    <div
      className={styles.ruler}
      data-testid="ruler"
      data-guess={guess}
      data-answer={answer}
      aria-hidden
    >
      <span
        className={`${styles.rulerGap} ${wild ? styles.rulerGapWild : ""}`}
        style={{ left: `${Math.min(g, a)}%`, width: `${Math.abs(g - a)}%` }}
      />
      <span className={`${styles.rulerMark} ${styles.rulerAnswer}`} style={{ left: `${a}%` }}>
        <span className={`${styles.rulerLabel} ${styles.rulerLabelAbove} arcade`} style={label(a)}>
          ANSWER
        </span>
      </span>
      <span className={`${styles.rulerMark} ${styles.rulerGuess}`} style={{ left: `${g}%` }}>
        <span className={`${styles.rulerLabel} ${styles.rulerLabelBelow} arcade`} style={label(g)}>
          YOU
        </span>
      </span>
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
  round,
  foundMax,
  awaitingTap,
  onConfirm,
}: {
  waypoint: WaypointState;
  /** For the next phase's question count: "2 questions." */
  round: Round;
  /** Every FIND THE 3 answer in the round, so "4 OF 6 FOUND" has its 6. */
  foundMax: number;
  awaitingTap: boolean;
  onConfirm: () => void;
}) {
  const rated = waypoint.t >= WAYPOINT.ratingAt;
  const entering = waypoint.t >= WAYPOINT.enteringAt;
  // The phase the way you would text it to your mum; everything finer is
  // behind MORE DETAIL. The rulebook on the title screen reads the same words.
  const guide = phaseGuide(waypoint.nextType, round);
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
                <li>
                  {waypoint.plasma} OF {foundMax} FOUND
                </li>
                <li>{waypoint.shields} SHIELD{waypoint.shields === 1 ? "" : "S"} UP</li>
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
          <span className={`${styles.wpGame} arcade`}>{guide.title}</span>
          <ul className={styles.wpRules} data-testid="waypoint-rules">
            {guide.rules.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {waypoint.nextType === "earth" ? (
            <span className={`${styles.wpStreak} arcade`} data-testid="waypoint-standby">
              SATELLITE VIEW · LOADING
            </span>
          ) : null}
          <ScoringDisclosure rows={guide.scoring} details={guide.details} />
        </>
      )}
      <TapPrompt shown={awaitingTap} />
    </section>
  );
}

/**
 * The boost gauge: the reactor drawn as a speedometer, in the bottom left
 * corner of the screen.
 *
 * The needle climbs a notch per plasma collected and sweeps back to the peg
 * as the boost is fired, so the charge reads as something held and then spent.
 * `drain` is the sweep home, 1 while the charge is aboard and 0 once it is
 * all in the engines; the run owns it, so the needle keeps falling after the
 * panel has given way to the verdict. It never takes a tap: firing the boost
 * is the dial in the opposite corner.
 *
 * Geometry is derived from `CLUSTER.gauge`, never hardcoded here.
 */
const GAUGE = (() => {
  const sweep = CLUSTER.gauge.sweepDegrees;
  const cx = 50;
  const cy = 38;
  const r = 32;
  const start = -90 - sweep / 2;
  const at = (fraction: number) => {
    const rad = ((start + sweep * fraction) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const a = at(0);
  const b = at(1);
  return {
    cx,
    cy,
    r,
    sweep,
    start,
    at,
    path: `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
  };
})();

function BoostGauge({
  charge,
  drain,
  full,
}: {
  charge: number;
  drain: number;
  full: boolean;
}) {
  const value = Math.max(0, Math.min(1, (charge / FULL_CHARGE) * drain));
  const draining = drain < 1;
  // While the boost is being spent the needle is driven by the run at about
  // 12Hz, so the easing that makes a collected notch land with weight would
  // fight the sweep. It goes linear and short for the drain instead.
  const ease = draining
    ? "transform 90ms linear, stroke-dashoffset 90ms linear"
    : `transform ${CLUSTER.gauge.settleSeconds}s cubic-bezier(0.2, 1.4, 0.4, 1), stroke-dashoffset ${CLUSTER.gauge.settleSeconds}s ease-out`;

  return (
    <div
      className={`${styles.gauge} ${full ? styles.gaugeFull : ""} ${
        draining ? styles.gaugeDraining : ""
      }`}
      data-testid="reactor"
      data-charge={charge}
      data-drain={drain.toFixed(2)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={FULL_CHARGE}
      aria-valuenow={charge}
      aria-label={`Boost gauge, ${charge} of ${FULL_CHARGE} found`}
    >
      <svg viewBox="0 0 100 60" className={styles.gaugeDial} aria-hidden="true">
        <path d={GAUGE.path} className={styles.gaugeTrack} pathLength={100} />
        <path
          d={GAUGE.path}
          className={styles.gaugeFill}
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - value * 100}
          style={{ transition: ease }}
        />
        {Array.from({ length: FULL_CHARGE + 1 }, (_, i) => {
          const outer = GAUGE.at(i / FULL_CHARGE);
          const angle = GAUGE.start + GAUGE.sweep * (i / FULL_CHARGE);
          const rad = (angle * Math.PI) / 180;
          const inner = {
            x: GAUGE.cx + (GAUGE.r - 7) * Math.cos(rad),
            y: GAUGE.cy + (GAUGE.r - 7) * Math.sin(rad),
          };
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className={`${styles.gaugeTick} ${i > 0 && i <= charge ? styles.gaugeTickLit : ""}`}
            />
          );
        })}
        <g
          style={{
            transform: `rotate(${GAUGE.start + 90 + GAUGE.sweep * value}deg)`,
            transformOrigin: `${GAUGE.cx}px ${GAUGE.cy}px`,
            transition: ease,
          }}
        >
          <line
            x1={GAUGE.cx}
            y1={GAUGE.cy}
            x2={GAUGE.cx}
            y2={GAUGE.cy - GAUGE.r + 6}
            className={styles.gaugeNeedle}
          />
        </g>
        <circle cx={GAUGE.cx} cy={GAUGE.cy} r={3.6} className={styles.gaugeHub} />
      </svg>
      <span className={`${styles.gaugeValue} arcade`} data-testid="gauge-value">
        {/* Draining, the readout counts down with the needle; the charge that
            went in is still what `data-charge` reports. */}
        {draining ? Math.round(value * FULL_CHARGE) : charge}
        <span className={styles.gaugeOutOf}>/{FULL_CHARGE}</span>
      </span>
      <span className={`${styles.gaugeLabel} arcade`}>BOOST</span>
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

function OutcomeToast({
  outcome,
  vector,
  fact,
  awaitingTap,
  onConfirm,
}: {
  outcome: Outcome;
  /** The question, when the verdict is a number: the ruler needs its scale. */
  vector: VectorQuestion | undefined;
  fact: string | undefined;
  awaitingTap: boolean;
  onConfirm: () => void;
}) {
  const points = outcome.points ?? 0;
  const full = isMaxThrust(outcome);
  const notches = outcome.notches;
  const aimed = vector !== undefined && notches !== undefined;
  const label = full
    ? `ALL ${FULL_CHARGE} FOUND!`
    : aimed
      ? outcome.kind === "slingshot"
        ? `${vectorVerdict(notches)}!`
        : vectorVerdict(notches)
      : OUTCOME_LABEL[outcome.kind];
  // How far off, in the question's own units: "3 teaspoons off" says what a
  // percentage of the answer never did.
  const offBy =
    aimed && outcome.guessValue !== undefined
      ? formatOnRuler(vector, Math.abs(outcome.guessValue - vector.answer))
      : null;
  const picked = !outcome.correct && outcome.chosen !== null;
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
            {formatPoints(points)}{" "}
            <span className={styles.toastPointsUnit}>POINTS</span>
          </span>
          {outcome.base && (outcome.multiplier ?? 1) > 1 ? (
            <span className={`${styles.toastMultiplier} arcade`}>
              {outcome.base} x{outcome.multiplier}
            </span>
          ) : null}
        </span>
      </div>
      {/* One fact per line. The toast used to chain the answer, the guess,
          the error, the bonus and a km/h delta with middle dots, and a first
          time player read it as an equation. */}
      {aimed ? (
        <>
          <span className={styles.toastAnswer}>
            Correct answer: <strong>{outcome.answerText}</strong>
          </span>
          <span className={styles.toastAnswer}>
            Your guess: {outcome.guessText}
            {offBy !== null && notches > 0 ? (
              <>
                {" "}
                (<strong data-testid="wide-by">{offBy} off</strong>)
              </>
            ) : null}
          </span>
          {outcome.guessNotch !== undefined && outcome.answerNotch !== undefined ? (
            <Ruler
              guess={outcome.guessNotch}
              answer={outcome.answerNotch}
              wild={notches > VECTOR.wildBeyond}
            />
          ) : null}
        </>
      ) : outcome.kind === "burn" ? (
        <>
          <span className={styles.toastAnswer}>
            <strong>
              {outcome.charge} of {FULL_CHARGE} found
            </strong>
          </span>
          {(outcome.charge ?? 0) < FULL_CHARGE ? (
            <span className={styles.toastAnswer}>The {FULL_CHARGE} were: {outcome.answerText}</span>
          ) : null}
        </>
      ) : outcome.picks ? (
        <>
          <span className={styles.toastAnswer}>
            The {FULL_CHARGE} were: <strong>{outcome.answerText}</strong>
          </span>
          {picked ? <span className={styles.toastAnswer}>You picked: {outcome.guessText}</span> : null}
          {!outcome.correct && (outcome.lost ?? 0) > 0 ? (
            <span className={styles.toastAnswer}>{outcome.lost} plasma lost</span>
          ) : null}
        </>
      ) : (
        <>
          <span className={styles.toastAnswer}>
            Correct answer: <strong>{outcome.answerText}</strong>
          </span>
          {picked ? <span className={styles.toastAnswer}>You picked: {outcome.guessText}</span> : null}
        </>
      )}
      {outcome.salvage ? (
        <span className={`${styles.toastBonus} arcade`} data-testid="salvage">
          BONUS: {outcome.salvage === "shield" ? "SHIELD BACK" : "+1 HINT"}
        </span>
      ) : null}
      {outcome.streakAfter >= 2 ? (
        <span className={`${styles.toastMeta} ${styles.toastStreak} arcade`}>
          STREAK x{outcome.streakAfter}
        </span>
      ) : outcome.streakBefore >= 2 && !outcome.correct && outcome.kind !== "graze" ? (
        <span className={`${styles.toastMeta} ${styles.toastStreak} ${styles.toastStreakLost} arcade`}>
          STREAK x{outcome.streakBefore} LOST
        </span>
      ) : null}
      {fact ? <span className={styles.toastFact}>{fact}</span> : null}
      <TapPrompt shown={awaitingTap} />
    </section>
  );
}

/**
 * A cluster's read screen: the question is up, the lanes are not. What the
 * cluster's own shield does, in one line, and READY. The read clock in the
 * panel head opens the lanes on its own if the button is never tapped.
 */
function ClusterRead({ shields, onReady }: { shields: number; onReady: () => void }) {
  return (
    <div className={styles.read} data-testid="cluster-read">
      <span className={`${styles.readShield} arcade`} data-testid="cluster-shields">
        YOU HAVE {shields} SHIELD{shields === 1 ? "" : "S"}
      </span>
      <span className={styles.readNote}>{phaseGuide("cluster").readNote}</span>
      <button
        type="button"
        className={`${styles.readyButton} arcade`}
        onClick={onReady}
        data-testid="cluster-ready"
      >
        READY
      </button>
    </div>
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
  onReady,
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
  | "onReady"
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
    onReady,
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
      onReady,
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
      // A cluster's read screen: Enter or Space is READY.
      if (current.state?.phase === "reading") {
        if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
          current.onReady();
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
