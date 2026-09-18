/**
 * Display formatting for HUD figures.
 *
 * Numbers are set in mono with tabular figures, so these only need to decide
 * magnitude and precision, never padding.
 */

/** Distance in km, grouped. */
export function formatDistance(km: number): string {
  return Math.floor(Math.max(0, km)).toLocaleString("en-AU");
}

/** Velocity in km/h, grouped. */
export function formatVelocity(kmh: number): string {
  return Math.round(Math.max(0, kmh)).toLocaleString("en-AU");
}

/** Signed velocity change, e.g. +1,240 or -3,900. */
export function formatDelta(kmh: number): string {
  const rounded = Math.round(kmh);
  const sign = rounded < 0 ? "-" : "+";
  return `${sign}${Math.abs(rounded).toLocaleString("en-AU")}`;
}

/** Round number as a zero-padded sequence, e.g. 001. */
export function formatRoundNumber(round: number): string {
  return `${round}`.padStart(3, "0");
}
