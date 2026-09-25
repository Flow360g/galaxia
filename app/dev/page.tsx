import type { Metadata } from "next";
import Link from "next/link";
import { SimDays, type SimDay } from "@/components/SimDays";
import { shiftDay } from "@/lib/content/clock";
import { getRound, isAuthoredRound, todayKey } from "@/lib/content/round";
import { weekday } from "@/lib/game/simFeedback";
import styles from "@/components/Profile.module.css";
import sim from "@/components/SimDays.module.css";

export const metadata: Metadata = {
  title: "Astro Run / Simulation",
  description: "Fly the coming days ahead of time and note what needs fixing.",
  robots: { index: false, follow: false },
};

/** How many days ahead the list runs, today included, unless `?days=` says otherwise. */
const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;

/**
 * The simulation mode: the coming days' rounds, each flown ahead of its date
 * on the real engine, with a pause tab for notes on the questions.
 *
 * **A dev hatch, like the practice run, and never a player's path.** It is
 * linked from `/profile?debug=1` only and marked noindex. A simulated run is
 * recorded nowhere (see `GameCanvas`), so flying Saturday on Friday cannot
 * touch Friday's real run, the best or the flight log. The notes live in
 * localStorage per date (`galaxia:sim:*`) until they are filed as an issue or
 * copied.
 *
 * Read per request so "today" turns over on the round clock.
 */
export default async function DevPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const count = Math.min(Math.max(Number(params.days) || DEFAULT_DAYS, 1), MAX_DAYS);
  const today = todayKey();

  const days: SimDay[] = Array.from({ length: count }, (_, i) => {
    const date = shiftDay(today, i);
    const round = getRound(date);
    return {
      date,
      weekday: weekday(date),
      roundNumber: round.roundNumber,
      authored: isAuthoredRound(date),
      today: i === 0,
    };
  });

  return (
    <main className={`${styles.main} ${sim.page}`}>
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/profile?debug=1" className={`${styles.back} arcade`}>
          Back
        </Link>
        <span className="eyebrow">Simulation</span>
        <span className={`${styles.mark} arcade`}>Dev</span>
      </header>

      <section className={styles.section}>
        <h2 className={`${styles.heading} arcade`}>Choose a day</h2>
        <span className={sim.intro}>
          Fly any day&apos;s real round before it goes live. Tap NOTES on the left edge during the
          run to pause and flag a question. Nothing here is saved to your record.
        </span>
        <SimDays days={days} />
      </section>
    </main>
  );
}
