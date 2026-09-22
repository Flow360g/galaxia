"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * A message arriving one character at a time.
 *
 * Earth Command's voice is typed in wherever it is heard: the mission
 * transmission, the debrief and Sergeant Soap's hail on the satellite feed.
 * One implementation, so those three can never drift into three different
 * typing speeds.
 */

/** Milliseconds per character as the message comes in. */
export const TYPE_MS = 24;
/** Pause between lines, so each one lands as its own sentence. */
export const LINE_PAUSE_MS = 360;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export interface Typed {
  /** Each line, cut to what has arrived so far. */
  shown: string[];
  /** The line still arriving, for the cursor to sit on. -1 once it has landed. */
  active: number;
  /** Everything is on screen. */
  landed: boolean;
  /** Land the rest of it now. */
  skip: () => void;
}

/**
 * `lines` must be a stable array (a module constant, or memoised): it is a
 * dependency of the timer that steps the message along.
 */
export function useTyped(lines: string[]): Typed {
  const total = useMemo(() => lines.reduce((sum, line) => sum + line.length, 0), [lines]);
  // Under reduced motion the whole message is there from the first frame.
  const [count, setCount] = useState(() => (prefersReducedMotion() ? total : 0));
  const landed = count >= total;

  useEffect(() => {
    if (landed) return;
    // A pause at the end of each line, then on with the next.
    let boundary = 0;
    for (const line of lines) {
      boundary += line.length;
      if (count === boundary) break;
    }
    const wait = count > 0 && count === boundary ? LINE_PAUSE_MS : TYPE_MS;
    const id = window.setTimeout(() => setCount((current) => Math.min(current + 1, total)), wait);
    return () => window.clearTimeout(id);
  }, [count, landed, total, lines]);

  const skip = useCallback(() => setCount(total), [total]);

  // Split the count back into lines, so each sentence is its own block.
  const shown: string[] = [];
  let remaining = count;
  let active = -1;
  for (const [index, line] of lines.entries()) {
    const visible = line.slice(0, Math.max(0, Math.min(line.length, remaining)));
    if (active < 0 && visible.length < line.length) active = index;
    remaining -= line.length;
    shown.push(visible);
  }

  return { shown, active, landed, skip };
}
