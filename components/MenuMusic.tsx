"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { playMenuMusic, stopMenuMusic } from "@/lib/game/menuMusic";

/**
 * Plays the menu music on every screen but a run. Mounted once in the root
 * layout, so it survives a move between the title, the ship bay and the
 * profile rather than restarting on each, and hands over to the run's own
 * engine on `/play`. Draws nothing.
 */
export function MenuMusic() {
  const pathname = usePathname();
  const menu = !pathname.startsWith("/play");

  useEffect(() => {
    if (menu) playMenuMusic();
    else stopMenuMusic();
  }, [menu]);

  useEffect(() => () => stopMenuMusic(), []);

  return null;
}
