"use client";

import { useEffect, useRef } from "react";
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
 * The band at the top follows the HUD's rule: sized by its contents, capped
 * well short of the middle, and nothing of it over the lower half of the
 * screen, which is the scene's. The satellite feed is a placeholder here;
 * the imagery is the next build.
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
        <div className={styles.band}>
          <section className={styles.panel}>
            <div className={styles.head}>
              <span className={`${styles.tag} arcade`}>WHERE ON EARTH</span>
              <span className={`${styles.phase} arcade`}>PHASE {phase}</span>
            </div>
            <h2 className={`${styles.title} arcade`}>SATELLITE FEED</h2>

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
