"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Transmission as Script } from "@/lib/game/phases";
import styles from "./Transmission.module.css";

interface Props {
  script: Script;
  /** The eyebrow: INCOMING or DEBRIEF. */
  kind: "incoming" | "debrief";
  onDone: () => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Milliseconds per character as the message comes in. */
const TYPE_MS = 24;
/** Pause between lines, so each one lands as its own sentence. */
const LINE_PAUSE_MS = 360;

/**
 * A message from Earth Command, the way a ship would get one: an eyebrow, a
 * signal strip, the face on the other end, and the words arriving one
 * character at a time.
 *
 * A small modal rather than a page. It sets the tone and gets out of the way:
 * a tap while the text is still arriving lands all of it, and a tap once it
 * has landed closes it. It is shown before the launch card on a first flight
 * and after the tally on a run that saved Earth, and never against a clock.
 */
export function Transmission({ script, kind, onDone }: Props) {
  const speaker = script.speaker;
  const total = useMemo(() => script.lines.reduce((sum, line) => sum + line.length, 0), [script]);
  // Under reduced motion the whole message is there from the first frame.
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? total : 0));
  const landed = shown >= total;

  useEffect(() => {
    if (landed) return;
    // A pause at the end of each line, then on with the next.
    let boundary = 0;
    for (const line of script.lines) {
      boundary += line.length;
      if (shown === boundary) break;
    }
    const wait = shown > 0 && shown === boundary ? LINE_PAUSE_MS : TYPE_MS;
    const id = window.setTimeout(() => setShown((current) => Math.min(current + 1, total)), wait);
    return () => window.clearTimeout(id);
  }, [shown, landed, total, script]);

  const tap = useCallback(() => {
    if (landed) onDone();
    else setShown(total);
  }, [landed, onDone, total]);

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

  // Split the shown count back into lines, so each sentence is its own block.
  // The cursor sits on the line still arriving.
  const lines: string[] = [];
  let remaining = shown;
  let active = -1;
  for (const [index, line] of script.lines.entries()) {
    const visible = line.slice(0, Math.max(0, Math.min(line.length, remaining)));
    if (active < 0 && visible.length < line.length) active = index;
    remaining -= line.length;
    lines.push(visible);
  }

  return (
    <div
      className={styles.overlay}
      data-testid="transmission"
      data-landed={String(landed)}
      role="dialog"
      aria-modal="true"
      aria-label={kind === "incoming" ? "Incoming transmission" : "Debrief"}
      onClick={tap}
    >
      <div className={styles.panel}>
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
