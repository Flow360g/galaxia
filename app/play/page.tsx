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
  searchParams: Promise<{ debug?: string; replay?: string }>;
}) {
  const params = await searchParams;
  const round = getRound();

  return (
    <GameCanvas
      round={round}
      debug={params.debug === "1"}
      replay={params.replay === "1"}
    />
  );
}
