"use client";

import { useEffect, useRef, useState } from "react";
import {
  EARTH_LOST_TRANSMISSION,
  EARTH_SAVED_TRANSMISSION,
  type Transmission as Script,
} from "@/lib/game/phases";
import { EndingScene } from "@/lib/mock/ending";
import { Transmission } from "./Transmission";
import styles from "./EndingMock.module.css";

/** When Sergeant Soap's banner drops in, once the pull is under way. */
const BANNER_MS = 1400;

/**
 * What Soap says over the fleet, by landing sites named. Mock copy: the win
 * points at the ships so the words and the picture land together.
 */
const SCRIPTS: Record<0 | 1 | 2, Script> = {
  2: {
    ...EARTH_SAVED_TRANSMISSION,
    lines: [
      "Earth Command to pilot. Both landing sites confirmed.",
      "Every ship we have is on its way. Look at them go.",
      "You saved Earth today. Same sky tomorrow.",
    ],
  },
  1: {
    ...EARTH_SAVED_TRANSMISSION,
    lines: [
      "Earth Command to pilot. One landing site confirmed.",
      "A squadron is on its way there. The other site is still dark.",
      "Same sky tomorrow, and we need you back.",
    ],
  },
  0: EARTH_LOST_TRANSMISSION,
};

/**
 * MOCK: the end of a run. The station screen pulls back to show Earth and the
 * fleet going in, with Sergeant Soap as a banner across the top instead of a
 * modal over everything. The controls at the foot are the mock's own and
 * would not ship.
 */
export function EndingMock({ initialSites }: { initialSites: 0 | 1 | 2 }) {
  const stage = useRef<HTMLDivElement>(null);
  const [sites, setSites] = useState<0 | 1 | 2>(initialSites);
  const [take, setTake] = useState(0);
  const [banner, setBanner] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const container = stage.current;
    if (!container) return;
    const scene = new EndingScene(container, sites);
    scene.start();
    (window as unknown as { galaxiaEnding?: EndingScene }).galaxiaEnding = scene;
    setBanner(false);
    setDone(false);
    // On the scene's own clock, so the banner lands at the same point in the
    // pull on a slow device as on a fast one.
    const timer = window.setInterval(() => {
      if (scene.debugState().elapsed * 1000 >= BANNER_MS) {
        setBanner(true);
        window.clearInterval(timer);
      }
    }, 50);
    return () => {
      window.clearInterval(timer);
      scene.dispose();
    };
  }, [sites, take]);

  return (
    <div className={styles.shell}>
      <div ref={stage} className={styles.stage} data-testid="ending-stage" />

      {banner && !done ? (
        <Transmission
          key={`${sites}-${take}`}
          script={SCRIPTS[sites]}
          kind="debrief"
          banner
          onDone={() => setDone(true)}
        />
      ) : null}

      {done ? (
        <div className={`${styles.next} arcade`} data-testid="ending-next">
          The share card opens here
        </div>
      ) : null}

      <div className={styles.controls}>
        <span className={`${styles.label} arcade`}>Mock · sites named</span>
        {([2, 1, 0] as const).map((n) => (
          <button
            key={n}
            type="button"
            className={`${styles.chip} ${n === sites ? styles.chipOn : ""} arcade`}
            onClick={() => {
              setSites(n);
              setTake((t) => t + 1);
            }}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.chip} arcade`}
          onClick={() => setTake((t) => t + 1)}
          data-testid="ending-replay"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
