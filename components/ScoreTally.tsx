"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatPoints, formatScore } from "@/lib/game/format";
import { finaleTier } from "@/lib/game/Score";
import { STAGES, typeOf } from "@/lib/game/share";
import { FINALE } from "@/lib/game/Tuning";
import type { FinaleTier, RunSummary, ScoreLine, TallyCue } from "@/lib/game/types";
import styles from "./ScoreTally.module.css";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** What the tally calls the run, by tier. Plain words, in the game's voice. */
const TIER_TITLE: Record<FinaleTier, string> = {
  perfect: "PERFECT RUN",
  legendary: "LEGENDARY RUN",
  great: "GREAT RUN",
  good: "GOOD RUN",
  complete: "BETTER LUCK TOMORROW",
};

interface Group {
  /** Stage name, or null for lines that could not be placed in one. */
  name: string | null;
  lines: ScoreLine[];
  points: number;
  max: number;
}

/** One beat of the read-out. Applied in order, `delay` after the one before. */
type Beat =
  | { kind: "intro"; delay: number }
  | { kind: "line"; delay: number; line: ScoreLine; order: number }
  | { kind: "stage"; delay: number; group: number }
  | { kind: "total"; delay: number };

/** The eight lines in the run's four stages, in flight order. */
function groupLines(lines: ScoreLine[]): Group[] {
  const groups: Group[] = STAGES.map((stage) => ({
    name: stage.name,
    lines: lines.filter((line) => typeOf(line) === stage.type),
    points: 0,
    max: 0,
  }));
  // A stored run that predates `type` and has a label nothing recognises
  // still gets read out, in a group of its own with no header.
  const placed = new Set(groups.flatMap((group) => group.lines));
  const rest = lines.filter((line) => !placed.has(line));
  if (rest.length > 0) groups.push({ name: null, lines: rest, points: 0, max: 0 });
  for (const group of groups) {
    group.points = group.lines.reduce((sum, line) => sum + line.points, 0);
    group.max = group.lines.reduce((sum, line) => sum + line.max, 0);
  }
  return groups.filter((group) => group.lines.length > 0);
}

function beatsFor(groups: Group[]): Beat[] {
  const beats: Beat[] = [{ kind: "intro", delay: FINALE.introMs }];
  let order = 0;
  groups.forEach((group, index) => {
    for (const line of group.lines) {
      beats.push({ kind: "line", delay: FINALE.lineMs, line, order });
      order += 1;
    }
    if (group.name) beats.push({ kind: "stage", delay: FINALE.stageMs, group: index });
  });
  beats.push({ kind: "total", delay: FINALE.totalMs });
  return beats;
}

/**
 * A number that rolls to its target rather than jumping. `onStep` fires each
 * time the shown integer changes, which is what the count-up ticks ride on.
 */
function useRoll(target: number, ms: number, onStep?: () => void): number {
  const [shown, setShown] = useState(target === 0 || ms <= 0 ? target : 0);
  const from = useRef(shown);
  const step = useRef(onStep);
  useEffect(() => {
    step.current = onStep;
  }, [onStep]);

  useEffect(() => {
    if (ms <= 0) {
      // Instant: the figure is read straight off `target` below.
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let last = Math.round(origin);
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(origin + (target - origin) * eased);
      from.current = value;
      if (value !== last) {
        last = value;
        setShown(value);
        step.current?.();
      }
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return ms <= 0 ? target : shown;
}

/** A line's points, rolling up from nothing as the line lands. */
function LinePoints({ points, shown, instant }: { points: number; shown: boolean; instant: boolean }) {
  const value = useRoll(shown ? points : 0, instant ? 0 : FINALE.countMs);
  return <>{formatPoints(value)} POINTS</>;
}

/**
 * The scorecard, between the last encounter and the share card.
 *
 * The run is over and the question it has to answer is "how did I do?". A
 * score out of a fixed maximum answers it, and the tally under it says where
 * the points came from, one line per question in the run's four stages.
 *
 * It is read out, not listed. RUN COMPLETE slams in on the finish cue's
 * impact, each line lands on a note that climbs a scale with its points
 * rolling up, each stage stamps its subtotal on a chord, and the running total
 * at the foot counts up the whole way over a meter that fills. Then the total
 * stamps, the tier is named, and the better the run the bigger the finale:
 * rays behind the figure from GREAT up, confetti from LEGENDARY. The sound and
 * the screen read the same tier (`finaleTier`), so they always agree.
 *
 * Tapping anywhere skips straight to the end, playing only the total's cue,
 * and tapping again moves on. Reduced motion gets the end state at once.
 */
export function ScoreTally({
  summary,
  onDone,
  onCue,
}: {
  summary: RunSummary;
  onDone: () => void;
  onCue?: (cue: TallyCue) => void;
}) {
  const lines = useMemo(() => summary.lines ?? [], [summary.lines]);
  const groups = useMemo(() => groupLines(lines), [lines]);
  const beats = useMemo(() => beatsFor(groups), [groups]);
  const max = summary.maxScore ?? 0;
  const score = summary.score ?? 0;
  const tier = finaleTier(score, max);
  /** Days in a row, stamped when the run was saved. None on a practice run. */
  const dayStreak = Math.max(0, Math.floor(summary.dayStreak ?? 0));

  // Decided once, on mount: this only ever renders on the client, after a
  // run has ended.
  const [still] = useState(prefersReducedMotion);
  // How many beats have been applied. Everything on screen derives from it.
  const [step, setStep] = useState(() => (still ? beats.length : 0));
  const [skipped, setSkipped] = useState(still);
  const done = step >= beats.length;

  const cue = useRef(onCue);
  useEffect(() => {
    cue.current = onCue;
  }, [onCue]);
  const totalPlayed = useRef(false);
  const playTotal = useCallback(() => {
    if (totalPlayed.current) return;
    totalPlayed.current = true;
    cue.current?.({ kind: "total", tier });
  }, [tier]);

  // Reduced motion still hears the verdict, once.
  useEffect(() => {
    if (still) playTotal();
  }, [still, playTotal]);

  useEffect(() => {
    if (step >= beats.length) return;
    const beat = beats[step]!;
    const timer = window.setTimeout(() => {
      // Sounds fire from the timer, not the effect body, so StrictMode's
      // mount, unmount, mount never plays a beat twice.
      if (beat.kind === "line") {
        cue.current?.({
          kind: "line",
          index: beat.order,
          points: beat.line.points,
          max: beat.line.max,
        });
      } else if (beat.kind === "stage") {
        const group = groups[beat.group]!;
        cue.current?.({ kind: "stage", share: group.max > 0 ? group.points / group.max : 0 });
      } else if (beat.kind === "total") {
        playTotal();
      }
      setStep((n) => n + 1);
    }, beat.delay);
    return () => window.clearTimeout(timer);
  }, [step, beats, groups, playTotal]);

  const applied = beats.slice(0, step);
  const introIn = applied.some((beat) => beat.kind === "intro");
  const shownLines = new Set(
    applied.flatMap((beat) => (beat.kind === "line" ? [beat.line.index] : [])),
  );
  const stamped = new Set(
    applied.flatMap((beat) => (beat.kind === "stage" ? [beat.group] : [])),
  );
  const totalIn = done;

  // The running total: every line landed so far, and the final score once it
  // stamps (they agree; the score is the authority).
  const running = totalIn
    ? score
    : lines.reduce((sum, line) => sum + (shownLines.has(line.index) ? line.points : 0), 0);
  const lastTick = useRef(0);
  const onRollStep = useCallback(() => {
    const now = performance.now();
    if (now - lastTick.current < FINALE.tickEveryMs) return;
    lastTick.current = now;
    cue.current?.({ kind: "tick" });
  }, []);
  const shownTotal = useRoll(
    Math.max(0, running),
    skipped ? 0 : FINALE.countMs,
    skipped ? undefined : onRollStep,
  );
  const meterFill =
    max > 0 ? Math.round(Math.max(0, Math.min(1, shownTotal / max)) * FINALE.meterCells) : 0;

  const advance = () => {
    if (!done) {
      setSkipped(true);
      setStep(beats.length);
      playTotal();
      return;
    }
    onDone();
  };

  const confetti = useMemo(
    () =>
      Array.from({ length: FINALE.confetti }, (_, i) => {
        // Spread by a fixed stride rather than at random, so the fall looks
        // the same every time and renders identically on the server and client.
        const x = (i * 37) % 100;
        return {
          left: `${x}%`,
          delay: `${(i * 53) % 900}ms`,
          duration: `${1600 + ((i * 71) % 1100)}ms`,
          drift: `${((i * 29) % 60) - 30}px`,
          spin: `${((i * 97) % 720) - 360}deg`,
          white: i % 3 === 0,
        };
      }),
    [],
  );
  const celebrate = tier === "perfect" || tier === "legendary";
  const rays = celebrate || tier === "great";

  return (
    <div
      className={`${styles.overlay} ${totalIn && !still ? styles.overlayFlash : ""}`}
      data-testid="tally"
      data-tier={tier}
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

      {totalIn && celebrate && !still ? (
        <div className={styles.confetti} aria-hidden="true" data-testid="tally-confetti">
          {confetti.map((piece, i) => (
            <span
              key={i}
              className={`${styles.piece} ${piece.white ? styles.pieceWhite : ""}`}
              style={
                {
                  left: piece.left,
                  animationDelay: piece.delay,
                  animationDuration: piece.duration,
                  "--drift": piece.drift,
                  "--spin": piece.spin,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}

      <section
        className={`${styles.panel} ${totalIn && !skipped ? styles.panelShake : ""}`}
      >
        <h2
          id="tally-heading"
          className={`${styles.heading} ${introIn ? styles.headingIn : ""} ${
            still ? styles.noMotion : ""
          } arcade`}
        >
          Run complete
        </h2>

        <div className={styles.groups}>
          {groups.map((group, groupIndex) => (
            <div key={group.name ?? "rest"} className={styles.group}>
              {group.name ? (
                <div className={styles.stageHead}>
                  <span className={`${styles.stageName} arcade`}>{group.name}</span>
                  <span
                    className={`${styles.stageSum} ${
                      stamped.has(groupIndex) ? styles.stageSumIn : ""
                    } ${group.points >= group.max && group.max > 0 ? styles.stageSumFull : ""} arcade`}
                    data-testid={`tally-stage-${groupIndex}`}
                  >
                    {formatScore(group.points)} / {formatScore(group.max)} POINTS
                  </span>
                </div>
              ) : null}
              <ol className={styles.lines}>
                {group.lines.map((line) => {
                  const shown = shownLines.has(line.index);
                  // Called out only when the encounter itself left points
                  // behind, so a clean answer is never flagged red for falling
                  // short of `max`.
                  const missed = !line.full;
                  const tone =
                    line.points < 0
                      ? styles.lineDown
                      : line.points === 0
                        ? styles.lineNil
                        : line.points >= line.max
                          ? styles.lineFull
                          : "";
                  return (
                    <li
                      key={line.index}
                      className={`${styles.line} ${shown ? `${styles.lineIn} ${tone}` : ""}`}
                      data-testid={`tally-line-${line.index}`}
                      aria-hidden={shown ? undefined : true}
                    >
                      <span className={`${styles.lineLabel} arcade`}>{line.label}</span>
                      <span className={styles.lineDetail}>{line.detail}</span>
                      <span className={styles.lineSum}>
                        {line.points > 0 && line.multiplier > 1 ? (
                          <span className={`${styles.lineMath} arcade`}>
                            {line.base} x{line.multiplier}
                          </span>
                        ) : null}
                        <span
                          className={`${styles.linePoints} ${
                            line.points < 0 ? styles.linePointsDown : ""
                          } ${line.points === 0 ? styles.linePointsNil : ""} arcade`}
                        >
                          <LinePoints points={line.points} shown={shown} instant={skipped} />
                        </span>
                        <span
                          className={`${styles.lineMax} ${missed ? styles.lineMissed : ""} arcade`}
                        >
                          / {line.max}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>

        <div className={`${styles.total} ${introIn ? styles.totalLive : ""}`}>
          {rays && totalIn && !still ? <span className={styles.rays} aria-hidden="true" /> : null}
          <span className="label">{totalIn ? "You scored" : "Adding up"}</span>
          <span
            className={`${styles.totalValue} ${totalIn ? styles.totalStamp : ""} ${
              still ? styles.noMotion : ""
            } arcade`}
            data-testid="tally-total"
          >
            {formatScore(shownTotal)}
            <span className={styles.totalOutOf}>/ {formatScore(max)}</span>
          </span>
          <span className={styles.meter} aria-hidden="true">
            {Array.from({ length: FINALE.meterCells }, (_, i) => (
              <span key={i} className={`${styles.cell} ${i < meterFill ? styles.cellOn : ""}`} />
            ))}
          </span>
          <span className={styles.verdict} aria-hidden={totalIn ? undefined : true}>
            <span
              className={`${styles.tier} ${totalIn ? styles.tierIn : ""} ${
                celebrate ? styles.tierHot : ""
              } arcade`}
              data-testid="tally-tier"
            >
              {TIER_TITLE[tier]}
            </span>
            {summary.newBest ? (
              <span
                className={`${styles.newBest} ${totalIn ? styles.newBestIn : ""} arcade`}
                data-testid="tally-new-best"
              >
                New best
              </span>
            ) : null}
          </span>
          {dayStreak > 0 ? (
            <span
              className={`${styles.dayStreak} ${totalIn ? styles.dayStreakIn : ""}`}
              data-testid="tally-day-streak"
              aria-hidden={totalIn ? undefined : true}
            >
              <span className={`${styles.dayStreakFigure} arcade`}>
                🔥 {dayStreak} day streak
              </span>
              <span className={styles.dayStreakNext}>
                Play tomorrow to make it {dayStreak + 1}.
              </span>
            </span>
          ) : null}
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
