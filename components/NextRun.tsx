"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { nextRoundAt } from "@/lib/content/clock";
import styles from "./NextRun.module.css";

/**
 * When the next round goes live, under the title menu: a countdown, and the
 * reset time on the player's own clock (midnight in Melbourne, the middle of
 * the afternoon in London). Both are worked out on the device, so the server
 * renders an empty line of the same height and nothing shifts on hydration.
 *
 * At zero it refreshes the page, so a player sitting on the title screen at
 * the turn of the day gets the new round without a reload.
 */
export function NextRun() {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const target = now === null ? null : nextRoundAt(new Date(now));
  const seen = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  // The target moves on the tick the reset passes: the day has turned, so
  // fetch the page again for the new round.
  useEffect(() => {
    if (target === null) return;
    if (seen.current !== null && target !== seen.current) router.refresh();
    seen.current = target;
  }, [target, router]);

  const left = now !== null && target !== null ? Math.max(0, target - now) : null;

  return (
    <p className={styles.line} data-testid="next-run">
      <span className={`${styles.label} arcade`}>Next run in</span>
      <span className={`${styles.clock} arcade`} data-testid="next-run-clock">
        {left === null ? "\u00a0" : countdown(left)}
      </span>
      <span className={styles.note}>
        {target === null ? "\u00a0" : `New questions every day at ${localTime(target)} your time.`}
      </span>
    </p>
  );
}

function countdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function localTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
