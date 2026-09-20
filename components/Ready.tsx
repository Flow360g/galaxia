"use client";

import { useEffect } from "react";
import { phaseGuide } from "@/lib/game/phases";
import type { Round } from "@/lib/game/types";
import { ScoringDisclosure } from "./ScoringTable";
import styles from "./Ready.module.css";

interface Props {
  round: Round;
  /** READY was pressed. The engine mounts and the countdown runs. */
  onReady: () => void;
}

/**
 * The launch card: what Phase 1 is, and a READY button.
 *
 * Every run opens on this, briefing or no briefing. Two reasons it earns the
 * tap. The first cluster arrives with a five second clock already draining,
 * and a player who is still working out what a lane is has lost it before
 * they have read the prompt. And the run should start when the player says
 * so, which is the same rule the rest of the game is built on -- nothing
 * else advances on a timer either.
 *
 * Kept to a few lines. This is not the briefing: it says what the next
 * ninety seconds are, and gets out of the way. The scoring sits behind a
 * button, collapsed, like it does on every phase card in the run. The copy
 * is the same `phaseGuide` the briefing and the waypoint card read.
 */
export function Ready({ round, onReady }: Props) {
  // Desktop convenience only; the button is the real target.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onReady();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onReady]);

  const first = round.questions[0];
  const guide = phaseGuide(first?.type ?? "cluster");
  const stage = round.stages?.[0];
  const phase = stage?.phase ?? 1;

  return (
    <div
      className={styles.overlay}
      data-testid="ready"
      role="dialog"
      aria-modal="true"
      aria-label="Launch"
    >
      <div className={styles.panel}>
        <span className={`${styles.tag} arcade`}>
          Phase {phase} &middot; {stage?.name ?? guide.title}
        </span>
        <h2 className={`${styles.title} arcade`}>{guide.title}</h2>

        <ul className={styles.lines}>
          {guide.how.map((line) => (
            <li key={line} className={styles.line}>
              {line}
            </li>
          ))}
        </ul>

        <ScoringDisclosure rows={guide.scoring} className={styles.scoring} />

        <button
          type="button"
          className={`${styles.ready} arcade`}
          onClick={onReady}
          data-testid="ready-go"
        >
          READY
        </button>
      </div>
    </div>
  );
}
