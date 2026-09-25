import { track } from "@vercel/analytics";

/**
 * The handful of moments worth counting, through Vercel Web Analytics:
 * cookieless, no accounts, nothing stored on the device. Page views come for
 * free from `<Analytics />` in the layout; these are the events a page view
 * cannot see, because a whole run happens on `/play`.
 *
 * Never load-bearing, like storage and sound: a blocked script or a thrown
 * error costs a data point, never a run. Practice runs are not counted.
 */
type Event =
  | { name: "Run started"; data: { round: number } }
  | {
      name: "Run finished";
      data: { round: number; score: number; tier: string; dayStreak: number; newBest: boolean };
    }
  | { name: "Shared"; data: { how: "share sheet" | "copied" | "saved" } };

export function trackEvent(event: Event): void {
  try {
    track(event.name, event.data);
  } catch {
    // Analytics is a nice to have.
  }
}
