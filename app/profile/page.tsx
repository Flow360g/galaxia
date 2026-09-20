import type { Metadata } from "next";
import Link from "next/link";
import { BestRun } from "@/components/BestRun";
import { getRound } from "@/lib/content/round";
import { formatRoundNumber } from "@/lib/game/format";
import styles from "@/components/Profile.module.css";

export const metadata: Metadata = {
  title: "Astro Run / Profile",
  description: "Your best score, today's run and the runs you have played.",
};

/**
 * The profile page, reached from the title screen. The player's record (today,
 * best, runs played) and the shape of today's round (topic, questions, how
 * long it takes). It all used to sit along the bottom of the title screen and
 * cluttered the one screen a new player has to understand at a glance.
 *
 * Read per request like the title screen, so it turns over at midnight with
 * the round, and `?round=` carries through as the same QA hatch.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const params = await searchParams;
  const round = getRound(params.round);
  const query = params.round ? `?round=${encodeURIComponent(params.round)}` : "";

  return (
    <main className={styles.main}>
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.header}>
        <Link href={`/${query}`} className={`${styles.back} arcade`} data-testid="profile-back">
          Back
        </Link>
        <span className="eyebrow">Profile</span>
        <span className={`${styles.mark} arcade`}>
          {formatRoundNumber(round.roundNumber)}
        </span>
      </header>

      <section className={styles.section}>
        <h2 className={`${styles.heading} arcade`}>Your record</h2>
        <div className={styles.grid}>
          <BestRun
            date={round.date}
            className={styles.meta ?? ""}
            valueClassName={styles.metaValue ?? ""}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={`${styles.heading} arcade`}>Today&apos;s round</h2>
        <div className={styles.grid}>
          <div className={styles.meta}>
            <span className="label">Date</span>
            <span className={`${styles.metaValue} arcade`}>{round.date}</span>
          </div>
          <div className={styles.meta}>
            <span className="label">Topic</span>
            <span className={`${styles.metaValue} arcade`}>{round.theme}</span>
          </div>
          <div className={styles.meta}>
            <span className="label">Questions</span>
            <span className={`${styles.metaValue} arcade`}>{round.questions.length}</span>
          </div>
          <div className={styles.meta}>
            <span className="label">Time to play</span>
            <span className={`${styles.metaValue} arcade`}>2-3 MIN</span>
          </div>
        </div>
      </section>

      <div className={styles.actions}>
        <Link href={`/play${query}`} className={`${styles.play} arcade`} data-testid="profile-play">
          Play today&apos;s run
        </Link>
      </div>
    </main>
  );
}
