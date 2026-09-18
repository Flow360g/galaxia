"use client";

import type { DebugInfo } from "@/lib/game/types";
import styles from "./DebugStats.module.css";

const TIER_NAME = ["HIGH", "MID", "LOW"] as const;

/**
 * Perf overlay, shown only with ?debug=1.
 *
 * Exists so the frame budget is observable on a real device rather than
 * inferred from a desktop profile. `data-testid` hooks let the Playwright
 * check assert the budget directly.
 */
export function DebugStats({ info }: { info: DebugInfo }) {
  return (
    <div className={styles.stats} data-testid="debug-stats">
      <Row label="FPS" value={info.fps.toFixed(0)} testId="debug-fps" />
      <Row label="Frame" value={`${info.frameMs.toFixed(1)}ms`} testId="debug-frame" />
      <Row label="Draws" value={`${info.drawCalls}`} testId="debug-draws" />
      <Row
        label="Tris"
        value={info.triangles.toLocaleString("en-AU")}
        testId="debug-tris"
      />
      <Row label="Tier" value={TIER_NAME[info.tier] ?? "?"} testId="debug-tier" />
      <Row label="DPR" value={info.dpr.toFixed(2)} testId="debug-dpr" />
    </div>
  );
}

function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.key}>{label}</span>
      <span className={`${styles.value} mono`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
