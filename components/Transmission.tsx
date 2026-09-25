"use client";

import Image from "next/image";
import { useCallback, useEffect } from "react";
import type { Transmission as Script } from "@/lib/game/phases";
import { useTyped } from "./useTyped";
import styles from "./Transmission.module.css";

interface Props {
  script: Script;
  /** The eyebrow: INCOMING or DEBRIEF. */
  kind: "incoming" | "debrief";
  /**
   * Drop in as a banner across the top of the screen instead of a modal, so
   * the ship flying underneath stays in view. The Mayday uses it: the run is
   * in standby behind it (see `Run.standby`), and the call reads as coming in
   * mid-flight rather than on a loading screen.
   */
  banner?: boolean;
  onDone: () => void;
}

/**
 * A message from Earth Command, the way a ship would get one: an eyebrow, a
 * signal strip, the face on the other end, and the words arriving one
 * character at a time (see `useTyped`, shared with Sergeant Soap's hail on
 * the satellite feed).
 *
 * A small modal (or, for the Mayday, a banner over the flying ship) rather
 * than a page. It sets the tone and gets out of the way:
 * a tap while the text is still arriving lands all of it, and a tap once it
 * has landed closes it. It is shown before the launch card on a first flight
 * and after the tally on a run that saved Earth, and never against a clock.
 */
export function Transmission({ script, kind, banner = false, onDone }: Props) {
  const speaker = script.speaker;
  const { shown: lines, active, landed, skip } = useTyped(script.lines);

  const tap = useCallback(() => {
    if (landed) onDone();
    else skip();
  }, [landed, onDone, skip]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Escape") return;
      event.preventDefault();
      if (event.key === "Escape") onDone();
      else tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap, onDone]);

  return (
    <div
      className={banner ? styles.banner : styles.overlay}
      data-testid="transmission"
      data-landed={String(landed)}
      role="dialog"
      aria-modal={banner ? undefined : "true"}
      aria-label={kind === "incoming" ? "Incoming transmission" : "Debrief"}
      onClick={banner ? undefined : tap}
    >
      <div className={styles.panel} onClick={banner ? tap : undefined}>
        <header className={styles.header}>
          <span className={`${styles.eyebrow} arcade`}>
            {kind === "incoming" ? "INCOMING TRANSMISSION" : "DEBRIEF"}
            {speaker ? null : <> &middot; {script.from}</>}
          </span>
          <span className={styles.signal} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </header>
        {speaker ? (
          <div className={styles.speaker}>
            <span className={styles.portrait} data-testid="transmission-portrait">
              <Image
                src={speaker.portrait}
                width={speaker.width}
                height={speaker.height}
                alt=""
                aria-hidden="true"
                sizes="80px"
                priority
              />
              <i className={styles.scan} aria-hidden="true" />
            </span>
            <span className={styles.who}>
              <span className={`${styles.name} arcade`}>{speaker.name}</span>
              <span className={styles.from}>{script.from}</span>
            </span>
          </div>
        ) : null}

        <div className={styles.body} aria-live="polite">
          {lines.map((line, index) =>
            line ? (
              <p key={index} className={styles.line}>
                {line}
                {!landed && index === active ? <span className={styles.cursor} aria-hidden="true" /> : null}
              </p>
            ) : null,
          )}
        </div>
        <button
          type="button"
          className={`${styles.ack} ${landed ? styles.ackReady : ""} arcade`}
          onClick={(event) => {
            event.stopPropagation();
            tap();
          }}
          data-testid="transmission-ack"
        >
          {landed ? (kind === "incoming" ? "ACKNOWLEDGE" : "TAP TO CONTINUE") : "SKIP"}
        </button>
      </div>
    </div>
  );
}
