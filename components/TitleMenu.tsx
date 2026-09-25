"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { isMenuMuted, setMenuMuted, subscribeMenuMuted } from "@/lib/game/menuMusic";
import type { Round } from "@/lib/game/types";
import { Briefing } from "./Briefing";
import styles from "./TitleMenu.module.css";

/**
 * The three things on the title screen that are not Press Start: the ship
 * bay, the profile (the player's record and today's round), and how to play:
 * the whole rulebook, end to end, for anyone who wants it before flying.
 * Under them, the SOUND toggle for the menu music, the same switch the run
 * has in its top band.
 *
 * A client component only because the rulebook is an overlay with state. The
 * bay and the profile are plain links, so a shared link still lands one tap
 * from flying and nothing here gets in front of that. `?round=` carries
 * through to the profile so it shows the same round the title does.
 */
export function TitleMenu({ round, query = "" }: { round: Round; query?: string }) {
  const [briefing, setBriefing] = useState(false);
  // The menus have music, so they have the off switch too. Server-rendered
  // as on; the stored choice arrives on hydration.
  const muted = useSyncExternalStore(subscribeMenuMuted, isMenuMuted, () => false);

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
          How to play
        </button>
      </nav>

      <button
        type="button"
        className={`${styles.sound} ${muted ? styles.soundOff : ""} arcade`}
        onClick={() => setMenuMuted(!muted)}
        aria-pressed={muted}
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
        data-testid="menu-sound"
      >
        {muted ? "Sound off" : "Sound on"}
      </button>

      {briefing ? (
        <Briefing round={round} onDone={() => setBriefing(false)} />
      ) : null}
    </>
  );
}
