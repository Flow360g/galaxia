"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Orbit } from "@/lib/game/Orbit";
import { STATION } from "@/lib/game/Tuning";
import { StationFeed } from "./StationFeed";
import { StationHail } from "./StationHail";
import type { EarthQuestion, GameState, Outcome } from "@/lib/game/types";
import styles from "./Station.module.css";

interface Props {
  /**
   * Whether the feed panel is up. Off once the run has ended, so the tally and
   * the share card sit over the bare scene.
   */
  showPanel: boolean;
  /** The site on the feed, and the live run state it is played against. */
  question: EarthQuestion | null;
  state: GameState | null;
  /** Whether another site follows this one. */
  more: boolean;
  onFeedReady: () => void;
  onBuyIntel: () => void;
  onOptics: (step: number) => void;
  onSubmit: (text: string) => void;
  onNext: () => void;
  /**
   * The run's ending, once it is over: how many landing sites it named. The
   * scene pulls back and flies the fleet that bought (see `Orbit.reinforce`).
   * Null while the run is live.
   */
  ending: number | null;
}

/**
 * Aboard Wikiplanet Station: WHERE ON EARTH, after the dock.
 *
 * A full-bleed screen over the flight, with its own tiny three.js shell
 * (`Orbit`: the station over Earth) exactly as the hangar has `ShipBay`. The
 * flight engine parks underneath and is never seen again this run; this is
 * the backdrop for the tally and the share card too, which is why it is
 * gated on the run's phase rather than on whether the run is still live.
 *
 * The panel is the exception to the HUD's keep-out rule, and deliberately so.
 * That rule exists to leave the lower screen to the ship, and there is no ship
 * here: the flight is parked and the orbit scene is a backdrop. An optic, an
 * intel stack and a text input do not fit in the band's usual 62vh, so the
 * panel takes the screen and `StationFeed` scrolls inside itself. The page
 * still never scrolls, and the band lifts when the keyboard opens.
 *
 * The panel opens on Sergeant Soap and nothing else: he says what the job is,
 * the feed follows a beat later, and only then does the answer clock start.
 * That last part is what this component is holding: the feed's imagery settles
 * behind the hail as usual, but `onFeedReady` is not passed on until the hail
 * is done with the screen, so no site is ever read against a clock that
 * started while somebody was still talking.
 */
export function Station({
  showPanel,
  question,
  state,
  more,
  onFeedReady,
  onBuyIntel,
  onOptics,
  onSubmit,
  onNext,
  ending,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<Orbit | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const orbit = new Orbit(container);
    orbitRef.current = orbit;
    orbit.start();
    return () => {
      orbit.dispose();
      orbitRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ending !== null) orbitRef.current?.reinforce(ending);
  }, [ending]);

  /**
   * Whether the hail is done and the feed has the screen. Refs alongside the
   * state because both of these are read from callbacks that must not be
   * re-made on every change: the feed settling and the hail finishing race
   * each other, and whichever lands second is the one that starts the clock.
   */
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const settled = useRef(false);

  const feedSettled = useCallback(() => {
    settled.current = true;
    if (openRef.current) onFeedReady();
  }, [onFeedReady]);

  const openFeed = useCallback(() => {
    if (openRef.current) return;
    openRef.current = true;
    setOpen(true);
    if (settled.current) onFeedReady();
  }, [onFeedReady]);

  // The answer box sits right under the hail's TAP TO CONTINUE, and the feed
  // also opens on its own a beat after the last word. A tap landing as it
  // opens, or the second of a double tap, fell through to the box, focused it
  // and put the keyboard over half the screen before anyone had looked at the
  // photo. The box takes no taps until the feed has been up a moment.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setArmed(true), STATION.inputGuardMs);
    return () => window.clearTimeout(id);
  }, [open]);

  const keyboard = useSyncExternalStore(subscribeViewport, keyboardInset, () => 0);

  return (
    <div
      className={styles.station}
      data-testid="station"
      role="dialog"
      aria-modal="true"
      aria-label="Wikiplanet Station"
    >
      {/* Orbit creates and owns its canvas inside this container. */}
      <div ref={containerRef} className={styles.orbit} />

      {showPanel && question && state ? (
        <div className={styles.band} style={{ bottom: keyboard }}>
          <section className={styles.panel}>
            {/* The order, and nothing else until it has been said. The tag, the
                phase number, a second title and a hint count all stacked up
                here once and pushed the picture down the screen; the task is
                the only thing a player needs before they look. What the hints
                are and what they cost is said once, on the button that sells
                them. */}
            <StationHail open={open} onOpen={openFeed} />

            {/* Mounted from the start and merely hidden, so the tiles settle
                while Soap is talking rather than after him. Hidden this way
                and not with `display: none`: the optic measures its own width
                to lay the mosaic out, and a box of no width measures nothing. */}
            <div
              className={`${styles.rest} ${open ? styles.restOpen : ""}`}
              aria-hidden={!open}
            >
              {/* Keyed on the site, so a new one starts with a clear box and dial. */}
              <StationFeed
                key={question.id}
                question={question}
                state={state}
                more={more}
                armed={armed}
                onFeedReady={feedSettled}
                onBuyIntel={onBuyIntel}
                onOptics={onOptics}
                onSubmit={onSubmit}
                onNext={onNext}
              />
            </div>
          </section>
        </div>
      ) : null}

      {/* The verdict, over the lot. The panel says it too, at the foot of a
          scroll region with a photograph and five bought hints above it, where
          a tester read the answer and never saw what it scored. Keyed on the
          site so the second one punches in again, and lifted with the band
          when the keyboard is still up. */}
      {showPanel && question && state?.awaitingTap && state.outcome ? (
        <SiteVerdict key={question.id} outcome={state.outcome} lift={keyboard} />
      ) : null}
    </div>
  );
}

/**
 * What the site was worth, in the middle of the screen.
 *
 * The one figure that matters at the end of a site, said once and said loudly:
 * the panel's own line under it carries what was spent getting there and no
 * points at all, because the same number in two places reads as two.
 *
 * It clears itself rather than waiting for a tap. Nothing in the run advances
 * on a timer once a verdict is up and nothing here does either: the verdict,
 * the answer, the fact and NEXT PLACE all sit in the panel until the player is
 * done with them. This is the noise the moment makes, not the moment.
 */
function SiteVerdict({ outcome, lift }: { outcome: Outcome; lift: number }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setGone(true), STATION.verdictSeconds * 1000);
    return () => window.clearTimeout(id);
  }, []);
  if (gone) return null;

  const points = outcome.points ?? 0;
  const headline = outcome.correct ? "CORRECT" : outcome.timedOut ? "TOO SLOW" : "WRONG";

  return (
    <div
      className={styles.verdict}
      style={{ bottom: lift, animationDuration: `${STATION.verdictSeconds}s` }}
      data-testid="site-verdict"
      role="status"
    >
      <div className={`${styles.verdictCard} ${outcome.correct ? styles.won : styles.lost}`}>
        <span className={`${styles.verdictWord} arcade`}>{headline}</span>
        <span className={`${styles.verdictPoints} arcade`}>
          {points >= 0 ? "+" : ""}
          {points} POINTS
        </span>
      </div>
    </div>
  );
}

/**
 * How much of the screen the software keyboard has taken, in CSS pixels.
 *
 * WHERE ON EARTH is the game's only text input, and the screen it sits on is
 * `position: fixed`, so the browser cannot scroll it clear: on a phone the
 * keyboard would simply cover the input and the Send button. The visual
 * viewport shrinks when the keyboard opens while the layout viewport does not,
 * and the difference is exactly how far the band has to lift. Nothing here
 * matters on a desktop, where the inset stays 0.
 *
 * Read through `useSyncExternalStore` rather than an effect, so the server and
 * the first client render agree on 0 and nothing sets state during a commit.
 */
function subscribeViewport(onChange: () => void): () => void {
  const viewport = typeof window === "undefined" ? null : window.visualViewport;
  if (!viewport) return () => {};
  viewport.addEventListener("resize", onChange);
  // iOS scrolls the visual viewport as well as resizing it when a focused
  // input is brought into view, and the offset counts toward the inset.
  viewport.addEventListener("scroll", onChange);
  return () => {
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
  };
}

function keyboardInset(): number {
  const viewport = typeof window === "undefined" ? null : window.visualViewport;
  if (!viewport) return 0;
  const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
  // Rounded, so a fractional pixel of browser chrome cannot make every scroll
  // event a new snapshot and re-render the panel on a loop.
  return Math.max(0, Math.round(hidden));
}
