"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Engine } from "@/lib/game/Engine";
import { isMaxThrust } from "@/lib/game/Flight";
import { preloadFeed } from "@/lib/game/prefetch";
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
import {
  EARTH_SAVED_TRANSMISSION,
  MISSION_TRANSMISSION,
  earthSaved,
} from "@/lib/game/phases";
import { Briefing } from "./Briefing";
import { Ready } from "./Ready";
import { Transmission } from "./Transmission";
import { Hud } from "./Hud";
import { Station } from "./Station";
import { ScoreTally } from "./ScoreTally";
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
  /**
   * The scorecard sits between the last encounter and the share card, and only
   * for a run just flown. Coming back to a stored run goes straight to the
   * card: the tally is the moment the points land, and that moment has passed.
   */
  const [tallied, setTallied] = useState(false);
  /** Bumped to remount the engine for a fresh run. */
  const [attempt, setAttempt] = useState(0);
  /**
   * READY has been pressed. The engine is held back until it is: the run
   * starts when the player says so, and the countdown runs over the engines
   * lighting once it does.
   */
  const [launched, setLaunched] = useState(false);
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
   * The mission transmission is up. It follows the briefing on a first flight
   * and sits between it and the launch card: the Mayday that says why the
   * ship is out here at all, before the card says what Phase 1 is.
   */
  const [transmission, setTransmission] = useState(false);
  /**
   * The debrief after the tally has been read. Only a run that named every
   * landing site gets one, and the share card waits behind it.
   */
  const [debriefed, setDebriefed] = useState(false);
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
  //
  // The throttle is for the figures that merely tick along -- distance,
  // velocity, thrust. Anything the player just caused has to land on the next
  // frame instead: a tapped square that stays lit for another 80ms reads as
  // the game lagging behind the thumb. `beat` is a cheap signature of
  // everything a player action changes, and a change in it jumps the queue.
  const lastStateEmit = useRef(0);
  const lastBeat = useRef("");
  const handleState = useCallback((next: GameState) => {
    const beat = stateBeat(next);
    const now = performance.now();
    if (beat === lastBeat.current && now - lastStateEmit.current < 80) return;
    lastBeat.current = beat;
    lastStateEmit.current = now;
    setState(next);
  }, []);

  // The hull is stamped on the summary here rather than inside the run,
  // which is pure and has no business knowing what the player picked. It is
  // cosmetic: the results card draws it and nothing else reads it.
  const handleRunEnd = useCallback(
    (result: RunSummary) => {
      const flown: RunSummary = { ...result, shipId: ship.id };
      saveRun(flown);
      storedCache.set(flown.date, flown);
      setTallied(false);
      setSummary(flown);
    },
    [ship],
  );

  /** The briefing holds the run back until it is closed. */
  const briefing = unbriefed === true && !briefed;
  /** Then the launch card holds it back until READY. */
  const readying =
    !briefing && !transmission && !launched && stored === null && summary === null;
  const playing = stored === null && summary === null && !briefing && launched;

  /**
   * WHERE ON EARTH is six questions away when the run launches, and its
   * photographs and tiles take seconds to arrive. Fetch them now, while the
   * player is flying, so a bought hint or a zoom step paints at once. Only for
   * a run being flown: a returning player looking at the share card does not
   * download a megabyte of imagery.
   */
  useEffect(() => {
    if (playing) preloadFeed(round);
  }, [playing, round]);

  const closeBriefing = useCallback(() => {
    saveBriefed(true);
    setBriefed(true);
    setTransmission(true);
  }, []);
  const closeTransmission = useCallback(() => setTransmission(false), []);
  const closeDebrief = useCallback(() => setDebriefed(true), []);
  /** The debrief is owed only to a run just flown that saved Earth. */
  const debrief = summary !== null && tallied && !debriefed && earthSaved(round, summary);

  const launch = useCallback(() => setLaunched(true), []);
  // WHERE ON EARTH, played at the station. The engine is parked while docked,
  // so each of these pushes a fresh state frame of its own.
  const feedReady = useCallback(() => engineRef.current?.feedArrived(), []);
  const buyIntel = useCallback(() => engineRef.current?.buyIntel(), []);
  const setOptics = useCallback((step: number) => engineRef.current?.setOptics(step), []);
  const submitSite = useCallback((text: string) => engineRef.current?.submitSite(text), []);
  const nextSite = useCallback(() => engineRef.current?.nextSite(), []);

  /**
   * WHERE ON EARTH: aboard the station. Gated on the run's phase rather than
   * on `playing`, because the station screen stays up as the backdrop for the
   * tally and the share card: the run ends from inside it, and the last state
   * the engine emits is the docked one.
   */
  const docked = state?.phase === "docked";
  const current = state ? round.questions[state.encounter] : undefined;
  const earthQuestion = current?.type === "earth" ? current : null;
  /** Whether a second site follows this one, for the continue button's wording. */
  const moreSites =
    state !== null && round.questions[state.encounter + 1]?.type === "earth";
  const stages = round.stages ?? [];
  const stationPhase = stages[stages.length - 1]?.phase ?? stages.length;

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
    if (!container || stored !== null || unbriefed !== false || !launched) return;

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
  }, [round, debug, stored, unbriefed, ship, attempt, launched, handleState, handleRunEnd]);

  const replayRun = useCallback(() => {
    clearRun(round.date);
    storedCache.set(round.date, null);
    setSummary(null);
    setTallied(false);
    setDebriefed(false);
    setState(null);
    setLaunched(false);
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

      {playing && !docked ? (
        <Hud
          state={state}
          round={round}
          onAnswer={(option) => engineRef.current?.answer(option)}
          onPick={(lane) => engineRef.current?.pick(lane)}
          onReady={() => engineRef.current?.ready()}
          onBurn={() => engineRef.current?.burn()}
          onAim={(t) => engineRef.current?.aim(t)}
          onLockVector={() => engineRef.current?.lockVector()}
          onToggleBoost={() => engineRef.current?.toggleBoost()}
          onNova={() => engineRef.current?.useNova()}
          onEnterStation={() => engineRef.current?.enterStation()}
          onConfirm={() => engineRef.current?.confirm()}
          onLanes={(fractions) => engineRef.current?.setLaneFractions(fractions)}
          muted={muted}
          onToggleSound={toggleSound}
        />
      ) : null}

      {docked ? (
        <Station
          phase={stationPhase}
          showPanel={summary === null}
          question={earthQuestion}
          state={state}
          more={moreSites}
          onFeedReady={feedReady}
          onBuyIntel={buyIntel}
          onOptics={setOptics}
          onSubmit={submitSite}
          onNext={nextSite}
        />
      ) : null}

      {briefing ? (
        <Briefing round={round} onDone={closeBriefing} firstFlight />
      ) : null}

      {transmission && !briefing ? (
        <Transmission script={MISSION_TRANSMISSION} kind="incoming" onDone={closeTransmission} />
      ) : null}

      {readying ? <Ready round={round} onReady={launch} /> : null}

      {summary && !tallied ? (
        <ScoreTally summary={summary} onDone={() => setTallied(true)} />
      ) : null}

      {debrief ? (
        <Transmission script={EARTH_SAVED_TRANSMISSION} kind="debrief" onDone={closeDebrief} />
      ) : null}

      {shown && !debrief && (tallied || summary === null) ? (
        <ShareCard round={round} summary={shown} onReplay={replayRun} />
      ) : null}
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

/**
 * Everything about a frame that a player action can change, as one string.
 * Compared against the last frame's to decide whether a state emit can wait
 * for the throttle or has to go through now. Cheap on purpose: it is built
 * every frame, so it stays primitives joined together and never touches the
 * figures that move on their own.
 */
function stateBeat(state: GameState): string {
  const cluster = state.cluster;
  return [
    state.phase,
    state.encounter,
    // The countdown: the numeral has to flip on the same frame as its pip,
    // not up to a sample later.
    state.countdown ?? -1,
    state.awaitingTap ? 1 : 0,
    // The door arms on the frame the station comes alongside, not a sample later.
    state.stationReady ? 1 : 0,
    state.boostArmed ? 1 : 0,
    state.novaLeft,
    state.nova ? 1 : 0,
    state.shields,
    state.pulse?.id ?? 0,
    cluster ? cluster.picked.length : -1,
    cluster ? cluster.charge : -1,
    cluster ? cluster.eliminated.length : -1,
    // A struck lane and the shield it cost land with the crack, not a sample later.
    cluster ? cluster.struck.length : -1,
    cluster ? cluster.shields : -1,
  ].join(":");
}
