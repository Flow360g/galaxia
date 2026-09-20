import Image from "next/image";
import Link from "next/link";
import { BestRun } from "@/components/BestRun";
import { TitleMenu } from "@/components/TitleMenu";
import { getRound } from "@/lib/content/round";
import { formatRoundNumber } from "@/lib/game/format";
import logo from "../public/astro-run-logo.png";
import styles from "./page.module.css";

/**
 * Title screen. An arcade attract mode: one big mark, one blinking prompt,
 * the day's stats along the bottom rail. The fastest path from a shared link
 * to flying is still one tap.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  // Read per request rather than prerendered, so the title screen turns
  // over at midnight with the round. `?round=` is the same QA hatch as on
  // /play, and Press Start carries it through.
  const params = await searchParams;
  const round = getRound(params.round);
  const encounters = round.questions.length;
  const playHref = params.round ? `/play?round=${encodeURIComponent(params.round)}` : "/play";

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
        <h1 className={styles.title}>
          <Image
            src={logo}
            alt="Astro Run"
            className={styles.logo}
            priority
            sizes="(max-width: 720px) 92vw, 560px"
          />
        </h1>

        <p className={styles.lede}>
          {encounters} asteroids, one run a day. Answer fast to keep your
          thrust, arm Boost when you are sure, and run your score as high as it
          will go. Every wrong answer costs points and speed.
        </p>

        <Link href={playHref} className={`${styles.start} arcade`}>
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
