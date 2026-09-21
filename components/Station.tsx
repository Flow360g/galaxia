"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Orbit } from "@/lib/game/Orbit";
import { StationFeed } from "./StationFeed";
import { StationHail } from "./StationHail";
import type { EarthQuestion, GameState } from "@/lib/game/types";
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const orbit = new Orbit(container);
    orbit.start();
    return () => orbit.dispose();
  }, []);

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
