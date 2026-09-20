"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  kitRows,
  phaseGuide,
  stageMaxima,
  streakLine,
  streakRows,
  type ScoringRow,
} from "@/lib/game/phases";
import { maxScoreFor } from "@/lib/game/Score";
import { NOVA, SHIELDS } from "@/lib/game/Tuning";
import type { Round } from "@/lib/game/types";
import { formatScore } from "@/lib/game/format";
import { ScoringTable } from "./ScoringTable";
import styles from "./Briefing.module.css";

interface Props {
  round: Round;
  /** Read to the end, or skipped. Either way the run starts next. */
  onDone: () => void;
  /** True on a first flight, which changes the framing and the last button. */
  firstFlight: boolean;
}

interface Card {
  tag: string;
  title: string;
  /** Plain sentences, one paragraph each. */
  lines: string[];
  /** The scoring table under the lines, if the page has one. */
  scoring?: ScoringRow[];
  /** The welcome page's table: the phases and what each is worth. */
  phases?: Array<{ phase: number; name: string; oneLiner: string; max: number }>;
}

/**
 * Pre-flight briefing. What the run is, one page per phase with its scoring
 * at the bottom, and the kit.
 *
 * Shown once, on a first flight, and reachable again from the title screen
 * afterwards. It is a full-screen card rather than something in the HUD band
 * because there is no run underneath it yet: the shell holds the engine back
 * until this closes, so the first thing a new player sees is not a five
 * second clock draining on a rule they have not read.
 *
 * Every figure in the copy is read from `Tuning.ts` through `phases.ts` and
 * every count from the round itself, so retuning the game cannot leave the
 * briefing lying. The voice is plain on purpose: a scoring system a player
 * cannot repeat to a friend is one nobody argues about.
 */
export function Briefing({ round, onDone, firstFlight }: Props) {
  const cards = useMemo(() => buildCards(round), [round]);
  const [step, setStep] = useState(0);
  const last = step >= cards.length - 1;
  const card = cards[step];

  const next = useCallback(() => {
    setStep((current) => {
      if (current >= cards.length - 1) {
        onDone();
        return current;
      }
      return current + 1;
    });
  }, [cards.length, onDone]);

  const back = useCallback(() => {
    setStep((current) => Math.max(current - 1, 0));
  }, []);

  // Desktop convenience only: every one of these has a tap target on screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onDone();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onDone]);

  if (!card) return null;

  return (
    <div
      className={styles.overlay}
      data-testid="briefing"
      role="dialog"
      aria-modal="true"
      aria-label="Pre-flight briefing"
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <span className="eyebrow">
            {firstFlight ? "First flight" : "Briefing"}
          </span>
          <span className={`${styles.count} arcade`}>
            {step + 1}/{cards.length}
          </span>
        </header>

        <div className={styles.card} key={card.tag}>
          <span className={`${styles.tag} arcade`}>{card.tag}</span>
          <h2 className={`${styles.title} arcade`}>{card.title}</h2>
          <div className={styles.lines}>
            {card.lines.map((line) => (
              <p className={styles.lineText} key={line}>
                {line}
              </p>
            ))}
          </div>
          {card.phases ? (
            <ol className={styles.phases} data-testid="briefing-phases">
              {card.phases.map((entry) => (
                <li key={entry.name} className={styles.phase}>
                  <span className={`${styles.phaseNumber} arcade`}>{entry.phase}</span>
                  <span className={styles.phaseBody}>
                    <span className={`${styles.phaseName} arcade`}>{entry.name}</span>
                    <span className={styles.phaseLine}>{entry.oneLiner}</span>
                  </span>
                  <span className={`${styles.phaseMax} arcade`}>{formatScore(entry.max)}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {card.scoring ? <ScoringTable rows={card.scoring} testId="briefing-scoring" /> : null}
        </div>

        <div className={styles.dots} aria-hidden="true">
          {cards.map((entry, index) => (
            <span
              key={entry.tag}
              className={styles.dot}
              data-on={index <= step ? "true" : "false"}
            />
          ))}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.secondary} arcade`}
            onClick={step === 0 ? onDone : back}
            data-testid="briefing-back"
          >
            {step === 0 ? "Skip" : "Back"}
          </button>
          <button
            type="button"
            className={`${styles.primary} arcade`}
            onClick={next}
            data-testid="briefing-next"
          >
            {last ? "Launch" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The briefing, built against the round in front of the player: a welcome
 * page, one page per phase the round actually holds, and the kit.
 */
function buildCards(round: Round): Card[] {
  const stages = stageMaxima(round);
  const total = maxScoreFor(round);
  const encounters = round.questions.length;

  const welcome: Card = {
    tag: "Welcome aboard",
    title: `One run a day. ${formatScore(total)} points on the table.`,
    lines: [
      `${encounters} questions in ${stages.length} phases, the same round for everyone today. Every right answer scores. Every wrong one costs ${SHIELDS.perRun > 0 ? "a shield and " : ""}points.`,
      streakLine(),
    ],
    phases: stages.map((stage) => ({
      phase: stage.phase,
      name: stage.name,
      oneLiner: phaseGuide(stage.type).oneLiner,
      max: stage.max,
    })),
  };

  const phases: Card[] = stages.map((stage) => {
    const guide = phaseGuide(stage.type);
    return {
      tag: `Phase ${stage.phase} · ${stage.name}`,
      title: guide.title,
      lines: guide.how,
      scoring: guide.scoring,
    };
  });

  const kit: Card = {
    tag: "Your kit",
    title: "Shields, NOVA, and the clock",
    lines: [
      `${SHIELDS.perRun} shields for the whole run. Every wrong answer costs one. With none left, a wrong answer is a wreck and costs double.`,
      `${NOVA.perRun} NOVA scans. One tap rules out a wrong answer or hands you a clue. Everyone gets the same help on the same question.`,
      "The clock is short and it refills for every answer. Nothing else in the run moves until you tap.",
    ],
    scoring: [...streakRows(), ...kitRows()],
  };

  return [welcome, ...phases, kit];
}
