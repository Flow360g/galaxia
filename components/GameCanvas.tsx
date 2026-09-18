"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Engine } from "@/lib/game/Engine";
import type { DebugInfo, GameState, Round, RunSummary } from "@/lib/game/types";
import {
  clearRun,
  loadBriefed,
  loadFlown,
  loadMuted,
  loadRun,
  saveBriefed,
  saveMuted,
  saveRun,
} from "@/lib/game/storage";
import { selectedShip } from "@/lib/game/ships";
import { Briefing } from "./Briefing";
import { Hud } from "./Hud";
import { ShareCard } from "./ShareCard";
import { DebugStats } from "./DebugStats";
import styles from "./GameCanvas.module.css";

interface Props {
  round: Round;
  debug: boolean;
  /**
   * Skip the stored run and fly again regardless. A dev and QA hatch, so it
   * also skips the first-flight briefing: a tester re-flying a round is not
   * a new player.
   */
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
   * Sound on or off, remembered between runs. Reading storage in the lazy
   * initialiser is safe here: the HUD this feeds is never rendered on the
   * server or on the hydrating pass, since `stored` is undefined until then.
   */
  const [muted, setMuted] = useState(loadMuted);
  const mutedRef = useRef(muted);
  /**
   * The hull to fly, resolved once. Read the same way as `muted`: the shell
   * owns storage, the engine is handed the answer. Changing ships mid-run is
   * not a thing, so this never updates.
   */
  const [ship] = useState(selectedShip);
  /** Dismissed this visit, by reading the briefing through or skipping it. */
  const [briefed, setBriefed] = useState(false);
  /**
   * Today's stored run, if any. `undefined` on the server and until hydration
   * so the engine never starts before storage has been checked.
   */
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => (replay ? null : storedRun(round.date)),
    () => undefined,
  );
  /**
   * Whether this device has never flown and has never read the briefing.
   * `undefined` until hydration, like `stored`, so the engine cannot start
   * behind a briefing that is about to appear.
   */
  const unbriefed = useSyncExternalStore(
    subscribeStorage,
    () => (replay ? false : loadFlown() === 0 && !loadBriefed()),
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

  /** The briefing holds the run back until it is closed. */
  const briefing = unbriefed === true && !briefed;
  const playing = stored === null && summary === null && !briefing;

  const closeBriefing = useCallback(() => {
    saveBriefed(true);
    setBriefed(true);
  }, []);

  const toggleSound = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      mutedRef.current = next;
      saveMuted(next);
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    // `undefined` on either of these means storage has not been read yet.
    if (!container || stored !== null || unbriefed !== false) return;

    const engine = new Engine({
      container,
      round,
      ship,
      // Read through the ref: a change of mind mid-run goes to `setMuted` on
      // the live engine, and must never remount it.
      muted: mutedRef.current,
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
  }, [round, debug, stored, unbriefed, ship, attempt, handleState, handleRunEnd]);

  const replayRun = useCallback(() => {
    clearRun(round.date);
    storedCache.set(round.date, null);
    setSummary(null);
    setState(null);
    setAttempt((n) => n + 1);
  }, [round.date]);

  const shown = summary ?? stored ?? null;

  return (
    <div className={styles.shell}>
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
          onAim={(t) => engineRef.current?.aim(t)}
          onLockVector={() => engineRef.current?.lockVector()}
          onToggleBoost={() => engineRef.current?.toggleBoost()}
          onNova={() => engineRef.current?.useNova()}
          onAnomaly={(text) => engineRef.current?.submitAnomaly(text)}
          onLanes={(fractions) => engineRef.current?.setLaneFractions(fractions)}
          muted={muted}
          onToggleSound={toggleSound}
        />
      ) : null}

      {briefing ? (
        <Briefing round={round} onDone={closeBriefing} firstFlight />
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
