"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { phaseGuide, stageMaxima, streakLine, type ScoringRow } from "@/lib/game/phases";
import { maxScoreFor } from "@/lib/game/Score";
import { SHIELDS } from "@/lib/game/Tuning";
import type { Round } from "@/lib/game/types";
import { formatScore } from "@/lib/game/format";
import { ScoringTable } from "./ScoringTable";
import styles from "./Briefing.module.css";

interface Props {
  round: Round;
  /** Read to the end, or closed. */
  onDone: () => void;
}

interface Card {
  tag: string;
  title: string;
  /** Plain sentences, one paragraph each. */
  lines: string[];
  /** The finer print, set smaller under the lines. */
  details?: string[];
  /** The scoring table under the lines, if the page has one. */
  scoring?: ScoringRow[];
  /** The welcome page's table: the phases and what each is worth. */
  phases?: Array<{ phase: number; name: string; oneLiner: string; max: number }>;
}

/**
 * The rulebook: HOW TO PLAY on the title screen. What the run is, then one
 * page per phase with its short rules, its finer print and its scoring.
 *
 * It is NOT shown before a first flight any more. Six pages of rules ahead
 * of the first question was what new players said was too much text; each
 * phase now explains itself in a few lines on its own card just before it
 * is played. This is where the whole thing lives end to end, for anyone who
 * asks for it.
 *
 * Every figure in the copy is read from `Tuning.ts` through `phases.ts` and
 * every count from the round itself, so retuning the game cannot leave the
 * briefing lying. The voice is plain on purpose: a scoring system a player
 * cannot repeat to a friend is one nobody argues about.
 */
export function Briefing({ round, onDone }: Props) {
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
      aria-label="How to play"
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <span className="eyebrow">How to play</span>
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
          {card.details ? (
            <div className={styles.details}>
              {card.details.map((line) => (
                <p className={styles.detailText} key={line}>
                  {line}
                </p>
              ))}
            </div>
          ) : null}
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
            {step === 0 ? "Close" : "Back"}
          </button>
          <button
            type="button"
            className={`${styles.primary} arcade`}
            onClick={next}
            data-testid="briefing-next"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The rulebook, built against the round in front of the player: a welcome
 * page with the phases and what each is worth, then one page per phase.
 */
function buildCards(round: Round): Card[] {
  const stages = stageMaxima(round);
  const total = maxScoreFor(round);
  const questions = round.questions.length;

  const welcome: Card = {
    tag: "One run a day",
    title: `${formatScore(total)} points to play for.`,
    lines: [
      `${questions} questions in ${stages.length} phases, the same for everyone today. Correct answers score points. Most wrong answers cost nothing.`,
      `You have ${SHIELDS.perRun} shields. Each one saves you from a wrong answer.`,
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
    const guide = phaseGuide(stage.type, round);
    return {
      tag: `Phase ${stage.phase} · ${stage.name}`,
      title: guide.title,
      lines: guide.rules,
      details: guide.details,
      scoring: guide.scoring,
    };
  });

  return [welcome, ...phases];
}
