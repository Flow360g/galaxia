import Link from "next/link";
import { BestRun } from "@/components/BestRun";
import { TitleMenu } from "@/components/TitleMenu";
import { getRound } from "@/lib/content/round";
import { formatRoundNumber } from "@/lib/game/format";
import styles from "./page.module.css";

/**
 * Title screen. An arcade attract mode: one big mark, one blinking prompt,
 * the day's stats along the bottom rail. The fastest path from a shared link
 * to flying is still one tap.
 */
export default function Home() {
  const round = getRound();
  const encounters = round.questions.length;

  return (
    <main className={styles.main}>
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.header}>
        <span className="eyebrow">
          {formatRoundNumber(round.roundNumber)} / DAILY RUN
        </span>
        <span className={`${styles.mark} arcade`}>{round.date}</span>
      </header>

      <div className={styles.body}>
        <h1 className={`${styles.title} arcade`}>
          <span className={styles.titleGlow} aria-hidden="true">
            GALAXIA
          </span>
          GALAXIA
        </h1>

        <p className={styles.lede}>
          {encounters} asteroids, one run a day. Answer fast to keep your
          thrust, arm Boost when you are sure, and fly as far as you can.
          Wrong answers hit hard.
        </p>

        <Link href="/play" className={`${styles.start} arcade`}>
          Press Start
        </Link>

        <TitleMenu round={round} />
      </div>

      <footer className={styles.footer}>
        <div className={styles.meta}>
          <span className="label">Sector</span>
          <span className={`${styles.metaValue} arcade`}>{round.theme}</span>
        </div>
        <div className={styles.meta}>
          <span className="label">Encounters</span>
          <span className={`${styles.metaValue} arcade`}>{encounters}</span>
        </div>
        <div className={styles.meta}>
          <span className="label">Run time</span>
          <span className={`${styles.metaValue} arcade`}>2-3 MIN</span>
        </div>
        <BestRun date={round.date} className={styles.meta ?? ""} />
      </footer>
    </main>
  );
}
