import { DAILY } from "@/lib/game/Tuning";

/**
 * The daily clock: which round is live, and when the next one goes up.
 *
 * Pure and dependency free (the zone maths is `Intl`), so the server picks
 * the round and the title screen's countdown agree on the same instant. It
 * used to be the host's own midnight, which on a server is UTC: the round
 * turned over at 10am in Melbourne and nobody had chosen that.
 */

const HOUR_MS = 3_600_000;

/** The wall clock in `DAILY.zone` at an instant, as calendar fields. */
function wall(at: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DAILY.zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: field("year"),
    month: field("month"),
    day: field("day"),
    hour: field("hour"),
    minute: field("minute"),
    second: field("second"),
  };
}

/** How far `DAILY.zone` runs ahead of UTC at an instant, in milliseconds. */
function offset(at: number): number {
  const w = wall(at);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

function key(year: number, month: number, day: number): string {
  // Normalise through UTC so the day after the 30th of September is October.
  const date = new Date(Date.UTC(year, month - 1, day));
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${date.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The live round's date as YYYY-MM-DD. Before `DAILY.resetHour` it is the
 * zone's calendar date; from it on, the next one.
 */
export function roundKey(now: Date = new Date()): string {
  const w = wall(now.getTime());
  const ahead = DAILY.resetHour > 0 && w.hour >= DAILY.resetHour ? 1 : 0;
  return key(w.year, w.month, w.day + ahead);
}

/** The instant (epoch ms) the next round goes live. */
export function nextRoundAt(now: Date = new Date()): number {
  const at = now.getTime();
  const w = wall(at);
  const day = w.hour >= DAILY.resetHour ? w.day + 1 : w.day;
  // The reset as a wall time read as if it were UTC, then pulled back by the
  // zone's offset. Twice, because the offset at the reset can differ from
  // the offset now when daylight saving changes overnight.
  const target = Date.UTC(w.year, w.month - 1, day, DAILY.resetHour);
  let guess = target - offset(at);
  guess = target - offset(guess);
  return guess > at ? guess : guess + 24 * HOUR_MS;
}

/**
 * A round date moved by whole days, as YYYY-MM-DD. What the day streak walks
 * back along: round dates are calendar days on one clock for everyone, so
 * the day before a round is simply the date before it. An unreadable key
 * comes back unchanged.
 */
export function shiftDay(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return key(Number(match[1]), Number(match[2]), Number(match[3]) + days);
}
