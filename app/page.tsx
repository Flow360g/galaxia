import Image from "next/image";
import Link from "next/link";
import { TitleMenu } from "@/components/TitleMenu";
import { getRound } from "@/lib/content/round";
import { formatRoundNumber } from "@/lib/game/format";
import styles from "./page.module.css";

/**
 * Title screen. An arcade attract mode: one big mark, one plain welcome, one
 * yellow prompt. The day's stats and the player's record live on the profile
 * page, not here: they cluttered the screen a new player lands on, and the
 * fastest path from a shared link to flying has to stay one tap.
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
  const questions = round.questions.length;
  const phases = (round.stages ?? []).length;
  const query = params.round ? `?round=${encodeURIComponent(params.round)}` : "";
  const playHref = `/play${query}`;

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
            src="/astro-run-logo.png"
            width={1400}
            height={473}
            alt="Astro Run"
            className={styles.logo}
            priority
            sizes="(max-width: 720px) 92vw, 560px"
          />
        </h1>

        <p className={styles.lede}>
          Welcome to Astro Run, a daily trivia game on a mission to save Earth.
          One run a day: {phases} phases, {questions} questions. Score the most
          points by answering correctly, quickly and with confidence.
        </p>

        <Link href={playHref} className={`${styles.start} arcade`}>
          Press Start
        </Link>

        <TitleMenu round={round} query={query} />
      </div>

    </main>
  );
}
