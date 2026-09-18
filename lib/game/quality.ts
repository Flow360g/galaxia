import { PERF } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Picks a starting quality tier from what the device advertises, then lets the
 * engine downgrade once it has measured real frame times.
 *
 * Device hints are a rough signal at best, so they only choose the starting
 * point. The measured downgrade in `QualityGovernor` is what actually protects
 * the framerate.
 */
export function detectTier(): QualityTier {
  if (typeof navigator === "undefined") return 1;

  const cores = navigator.hardwareConcurrency ?? 4;
  // deviceMemory is Chromium-only; absent on Safari, hence the fallback.
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;

  if (memory !== undefined && memory <= 2) return 2;
  if (cores <= 4) return 2;
  if (memory !== undefined && memory <= 4) return 1;
  if (cores <= 6) return 1;
  return 0;
}

/** Device pixel ratio for a tier, capped so 3x phones don't render 9x pixels. */
export function dprForTier(tier: QualityTier): number {
  if (typeof window === "undefined") return 1;
  const cap = PERF.dprCap[tier] ?? 1;
  return Math.min(window.devicePixelRatio || 1, cap);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Watches rolling frame time and reports when the current tier is too
 * expensive. Only ever downgrades: oscillating between tiers mid-flight is
 * more distracting than simply running one notch lower.
 */
export class QualityGovernor {
  private accumulated = 0;
  private frames = 0;
  private elapsed = 0;
  private settled = false;

  constructor(private tier: QualityTier) {}

  get current(): QualityTier {
    return this.tier;
  }

  /**
   * Feed one frame. Returns the new tier if a downgrade just happened,
   * otherwise null.
   */
  sample(frameMs: number): QualityTier | null {
    if (this.settled || this.tier >= 2) return null;

    this.accumulated += frameMs;
    this.frames += 1;
    this.elapsed += frameMs / 1000;

    if (this.elapsed < PERF.sampleSeconds) return null;

    const average = this.accumulated / Math.max(this.frames, 1);
    this.accumulated = 0;
    this.frames = 0;
    this.elapsed = 0;

    if (average > PERF.frameBudgetMs) {
      this.tier = (this.tier + 1) as QualityTier;
      return this.tier;
    }

    // Held budget through a full window: stop second-guessing the device.
    this.settled = true;
    return null;
  }
}
