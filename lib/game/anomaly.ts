import type { AnomalyQuestion, AnomalyVerdict } from "./types";

/**
 * Anomaly scoring, client side.
 *
 * The model lives behind /api/anomaly. Everything here is the part that must
 * work with no network, no key and no server: a keyword scorer good enough to
 * keep a run playable, and a fetch wrapper that falls back to it on any
 * failure so the ship never sits in "scanning" forever.
 */

/** Scores at or above this count as a correct encounter. */
const PASS_MARK = 0.6;

export function anomalyCorrect(score: number): boolean {
  return score >= PASS_MARK;
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function normaliseAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keyword fallback. Full marks for a phrase match on any accept entry, half
 * marks when at least half of some entry's distinct words show up, otherwise
 * nothing.
 */
export function scoreLocally(
  question: AnomalyQuestion,
  answer: string,
): AnomalyVerdict {
  const given = normaliseAnswer(answer);
  const { answerText } = question;

  if (given.length === 0) {
    return {
      score: 0,
      verdict: `No signal. It was ${answerText}`,
      source: "local",
    };
  }

  // Pad so a phrase match is a whole-word match and "ion" does not hit "orion".
  const haystack = ` ${given} `;
  const givenWords = new Set(given.split(" "));

  let partial = false;
  for (const raw of question.accept) {
    const entry = normaliseAnswer(raw);
    if (entry.length === 0) continue;

    if (haystack.includes(` ${entry} `)) {
      return {
        score: 1,
        verdict: `Scanner confirms: ${answerText}`,
        source: "local",
      };
    }

    const words = Array.from(new Set(entry.split(" ")));
    const hits = words.filter((word) => givenWords.has(word)).length;
    if (hits > 0 && hits * 2 >= words.length) partial = true;
  }

  if (partial) {
    return {
      score: 0.5,
      verdict: `Close. It was ${answerText}`,
      source: "local",
    };
  }

  return {
    score: 0,
    verdict: `Negative. It was ${answerText}`,
    source: "local",
  };
}

/** True when a server response looks like a verdict we can show the player. */
function isVerdict(value: unknown): value is AnomalyVerdict {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.score === "number" &&
    Number.isFinite(v.score) &&
    v.score >= 0 &&
    v.score <= 1 &&
    typeof v.verdict === "string" &&
    v.verdict.length > 0 &&
    (v.source === "model" || v.source === "local")
  );
}

/**
 * Ask the server to score an answer. Any failure at all, including an abort,
 * degrades to the local scorer rather than throwing.
 */
export async function requestAnomalyScore(
  question: AnomalyQuestion,
  answer: string,
  signal?: AbortSignal,
): Promise<AnomalyVerdict> {
  try {
    const response = await fetch("/api/anomaly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: question.id, answer }),
      signal,
    });
    if (!response.ok) return scoreLocally(question, answer);

    const data: unknown = await response.json();
    if (!isVerdict(data)) return scoreLocally(question, answer);

    return { score: data.score, verdict: data.verdict, source: data.source };
  } catch {
    return scoreLocally(question, answer);
  }
}
