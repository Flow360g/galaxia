"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CLUSTER,
  ENCOUNTER,
  FLIGHT,
  NOVA,
  SHIELDS,
  VECTOR,
} from "@/lib/game/Tuning";
import type { Question, Round } from "@/lib/game/types";
import styles from "./Briefing.module.css";

interface Props {
  round: Round;
  /** Read to the end, or skipped. Either way the run starts next. */
  onDone: () => void;
  /** True on a first flight, which changes the framing and the last button. */
  firstFlight: boolean;
}

interface Line {
  label: string;
  text: string;
}

interface Card {
  tag: string;
  title: string;
  lines: Line[];
}

/**
 * Pre-flight briefing. The rules and the scoring system, before the first
 * round.
 *
 * Shown once, on a first flight, and reachable again from the title screen
 * afterwards. It is a full-screen card rather than something in the HUD band
 * because there is no run underneath it yet: the shell holds the engine back
 * until this closes, so the first thing a new player sees is not a five
 * second clock draining on a rule they have not read.
 *
 * Every figure in the copy is read from `Tuning.ts` and every count from the
 * round itself, so retuning the game cannot leave the briefing lying.
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
          <dl className={styles.lines}>
            {card.lines.map((line) => (
              <div className={styles.line} key={line.label}>
                <dt className={`${styles.lineLabel} arcade`}>{line.label}</dt>
                <dd className={styles.lineText}>{line.text}</dd>
              </div>
            ))}
          </dl>
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

/** "1,800" from 1800. The share card and the HUD set figures the same way. */
function figure(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function multiple(value: number): string {
  return `${Number(value.toFixed(2))}x`;
}

function count(questions: Question[], type: Question["type"]): number {
  return questions.filter((question) => question.type === type).length;
}

/**
 * The briefing, built against the round in front of the player.
 *
 * The encounter card lists only the kinds today actually holds: a round is
 * authored, the mix moves, and a briefing that promises four MCQs when there
 * are two is worse than no briefing.
 */
function buildCards(round: Round): Card[] {
  const questions = round.questions;
  const clusters = count(questions, "cluster");
  const vectors = count(questions, "vector");
  const mcqs = count(questions, "mcq");
  const earths = count(questions, "earth");
  const fullCharge = CLUSTER.chargeMultiplier.length - 1;

  const encounters: Line[] = [];
  if (clusters > 0) {
    encounters.push({
      label: `Cluster x${clusters}`,
      text: `${CLUSTER.laneCount} lanes, ${fullCharge} of them right. Every correct pick banks plasma. BURN to cash it in at ${CLUSTER.chargeMultiplier
        .slice(1)
        .map(multiple)
        .join(" / ")}, or pick again for more. One wrong lane and the charge is gone.`,
    });
  }
  if (mcqs > 0) {
    encounters.push({
      label: `Question x${mcqs}`,
      text: "Four lanes, one right. Straight trivia, and the fastest points in the run.",
    });
  }
  if (vectors > 0) {
    encounters.push({
      label: `Vector x${vectors}`,
      text: `A number, aimed on a slider. Lock to fire, but only a good aim gets the shot off: land it inside ${percent(
        VECTOR.perfectBand,
      )} of tolerance for a direct hit and you salvage a shield or a NOVA back. Miss, and the scout fires first.`,
    });
  }
  if (earths > 0) {
    encounters.push({
      label: "Where on Earth",
      text: "The last encounter. Dock at the station and open its satellite feed: the invasion has landed somewhere on Earth, and the fleet is waiting on your call.",
    });
  }

  return [
    {
      tag: "The flight",
      title: "Every answer is a lane",
      lines: [
        {
          label: "The run",
          text: `${questions.length} encounters, one run a day, the same round for everyone. Your score is the distance you fly.`,
        },
        {
          label: "Right lane",
          text: "A plasma pod comes down it. Fly through it and accelerate.",
        },
        {
          label: "Wrong lane",
          text: "A boulder comes down it instead. It strikes the hull and kills your momentum.",
        },
        {
          label: "Nothing ahead",
          text: "The sky is empty while a question is open. It will never tell you the answer.",
        },
      ],
    },
    {
      tag: "The clock",
      title: "Thrust is the timer",
      lines: [
        {
          label: `${ENCOUNTER.thrustSeconds} seconds`,
          text: "One pick, one clock. It refills for every decision, so a cluster is six short ones rather than one long one.",
        },
        {
          label: "Answer fast",
          text: `A correct answer is worth ${figure(
            FLIGHT.impulseBase,
          )} km/h with the clock nearly out, and up to ${figure(
            FLIGHT.impulseBase + FLIGHT.impulseThrust,
          )} km/h with it nearly full. Hesitation is the cost.`,
        },
        {
          label: "Too slow",
          text: "Let it drain and the lane picks itself. It counts as a miss.",
        },
      ],
    },
    {
      tag: "Scoring",
      title: "Distance is the score",
      lines: [
        {
          label: "Cruise",
          text: `You idle at ${figure(
            FLIGHT.cruise,
          )} km/h. Distance piles up the whole time, so speed held is score banked.`,
        },
        {
          label: "Streaks",
          text: `Each correct answer in a row lifts that floor by ${percent(
            FLIGHT.streakCruiseGain,
          )}, up to ${FLIGHT.streakCap} in a row: a full streak idles at ${figure(
            FLIGHT.cruise * (1 + FLIGHT.streakCruiseGain * FLIGHT.streakCap),
          )} km/h.`,
        },
        {
          label: "Misses",
          text: `A collision keeps ${percent(
            FLIGHT.collisionRetain,
          )} of your velocity and takes the streak with it. A wreck keeps ${percent(
            FLIGHT.wreckRetain,
          )}. Falling from screaming to crawling is the whole punishment.`,
        },
      ],
    },
    {
      tag: "Your tools",
      title: "Three ways to press it",
      lines: [
        {
          label: "Boost",
          text: `Arm it before you lock. Right lane, and the impulse is ${multiple(
            FLIGHT.boostImpulse,
          )}, a slingshot. Wrong lane, and it is a wreck. Confidence as a button.`,
        },
        {
          label: `Shields x${SHIELDS.perRun}`,
          text: "One per wrong lane. At zero, every miss is a wreck.",
        },
        {
          label: `NOVA x${NOVA.perRun}`,
          text: `A scan rules out a lane, hands you a clue, or narrows it to ${
            NOVA.narrowKeep
          }. It costs ${percent(
            NOVA.thrustCost,
          )} of the clock, and it is seeded per question, so your friends got the same help.`,
        },
      ],
    },
    {
      tag: "Encounters",
      title: `Today: ${round.theme}`,
      lines: encounters,
    },
    {
      tag: "The end",
      title: "Fly it, then post it",
      lines: [
        {
          label: "Waypoints",
          text: "Clear a stage and it gets rated S to C on the plasma you banked and the shields you still hold.",
        },
        {
          label: "Every answer",
          text: "Wrong or right, you get the right answer and a fact. It is an arcade, not an exam.",
        },
        {
          label: "The card",
          text: "The run ends on a share card and a strip of glyphs: distance, peak, best streak. One run a day, so that strip is the whole argument.",
        },
      ],
    },
  ];
}
