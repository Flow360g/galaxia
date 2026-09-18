/**
 * Display formatting for HUD figures.
 *
 * Numbers are set in mono with tabular figures, so these only need to decide
 * magnitude and precision, never padding.
 */

/** World units read as kilometres. 1 unit = 1km keeps the numbers legible. */
export function formatDistance(units: number): string {
  const km = Math.floor(units);
  if (km < 1000) return `${km}`;
  return km.toLocaleString("en-AU");
}

export function formatSpeed(speed: number): string {
  return `${Math.round(speed)}`;
}

/** Round number as a zero-padded sequence, e.g. 001. */
export function formatRoundNumber(round: number): string {
  return `${round}`.padStart(3, "0");
}
