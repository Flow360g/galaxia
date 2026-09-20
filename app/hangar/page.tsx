import type { Metadata } from "next";
import { Hangar } from "@/components/Hangar";

export const metadata: Metadata = {
  title: "Astro Run / Ship bay",
  description: "Your hull, on the deck. Pick what you fly today.",
};

/**
 * The ship bay, reached from the title screen before a run.
 *
 * `Hangar` is a client component and its scene touches `window` at
 * construction, so this page stays a server component and renders nothing but
 * the boundary. There is no round to hand down: which hull the player flies
 * is a device preference, not part of the daily round.
 *
 * `?debug=1` parks the bay on `window.galaxiaBay`, the same hatch the audio
 * engine uses, so a cue can be poked from the console and the e2e checks can
 * read the turntable angle and the draw count without screenshotting.
 */
export default async function HangarPage({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string }>;
}) {
  const params = await searchParams;
  return <Hangar debug={params.debug === "1"} />;
}
