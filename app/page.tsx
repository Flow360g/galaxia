import Link from "next/link";
import { getRound } from "@/lib/content/round";
import { formatRoundNumber } from "@/lib/game/format";
import styles from "./page.module.css";

/**
 * Title card. Deliberately a title card and not a menu: the fastest path from
 * a shared link to flying is one tap, and everything else is noise.
 */
export default function Home() {
  const round = getRound();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <span className="eyebrow">
          {formatRoundNumber(round.roundNumber)} / DAILY ROUND
        </span>
        <span className={`${styles.mark} mono`}>GALAXIA</span>
      </header>

      <div className={styles.body}>
        <h1 className={styles.headline}>
          Answer the asteroids.
          <br />
          <span className={styles.accent}>Fly as far as you can.</span>
        </h1>

        <p className={styles.lede}>
          One round a day. Questions come at you as rock. How close you get
          decides how far you travel.
        </p>

        <Link href="/play" className={styles.start}>
          Launch
        </Link>
      </div>

      <footer className={styles.footer}>
        <div className={styles.meta}>
          <span className="label">Sector</span>
          <span className={`${styles.metaValue} mono`}>{round.theme}</span>
        </div>
        <div className={styles.meta}>
          <span className="label">Questions</span>
          <span className={`${styles.metaValue} mono`}>
            {round.questions.length}
          </span>
        </div>
        <div className={styles.meta}>
          <span className="label">Run time</span>
          <span className={`${styles.metaValue} mono`}>3&ndash;5 MIN</span>
        </div>
      </footer>
    </main>
  );
}
