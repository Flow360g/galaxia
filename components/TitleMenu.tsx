"use client";

import Link from "next/link";
import { useState } from "react";
import type { Round } from "@/lib/game/types";
import { Briefing } from "./Briefing";
import styles from "./TitleMenu.module.css";

/**
 * The two things on the title screen that are not Press Start: the ship bay,
 * and the briefing again.
 *
 * A client component only because the briefing is an overlay with state. The
 * bay is a plain link, so a shared link still lands one tap from flying and
 * nothing here gets in front of that.
 */
export function TitleMenu({ round }: { round: Round }) {
  const [briefing, setBriefing] = useState(false);

  return (
    <>
      <nav className={styles.nav}>
        <Link href="/hangar" className={`${styles.item} arcade`} data-testid="view-ship">
          View ship
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
