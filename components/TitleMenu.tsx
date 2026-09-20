"use client";

import Link from "next/link";
import { useState } from "react";
import type { Round } from "@/lib/game/types";
import { Briefing } from "./Briefing";
import styles from "./TitleMenu.module.css";

/**
 * The three things on the title screen that are not Press Start: the ship
 * bay, the profile (the player's record and today's round), and the briefing
 * again.
 *
 * A client component only because the briefing is an overlay with state. The
 * bay and the profile are plain links, so a shared link still lands one tap
 * from flying and nothing here gets in front of that. `?round=` carries
 * through to the profile so it shows the same round the title does.
 */
export function TitleMenu({ round, query = "" }: { round: Round; query?: string }) {
  const [briefing, setBriefing] = useState(false);

  return (
    <>
      <nav className={styles.nav}>
        <Link href="/hangar" className={`${styles.item} arcade`} data-testid="view-ship">
          View ship
        </Link>
        <Link href={`/profile${query}`} className={`${styles.item} arcade`} data-testid="view-profile">
          Profile
        </Link>
        <button
          type="button"
          className={`${styles.item} arcade`}
          onClick={() => setBriefing(true)}
          data-testid="view-briefing"
        >
          Briefing
        </button>
      </nav>

      {briefing ? (
        <Briefing
          round={round}
          firstFlight={false}
          onDone={() => setBriefing(false)}
        />
      ) : null}
    </>
  );
}
