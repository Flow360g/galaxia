import Image from "next/image";
import Link from "next/link";
import { NextRun } from "@/components/NextRun";
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
  searchParams: Promise<{ round?: string; debug?: string; squad?: string }>;
}) {
  // Read per request rather than prerendered, so the title screen turns
  // over with the round (see `DAILY` in `Tuning.ts`). `?round=` and `?debug=1` are the same QA
  // hatches as on /play, and Press Start and the menu carry them through, so
  // `/?debug=1` is one bookmark to the profile's practice run.
  const params = await searchParams;
  const round = getRound(params.round);
  const questions = round.questions.length;
  const phases = (round.stages ?? []).length;
  const query = [
    params.round ? `round=${encodeURIComponent(params.round)}` : "",
    params.debug === "1" ? "debug=1" : "",
    // The prank bonus question rides through Press Start. See BonusQuestion.
    params.squad === "1" ? "squad=1" : "",
  ]
    .filter(Boolean)
    .join("&");
  const suffix = query ? `?${query}` : "";
  const playHref = `/play${suffix}`;

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

        <TitleMenu round={round} query={suffix} />

        <NextRun />
      </div>

    </main>
  );
}
