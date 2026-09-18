import Link from "next/link";
import { getRound } from "@/lib/content/round";
import { formatRoundNumber, formatScore } from "@/lib/game/format";
import styles from "./page.module.css";

/**
 * Title screen. An arcade attract mode: one big mark, one blinking prompt,
 * the day's stats along the bottom rail. The fastest path from a shared link
 * to flying is still one tap.
 */
export default function Home() {
  const round = getRound();

  return (
    <main className={styles.main}>
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.header}>
        <span className="eyebrow">
          {formatRoundNumber(round.roundNumber)} / DAILY ROUND
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
          Answer the asteroids. Steer into the right one and fly as far as you
          can. One round a day.
        </p>

        <Link href="/play" className={`${styles.start} arcade`}>
          Press Start
        </Link>
      </div>

      <footer className={styles.footer}>
        <div className={styles.meta}>
          <span className="label">Sector</span>
          <span className={`${styles.metaValue} arcade`}>{round.theme}</span>
        </div>
        <div className={styles.meta}>
          <span className="label">Questions</span>
          <span className={`${styles.metaValue} arcade`}>
            {round.questions.length}
          </span>
        </div>
        <div className={styles.meta}>
          <span className="label">Run time</span>
          <span className={`${styles.metaValue} arcade`}>3-5 MIN</span>
        </div>
        <div className={styles.meta}>
          <span className="label">Hi-score</span>
          <span className={`${styles.metaValue} ${styles.hiScore} arcade`}>
            {formatScore(0)}
          </span>
        </div>
      </footer>
    </main>
  );
}
