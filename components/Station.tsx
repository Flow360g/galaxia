"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { PHASE_TITLE } from "@/lib/game/phaseTitles";
import { Orbit } from "@/lib/game/Orbit";
import { StationFeed } from "./StationFeed";
import type { EarthQuestion, GameState } from "@/lib/game/types";
import styles from "./Station.module.css";

interface Props {
  /** The phase number the run is on, for the rail. */
  phase: number;
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
 */
export function Station({
  phase,
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
            <div className={styles.head}>
              <span className={`${styles.tag} arcade`}>{PHASE_TITLE.earth}</span>
              <span className={`${styles.phase} arcade`}>PHASE {phase}</span>
            </div>
            <h2 className={`${styles.title} arcade`}>SATELLITE VIEW</h2>

            {/* Keyed on the site, so a new one starts with a clear box and dial. */}
            <StationFeed
              key={question.id}
              question={question}
              state={state}
              more={more}
              onFeedReady={onFeedReady}
              onBuyIntel={onBuyIntel}
              onOptics={onOptics}
              onSubmit={onSubmit}
              onNext={onNext}
            />
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
