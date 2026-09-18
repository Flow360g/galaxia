import type { Metadata } from "next";
import { Hangar } from "@/components/Hangar";

export const metadata: Metadata = {
  title: "Galaxia / Ship bay",
  description: "Your hull, on the deck. Pick what you fly today.",
};

/**
 * The ship bay, reached from the title screen before a run.
 *
 * `Hangar` is a client component and its scene touches `window` at
 * construction, so this page stays a server component and renders nothing but
 * the boundary. There is no round to hand down: which hull the player flies
 * is a device preference, not part of the daily round.
 */
export default function HangarPage() {
  return <Hangar />;
}
