import { GameCanvas } from "@/components/GameCanvas";
import { getRound } from "@/lib/content/round";

/**
 * The flight surface.
 *
 * `GameCanvas` is a client component and the engine touches `window` at
 * construction, so this page stays a server component and simply hands the
 * round down. No dynamic import needed: the "use client" boundary already
 * keeps three.js out of the server bundle.
 */
export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string; replay?: string; round?: string }>;
}) {
  const params = await searchParams;
  // `?round=YYYY-MM-DD` is a dev and QA hatch like `?replay=1`: fly any round
  // in the pool rather than today's. Anything else falls through to today.
  const round = getRound(params.round);

  return (
    <GameCanvas
      round={round}
      debug={params.debug === "1"}
      replay={params.replay === "1"}
    />
  );
}
