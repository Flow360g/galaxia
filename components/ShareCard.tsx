"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistance, formatRoundNumber, formatScore } from "@/lib/game/format";
import { preloadShareArt, renderShareCard, shareCardBlob, shareText } from "@/lib/game/share";
import type { RunSummary } from "@/lib/game/types";
import { trackEvent } from "@/lib/analytics";
import styles from "./ShareCard.module.css";

const COPIED_MS = 2000;

interface ShareCardProps {
  round: { roundNumber: number; date: string; theme: string };
  summary: RunSummary;
  onReplay?: () => void;
}

type ShareState = "idle" | "busy" | "copied" | "failed";

/**
 * End-of-run overlay. Shows the rendered share card and the three ways out:
 * share it, save it, or head back to base.
 *
 * The card is drawn once into an offscreen canvas and displayed as an image,
 * so long-press to save works on phones and the canvas never has to fight
 * the WebGL surface for a compositor layer.
 */
export function ShareCard({ round, summary, onReplay }: ShareCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const blobRef = useRef<Blob | null>(null);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    // The card draws synchronously, so the logo and the ship still have to be
    // in hand before it runs. Neither is load-bearing: `preloadShareArt`
    // resolves whether or not they arrived, and the draw omits what is missing.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    const ready = Promise.all([
      fonts ? fonts.ready.catch(() => undefined) : Promise.resolve(),
      preloadShareArt(summary.shipId),
    ]);

    ready.then(() => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      renderShareCard(canvas, summary);
      canvas.toBlob((blob) => {
        if (cancelled) return;
        if (blob) {
          blobRef.current = blob;
          url = URL.createObjectURL(blob);
          setImageUrl(url);
        } else {
          try {
            setImageUrl(canvas.toDataURL("image/png"));
          } catch {
            setImageUrl(null);
          }
        }
      }, "image/png");
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [summary]);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const flashCopied = useCallback(() => {
    setShareState("copied");
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setShareState("idle"), COPIED_MS);
  }, []);

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareText(summary));
      flashCopied();
      trackEvent({ name: "Shared", data: { how: "copied" } });
    } catch {
      setShareState("failed");
    }
  }, [summary, flashCopied]);

  const handleShare = useCallback(async () => {
    setShareState("busy");
    const fileName = `astro-run-${round.date}.png`;
    try {
      const blob = blobRef.current ?? (await shareCardBlob(summary));
      blobRef.current = blob;
      const file = new File([blob], fileName, { type: "image/png" });
      const canShareFile =
        typeof navigator.share === "function" &&
        navigator.canShare?.({ files: [file] }) === true;

      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: `Astro Run #${formatRoundNumber(round.roundNumber)}`,
          text: shareText(summary),
        });
        setShareState("idle");
        trackEvent({ name: "Shared", data: { how: "share sheet" } });
        return;
      }
    } catch (error) {
      // The user closing the share sheet is not a failure.
      if (error instanceof DOMException && error.name === "AbortError") {
        setShareState("idle");
        return;
      }
    }
    await copyText();
  }, [round.date, round.roundNumber, summary, copyText]);

  const shareLabel =
    shareState === "copied"
      ? "COPIED"
      : shareState === "busy"
        ? "..."
        : shareState === "failed"
          ? "TRY AGAIN"
          : "SHARE";

  return (
    <div
      className={styles.overlay}
      data-testid="share-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-card-heading"
    >
      <div className={styles.panel}>
        <h2 id="share-card-heading" className={`${styles.heading} arcade`}>
          Run complete
        </h2>

        {/* The score, big, while the card below it renders. Everything else
            the run has to say, the round, the topic, the stages, the distance
            and the hull, is ON the card: this screen used to print the score,
            the maximum and the distance above a card that said all three
            again, and the same figure twice reads as two figures. */}
        {typeof summary.score === "number" && (summary.maxScore ?? 0) > 0 ? (
          <div className={styles.score}>
            <span className={`${styles.scoreValue} arcade`} data-testid="final-score">
              {formatScore(summary.score)}
            </span>
            <span className={styles.outOf}>/ {formatScore(summary.maxScore)}</span>
          </div>
        ) : null}

        <div className={styles.frame}>
          {imageUrl ? (
            // A blob URL of our own render. next/image has nothing to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.image}
              src={imageUrl}
              alt={`Astro Run round ${formatRoundNumber(round.roundNumber)}: ${formatScore(summary.score)} of ${formatScore(summary.maxScore)} points, ${formatDistance(summary.distance)} km flown`}
              data-testid="share-image"
            />
          ) : (
            <div className={`${styles.placeholder} label`}>Rendering...</div>
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.primary} arcade`}
            onClick={() => void handleShare()}
            disabled={shareState === "busy"}
            data-testid="share-button"
          >
            {shareLabel}
          </button>
          <a
            className={`${styles.button} arcade ${imageUrl ? "" : styles.disabled}`}
            href={imageUrl ?? "#"}
            download={`astro-run-${round.date}.png`}
            aria-disabled={imageUrl ? undefined : true}
            onClick={
              imageUrl
                ? () => trackEvent({ name: "Shared", data: { how: "saved" } })
                : (e) => e.preventDefault()
            }
          >
            Save
          </a>
          {onReplay ? (
            <button
              type="button"
              className={`${styles.button} ${styles.small} arcade`}
              onClick={onReplay}
            >
              Fly again
            </button>
          ) : null}
        </div>

        <Link href="/" className={`${styles.back} arcade`}>
          Back to base
        </Link>
      </div>
    </div>
  );
}
