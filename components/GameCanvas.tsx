"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, type LabelPlacement } from "@/lib/game/Engine";
import type {
  AnswerEvent,
  DebugInfo,
  GameState,
  Round,
  RoundSummary,
} from "@/lib/game/types";
import { Hud } from "./Hud";
import { RoundEnd } from "./RoundEnd";
import { DebugStats } from "./DebugStats";
import styles from "./GameCanvas.module.css";

interface Props {
  round: Round;
  debug: boolean;
}

/**
 * Mount boundary between React and three.js.
 *
 * React owns the DOM overlay and nothing else. The engine owns the canvas and
 * runs its own loop, so the render loop never touches the React scheduler.
 * State flows one way, engine to React, throttled, and only for the HUD.
 */
export function GameCanvas({ round, debug }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);

  const [state, setState] = useState<GameState | null>(null);
  const [labels, setLabels] = useState<LabelPlacement[]>([]);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [lastAnswer, setLastAnswer] = useState<AnswerEvent | null>(null);
  const [summary, setSummary] = useState<RoundSummary | null>(null);

  // The engine emits state every frame. Re-rendering React at 60fps would
  // cost more than the scene does, so the HUD is sampled at ~10Hz instead.
  const lastStateEmit = useRef(0);

  const handleState = useCallback((next: GameState) => {
    const now = performance.now();
    if (now - lastStateEmit.current < 100) return;
    lastStateEmit.current = now;
    setState(next);
  }, []);

  const handleLabels = useCallback((next: LabelPlacement[]) => {
    // The engine reuses its label buffer between frames, so this must copy;
    // storing the array itself would give React a reference that mutates
    // underneath it and never re-renders.
    setLabels(next.map((label) => ({ ...label })));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = new Engine({
      container,
      round,
      onState: handleState,
      onLabels: handleLabels,
      onAnswer: setLastAnswer,
      onRoundEnd: setSummary,
      onDebug: debug ? setDebugInfo : undefined,
    });
    setLastAnswer(null);
    setSummary(null);

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [round, debug, handleState, handleLabels]);

  return (
    <div className={styles.shell}>
      {/* The engine creates and owns the canvas inside this container; see
          EngineOptions.container for why React must not supply it. */}
      <div ref={containerRef} className={styles.stage} />

      {/* Answer labels, projected from world space each frame. */}
      <div className={styles.labels} aria-hidden="true">
        {labels.map((label) => (
          <span
            key={label.id}
            data-testid="answer-label"
            className={`${styles.label} mono`}
            style={{
              transform: `translate3d(${label.x}px, ${label.y}px, 0) translate(-50%, -50%) scale(${label.scale})`,
              opacity: label.opacity,
            }}
          >
            {label.text}
          </span>
        ))}
      </div>

      <Hud state={state} round={round} lastAnswer={lastAnswer} />
      {summary ? <RoundEnd round={round} summary={summary} /> : null}
      {debug && debugInfo ? <DebugStats info={debugInfo} /> : null}
    </div>
  );
}
