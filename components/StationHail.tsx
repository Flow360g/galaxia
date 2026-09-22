"use client";

import Image from "next/image";
import { useCallback, useEffect } from "react";
import { SITE_HAIL } from "@/lib/game/phases";
import { STATION } from "@/lib/game/Tuning";
import { useTyped } from "./useTyped";
import styles from "./StationHail.module.css";

interface Props {
  /** Whether the feed under it is up. False while the hail has the screen. */
  open: boolean;
  /** Bring the feed and its clock up. Called once. */
  onOpen: () => void;
}

/**
 * Sergeant Soap on the satellite feed: the standing order, typed in.
 *
 * It replaced a one-line heading that said the same thing in the game's own
 * words, and it earns the pixels by arriving on its own. The panel opens with
 * nothing else on it, the order types itself out in the same voice that called
 * the Mayday in, and the feed comes up a beat after the last word. Nothing is
 * played against the clock here: the answer clock is held with the feed (see
 * `Station`), so reading this costs nothing.
 *
 * A tap while the words are still arriving lands them, and a tap once they
 * have landed opens the feed without waiting out the beat, exactly as the
 * mission transmission behaves. After that the strip stays at the top of the
 * panel, said and done, and the second site of the dock does not re-type it.
 */
export function StationHail({ open, onOpen }: Props) {
  const speaker = SITE_HAIL.speaker;
  const { shown, landed, skip } = useTyped(SITE_HAIL.lines);
  const line = shown[0] ?? "";

  // The beat after the last word, then the feed comes up on its own. A player
  // who taps never waits it out; a player who does not never has to tap.
  useEffect(() => {
    if (open || !landed) return;
    const id = window.setTimeout(onOpen, STATION.hailHoldSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [open, landed, onOpen]);

  const tap = useCallback(() => {
    if (landed) onOpen();
    else skip();
  }, [landed, onOpen, skip]);

  // Desktop convenience only, like the run's number keys: nothing here is
  // reachable by keyboard alone that a tap cannot do.
  useEffect(() => {
    if (open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, tap]);

  return (
    <div className={styles.hail} data-testid="station-hail" data-open={String(open)}>
      {speaker ? (
        <span className={styles.portrait}>
          <Image
            src={speaker.portrait}
            width={speaker.width}
            height={speaker.height}
            alt=""
            aria-hidden="true"
            sizes="52px"
            priority
          />
          <i className={styles.scan} aria-hidden="true" />
        </span>
      ) : null}

      <div className={styles.who}>
        <span className={`${styles.name} arcade`}>{speaker?.name ?? SITE_HAIL.from}</span>
        <p className={styles.words} aria-live="polite" data-testid="station-order">
          {line}
          {!landed ? <span className={styles.cursor} aria-hidden="true" /> : null}
        </p>
      </div>

      {/* The whole panel takes the tap while the order is arriving. It is
          positioned against `.panel` in Station.module.css, which is why that
          rule carries a `position: relative` it would not otherwise need. */}
      {!open ? (
        <button
          type="button"
          className={styles.catcher}
          onClick={tap}
          aria-label="Continue"
          data-testid="hail-catcher"
        >
          <span className={`${styles.prompt} arcade`}>
            {landed ? "TAP TO CONTINUE" : "SKIP"}
          </span>
        </button>
      ) : null}
    </div>
  );
}
