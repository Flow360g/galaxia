import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRound, getSampleRound } from "@/lib/content/round";
import { scoreLocally } from "@/lib/game/anomaly";
import type { AnomalyQuestion, AnomalyVerdict } from "@/lib/game/types";

export const runtime = "nodejs";

/**
 * Anomaly scorer.
 *
 * The client sends a question id and an answer, nothing else. The rubric is
 * looked up here so a player cannot mark their own homework. With no API key
 * the keyword scorer answers instead, and every failure path ends in the same
 * place, because a stalled scan is worse than a harsh mark.
 */

const MODEL = process.env.GALAXIA_ANOMALY_MODEL ?? "claude-haiku-4-5";
const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_ANSWER_CHARS = 400;
const MODEL_TIMEOUT_MS = 7000;

const SYSTEM_PROMPT = [
  "You mark answers for a space trivia game. You are strict but fair.",
  "You receive the question, a private marking rubric, and the player's answer.",
  "Score 1 when the answer clearly satisfies the rubric, 0 when it does not,",
  "and 0.25, 0.5 or 0.75 for partial credit. Ignore spelling and casing.",
  "Accept common synonyms and alternate names. Do not reward vague answers.",
  "Reply with ONLY a JSON object, no prose, no code fence:",
  '{"score": <number 0..1>, "verdict": "<line>"}',
  "The verdict is at most 12 words, spoken by a ship's scanner.",
  "Never quote the rubric. If the player was wrong, briefly name the correct answer.",
].join(" ");

interface ScoreRequest {
  questionId: string;
  answer: string;
}

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: ImageMediaType; data: string };
    };

export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request);
  if (!body) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const question = findAnomaly(body.questionId);
  if (!question) {
    return Response.json({ error: "Unknown question" }, { status: 404 });
  }

  const answer = body.answer.slice(0, MAX_ANSWER_CHARS);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(scoreLocally(question, answer));
  }

  try {
    const verdict = await scoreWithModel(apiKey, question, answer);
    return Response.json(verdict ?? scoreLocally(question, answer));
  } catch {
    return Response.json(scoreLocally(question, answer));
  }
}

async function parseBody(request: Request): Promise<ScoreRequest | null> {
  try {
    const data: unknown = await request.json();
    if (typeof data !== "object" || data === null) return null;
    const { questionId, answer } = data as Record<string, unknown>;
    if (typeof questionId !== "string" || typeof answer !== "string") {
      return null;
    }
    return { questionId, answer };
  } catch {
    return null;
  }
}

/** Today's round first, then the sample, in case the client is a day behind. */
function findAnomaly(id: string): AnomalyQuestion | null {
  for (const round of [getRound(), getSampleRound()]) {
    for (const q of round.questions) {
      if (q.type === "anomaly" && q.id === id) return q;
    }
  }
  return null;
}

async function scoreWithModel(
  apiKey: string,
  question: AnomalyQuestion,
  answer: string,
): Promise<AnomalyVerdict | null> {
  const content = await buildContent(question, answer);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const response = await fetch(MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    const text = extractText(data);
    return text ? parseVerdict(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

async function buildContent(
  question: AnomalyQuestion,
  answer: string,
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];

  if (question.kind === "visual" && question.image) {
    const image = await loadImage(question.image);
    if (image) blocks.push(image);
    if (question.imageAlt) {
      blocks.push({ type: "text", text: `Image description: ${question.imageAlt}` });
    }
  }

  blocks.push({
    type: "text",
    text: [
      `Question: ${question.prompt}`,
      `Rubric (private): ${question.rubric}`,
      `Player's answer: ${answer.length > 0 ? answer : "(blank)"}`,
    ].join("\n\n"),
  });

  return blocks;
}

/** Reads an image from /public. Unknown extensions and missing files skip the block. */
async function loadImage(image: string): Promise<ContentBlock | null> {
  const mediaType = mediaTypeFor(image);
  if (!mediaType) return null;

  // Resolve inside /public only, whatever the content file says.
  const publicDir = path.join(process.cwd(), "public");
  const file = path.join(publicDir, image.replace(/^\/+/, ""));
  if (!file.startsWith(publicDir + path.sep)) return null;

  try {
    const data = await readFile(file);
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: data.toString("base64") },
    };
  } catch {
    return null;
  }
}

function mediaTypeFor(file: string): ImageMediaType | null {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return null;
}

/** Concatenates the text blocks of a Messages API response. */
function extractText(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/** Pulls the first {...} out of the reply and checks its shape. */
function parseVerdict(text: string): AnomalyVerdict | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { score, verdict } = parsed as Record<string, unknown>;
  const numeric = typeof score === "string" ? Number(score) : score;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return null;
  if (typeof verdict !== "string" || verdict.trim().length === 0) return null;

  return {
    score: Math.min(1, Math.max(0, numeric)),
    verdict: verdict.trim(),
    source: "model",
  };
}
