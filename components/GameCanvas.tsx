"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Engine } from "@/lib/game/Engine";
import { isMaxThrust } from "@/lib/game/Flight";
import type { DebugInfo, GameState, Round, RunSummary } from "@/lib/game/types";
import { clearRun, loadRun, saveRun } from "@/lib/game/storage";
import { Hud } from "./Hud";
import { ShareCard } from "./ShareCard";
import { DebugStats } from "./DebugStats";
import styles from "./GameCanvas.module.css";

interface Props {
  round: Round;
  debug: boolean;
  /** Skip the stored run and fly again regardless. */
  replay?: boolean;
}

/**
 * Mount boundary between React and three.js.
 *
 * React owns the DOM overlay and nothing else. The engine owns the canvas and
 * runs its own loop, so the render loop never touches the React scheduler.
 * State flows one way, engine to React, throttled, and only for the HUD.
 * Input flows the other way as plain method calls on the engine.
 */
export function GameCanvas({ round, debug, replay = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);

  const [state, setState] = useState<GameState | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  /** Bumped to remount the engine for a fresh run. */
  const [attempt, setAttempt] = useState(0);
  /**
   * Today's stored run, if any. `undefined` on the server and until hydration
   * so the engine never starts before storage has been checked.
   */
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => (replay ? null : storedRun(round.date)),
    () => undefined,
  );

  // The engine emits state every frame. Re-rendering React at 60fps would
  // cost more than the scene does, so the HUD is sampled at ~12Hz instead.
  const lastStateEmit = useRef(0);
  const handleState = useCallback((next: GameState) => {
    const now = performance.now();
    if (now - lastStateEmit.current < 80) return;
    lastStateEmit.current = now;
    setState(next);
  }, []);

  const handleRunEnd = useCallback((result: RunSummary) => {
    saveRun(result);
    storedCache.set(result.date, result);
    setSummary(result);
  }, []);

  const playing = stored === null && summary === null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || stored !== null) return;

    const engine = new Engine({
      container,
      round,
      onState: handleState,
      onRunEnd: handleRunEnd,
      onDebug: debug ? setDebugInfo : undefined,
    });
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // `attempt` is a deliberate dependency: bumping it remounts the engine.
  }, [round, debug, stored, attempt, handleState, handleRunEnd]);

  const replayRun = useCallback(() => {
    clearRun(round.date);
    storedCache.set(round.date, null);
    setSummary(null);
    setState(null);
    setAttempt((n) => n + 1);
  }, [round.date]);

  const shown = summary ?? stored ?? null;
  // MAXIMUM THRUST shakes the whole surface, canvas and HUD together, so the
  // screen reads as struggling rather than the scene sliding under a steady
  // overlay. The camera rumbles underneath it; see ChaseCamera.rumble.
  const maxThrust = isMaxThrust(state?.outcome);

  return (
    <div className={`${styles.shell} ${maxThrust ? styles.shellShake : ""}`}>
      {/* The engine creates and owns the canvas inside this container; see
          EngineOptions.container for why React must not supply it. */}
      <div ref={containerRef} className={styles.stage} />

      {playing ? (
        <Hud
          state={state}
          round={round}
          onAnswer={(option) => engineRef.current?.answer(option)}
          onPick={(lane) => engineRef.current?.pick(lane)}
          onBurn={() => engineRef.current?.burn()}
          onToggleBoost={() => engineRef.current?.toggleBoost()}
          onNova={() => engineRef.current?.useNova()}
          onAnomaly={(text) => engineRef.current?.submitAnomaly(text)}
          onLanes={(fractions) => engineRef.current?.setLaneFractions(fractions)}
        />
      ) : null}

      {shown ? <ShareCard round={round} summary={shown} onReplay={replayRun} /> : null}
      {debug && debugInfo ? <DebugStats info={debugInfo} /> : null}
    </div>
  );
}

/**
 * Snapshot cache for `useSyncExternalStore`: the store must hand back the
 * same object for the same state or React will loop. Storage itself is only
 * ever written by this component, so the cache is the truth once warm.
 */
const storedCache = new Map<string, RunSummary | null>();

function storedRun(date: string): RunSummary | null {
  if (!storedCache.has(date)) storedCache.set(date, loadRun(date));
  return storedCache.get(date) ?? null;
}

function subscribeStorage(): () => void {
  return () => {};
}
