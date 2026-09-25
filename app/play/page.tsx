import { GameCanvas } from "@/components/GameCanvas";
import { getRound, getShuffledRound, isAuthoredRound } from "@/lib/content/round";

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
  searchParams: Promise<{
    debug?: string;
    replay?: string;
    round?: string;
    shuffle?: string;
    ship?: string;
    sim?: string;
  }>;
}) {
  const params = await searchParams;

  /**
   * `?shuffle=<seed>` is the practice hatch, reached from `/profile?debug=1`:
   * a round drawn from the whole pool instead of today's. The seed comes in
   * on the URL rather than being made up here, so the page stays pure and,
   * more usefully, a shuffled round can be opened a second time and reported
   * against. The button supplies a new one on every press.
   *
   * A practice run is never recorded, so it cannot overwrite today's run,
   * cannot lift the best, and cannot farm a hull unlock. See `GameCanvas`.
   */
  const practice = params.shuffle !== undefined;

  /**
   * `?sim=1` with `?round=YYYY-MM-DD` is the simulation mode, reached from
   * `/dev`: a day's real round flown ahead of its date, with a pause tab for
   * notes on its questions. Recorded nowhere, like a practice run, so flying
   * tomorrow tonight cannot touch today's run, the best or the flight log.
   */
  const sim = !practice && params.sim === "1";

  // `?round=YYYY-MM-DD` is a dev and QA hatch like `?replay=1`: fly any round
  // in the pool rather than today's. Anything else falls through to today.
  const round = practice ? getShuffledRound(params.shuffle ?? "") : getRound(params.round);

  return (
    <GameCanvas
      round={round}
      debug={params.debug === "1"}
      // Practice implies replay: there is no stored run for a round that was
      // made up a moment ago, and a tester is not a first-time player.
      replay={practice || sim || params.replay === "1"}
      practice={practice}
      sim={sim ? { authored: isAuthoredRound(round.date) } : undefined}
      // A hull picked on `/profile?debug=1` or `/dev`, locked or not. Never
      // on the daily run.
      practiceShip={practice || sim ? params.ship : undefined}
    />
  );
}
