"use client";

import { useEffect } from "react";
import { CLUSTER, ENCOUNTER, SHIELDS } from "@/lib/game/Tuning";
import type { ClusterQuestion, Round } from "@/lib/game/types";
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
 * Kept to three lines. This is not the briefing: it says what the next
 * ninety seconds are, and gets out of the way. Every figure is read from
 * `Tuning.ts` and every count from the round, so retuning cannot leave it
 * lying.
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

  const cluster = round.questions.find(
    (question): question is ClusterQuestion => question.type === "cluster",
  );
  const lanes = cluster?.options.length ?? CLUSTER.laneCount;
  const right = cluster?.answers.length ?? 0;
  const stage = round.stages?.[0]?.name ?? "Cluster Belt";

  return (
    <div
      className={styles.overlay}
      data-testid="ready"
      role="dialog"
      aria-modal="true"
      aria-label="Launch"
    >
      <div className={styles.panel}>
        <span className={`${styles.tag} arcade`}>Phase 1 &middot; {stage}</span>
        <h2 className={`${styles.title} arcade`}>CLUSTER</h2>

        <ul className={styles.lines}>
          <li className={styles.line}>
            <strong>{lanes} lanes, {right} of them right.</strong> Tap one and the ship
            flies it.
          </li>
          <li className={styles.line}>
            A right lane sends a <strong>plasma pod</strong> you fly through. A wrong one
            sends a <strong>boulder</strong>, and it costs a shield.
          </li>
          <li className={styles.line}>
            Bank what you have with <strong>BURN</strong>, or push your luck for more.{" "}
            {ENCOUNTER.thrustSeconds} seconds a pick, {SHIELDS.perRun} shields for the
            whole run.
          </li>
        </ul>

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
