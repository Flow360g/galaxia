import type { Metadata } from "next";
import Link from "next/link";
import { SimReview } from "@/components/SimReview";
import { getRound, isAuthoredRound } from "@/lib/content/round";
import styles from "@/components/Profile.module.css";
import sim from "@/components/SimDays.module.css";

export const metadata: Metadata = {
  title: "Astro Run / Simulation notes",
  description: "The notes on one simulated day.",
  robots: { index: false, follow: false },
};

/**
 * One simulated day's notes, every question and its answer on show, with the
 * buttons that send them on. Reached from `/dev`; see there.
 */
export default async function DevReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const params = await searchParams;
  const round = getRound(params.round);

  return (
    <main className={`${styles.main} ${sim.page}`}>
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/dev" className={`${styles.back} arcade`}>
          Days
        </Link>
        <span className="eyebrow">Notes</span>
        <Link href={`/play?round=${round.date}&sim=1`} className={`${styles.mark} arcade`}>
          Fly it
        </Link>
      </header>

      <div className={styles.section}>
        <SimReview round={round} authored={isAuthoredRound(round.date)} />
      </div>
    </main>
  );
}
