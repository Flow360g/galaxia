import { AudioEngine } from "./Audio";
import { AUDIO } from "./Tuning";
import { loadMuted, saveMuted } from "./storage";

/**
 * The music under the menus: the title, the ship bay and the profile. One
 * engine for the whole app, held here rather than in a component, because the
 * root layout drives it by route and the title's SOUND toggle has to reach the
 * same one.
 *
 * It is created on the first menu screen and disposed on the way into a run,
 * which builds its own. Two contexts alive at once is a waste on any phone
 * and on iOS it is a limit. The mute is the game's own (`galaxia:muted`), so
 * turning sound off in either place turns it off in both.
 */

let engine: AudioEngine | null = null;
let muted: boolean | null = null;
const listeners = new Set<() => void>();

/** Start the menu music, or keep it going across a menu-to-menu move. */
export function playMenuMusic(): void {
  if (!engine) {
    // Read afresh: the run's own toggle may have changed it since.
    muted = loadMuted();
    for (const listener of listeners) listener();
    engine = new AudioEngine(muted, "menu");
    engine.init();
  }
  engine.setRunning(true);
}

/** Fade it and let the context go. Called on the way into a run. */
export function stopMenuMusic(): void {
  const current = engine;
  if (!current) return;
  engine = null;
  current.setRunning(false);
  // Let the fade finish before the context closes under it.
  setTimeout(() => current.dispose(), AUDIO.menu.fadeSeconds * 1000);
}

export function isMenuMuted(): boolean {
  if (muted === null) muted = loadMuted();
  return muted;
}

/** The title's SOUND toggle. Called from a tap, so it can unlock on iOS. */
export function setMenuMuted(next: boolean): void {
  muted = next;
  saveMuted(next);
  engine?.setMuted(next);
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore`. */
export function subscribeMenuMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
