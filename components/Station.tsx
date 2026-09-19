"use client";

import { useEffect, useRef } from "react";
import { Orbit } from "@/lib/game/Orbit";
import styles from "./Station.module.css";

interface Props {
  /** The phase number the run is on, for the rail. */
  phase: number;
  /**
   * Whether the feed panel and END TRANSMISSION are up. Off once the run has
   * ended, so the tally and the share card sit over the bare scene.
   */
  showPanel: boolean;
  /** END TRANSMISSION: resolve the encounter and end the run. */
  onEnd: () => void;
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
export function Station({ phase, showPanel, onEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const orbit = new Orbit(container);
    orbit.start();
    return () => orbit.dispose();
  }, []);

  // Desktop convenience only; the button is the real target.
  useEffect(() => {
    if (!showPanel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onEnd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPanel, onEnd]);

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

      {showPanel ? (
        <div className={styles.band}>
          <section className={styles.panel}>
            <div className={styles.head}>
              <span className={`${styles.tag} arcade`}>WHERE ON EARTH</span>
              <span className={`${styles.phase} arcade`}>PHASE {phase}</span>
            </div>
            <h2 className={`${styles.title} arcade`}>SATELLITE FEED</h2>

            <div className={styles.feed} data-testid="feed" aria-live="polite">
              <span className={styles.scanlines} aria-hidden="true" />
              <span className={`${styles.standby} arcade`}>
                LINK STANDING BY<span className={styles.cursor}>_</span>
              </span>
            </div>

            <p className={styles.copy}>
              Docked at Wikiplanet Station. Uplink established, imagery not on this build yet.
              The fleet is holding for your call.
            </p>

            <button
              type="button"
              className={`${styles.end} arcade`}
              onClick={onEnd}
              data-testid="end-transmission"
            >
              END TRANSMISSION
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
