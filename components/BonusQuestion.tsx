"use client";

import { useEffect, useState } from "react";
import styles from "./BonusQuestion.module.css";

/**
 * A prank round for showing the game to friends, off `?squad=1`. It sits
 * between the ending and the tally, scores nothing and is written down
 * nowhere: the run, the tally and the share card are exactly the day's.
 * Every lane is wrong, which is the joke.
 */
const PROMPT =
  "Who, according to mainstream scientists, is widely recognised as the largest pinner in Melbourne, Australia?";
const OPTIONS = ["Thomas McIntyre", "Aaron Harnett", "Ashley Beattie", "Niall Sherin"];
const VERDICT = "They are all equally massive pinners, according to the latest research.";

/** How long the BONUS QUESTION title card holds before the question comes up. */
const INTRO_MS = 1800;

interface Props {
  onReveal: () => void;
  onVerdict: () => void;
  onDone: () => void;
}

export function BonusQuestion({ onReveal, onVerdict, onDone }: Props) {
  const [stage, setStage] = useState<"intro" | "question" | "verdict">("intro");
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    onReveal();
    const id = window.setTimeout(() => setStage("question"), INTRO_MS);
    return () => window.clearTimeout(id);
    // Once, on mount: the reveal is a sound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (index: number) => {
    if (stage !== "question") return;
    setPicked(index);
    setStage("verdict");
    onVerdict();
  };

  return (
    <div className={styles.overlay} data-testid="bonus">
      <div className={styles.glow} aria-hidden="true" />
      {stage === "verdict" ? (
        <button
          type="button"
          className={styles.catcher}
          onClick={onDone}
          aria-label="Continue to your score"
          data-testid="bonus-continue"
        />
      ) : null}

      <div className={styles.panel}>
        <h2 className={`${styles.title} ${stage === "intro" ? styles.titleBig : ""} arcade`}>
          Bonus question
        </h2>

        {stage !== "intro" ? (
          <>
            <p className={styles.prompt}>{PROMPT}</p>
            <div className={styles.options}>
              {OPTIONS.map((option, i) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.option} ${picked === i ? styles.optionWrong : ""}`}
                  onClick={() => pick(i)}
                  disabled={stage !== "question"}
                  data-testid={`bonus-option-${i}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {stage === "verdict" ? (
          <div className={styles.verdict} data-testid="bonus-verdict">
            <span className={`${styles.wrong} arcade`}>Incorrect</span>
            <p className={styles.reason}>{VERDICT}</p>
            <span className={`${styles.tap} arcade`}>Tap to continue</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
