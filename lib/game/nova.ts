import { NOVA, VECTOR } from "./Tuning";
import type { ClusterQuestion, McqQuestion, NovaKind, NovaResult, VectorQuestion } from "./types";

/**
 * NOVA scans: one tap, an indirect hint, some thrust.
 *
 * Which scan a question yields is decided by a seeded draw so every player
 * gets the same help on the same question. Questions with an authored hint
 * can reveal it; the rest either rule out one wrong option or narrow the
 * field to the most plausible two.
 */
export function resolveNova(
  question: McqQuestion,
  random: () => number,
): NovaResult {
  const kinds: NovaKind[] = question.hint
    ? ["clue", "eliminate", "narrow"]
    : ["eliminate", "narrow"];
  const kind = kinds[Math.floor(random() * kinds.length)] ?? "eliminate";

  const wrong = question.options
    .map((_, index) => index)
    .filter((index) => index !== question.answer);
  shuffle(wrong, random);

  switch (kind) {
    case "clue":
      return { kind, eliminated: [], highlighted: [], clue: question.hint ?? null };
    case "eliminate":
      return { kind, eliminated: wrong.slice(0, 1), highlighted: [], clue: null };
    case "narrow": {
      const keep = [question.answer, ...wrong.slice(0, NOVA.narrowKeep - 1)];
      keep.sort((a, b) => a - b);
      return { kind, eliminated: [], highlighted: keep, clue: null };
    }
  }
}

/**
 * NOVA on a cluster: one wrong, unpicked lane goes dark. Never a right one,
 * and never a clue, so the push-your-luck decision stays the player's.
 */
export function resolveClusterNova(
  question: ClusterQuestion,
  picked: number[],
  random: () => number,
): NovaResult {
  const wrong = question.options
    .map((_, index) => index)
    .filter((index) => !question.answers.includes(index) && !picked.includes(index));
  shuffle(wrong, random);
  return { kind: "eliminate", eliminated: wrong.slice(0, 1), highlighted: [], clue: null };
}

/**
 * NOVA on a vector: the slider narrows to a window of `VECTOR.novaWindow`
 * notches that contains the truth. Where the truth sits inside the window is
 * a seeded draw, so the window's centre is not the answer and everyone gets
 * the same window. Both edges land on notches, like everything on the ruler.
 */
export function resolveVectorNova(
  question: VectorQuestion,
  random: () => number,
): { kind: "narrow"; window: [number, number] } {
  const n = VECTOR.notches;
  const truth = toNotch(question, question.answer);
  const width = VECTOR.novaWindow;
  const lo = Math.max(0, Math.min(n - width, truth - Math.floor(random() * (width + 1))));
  return { kind: "narrow", window: [lo / n, (lo + width) / n] };
}

/** Answer units to slider space 0..1. The ruler is linear from `min` to `max`. */
export function toSlider(question: VectorQuestion, value: number): number {
  const { min, max } = question;
  return clamp01((value - min) / (max - min));
}

/** Slider space 0..1 to answer units. */
export function fromSlider(question: VectorQuestion, t: number): number {
  const { min, max } = question;
  return min + (max - min) * clamp01(t);
}

/**
 * A value's nearest notch on the question's ruler, 0..`VECTOR.notches`.
 *
 * An answer exactly between two notches rounds up, every time. Without the
 * nudge it depended on floating point: 1913 on a 1800 to 2000 ruler is 56.5
 * notches, which arrives as 56.49999 and rounded down.
 */
export function toNotch(question: VectorQuestion, value: number): number {
  return Math.round(toSlider(question, value) * VECTOR.notches + NOTCH_EPSILON);
}

/** Enough to carry a float that should be a half over the line, and no more. */
const NOTCH_EPSILON = 1e-9;

/**
 * The value one notch covers. The build holds every question to a round one
 * (see `lib/content/difficulty.ts`), so the ruler reads 5.8, 6, 6.2 rather
 * than 5.88, 6, 6.12.
 */
export function notchStep(question: VectorQuestion): number {
  return (question.max - question.min) / VECTOR.notches;
}

/**
 * A value as the ruler reads it: to exactly as many decimals as one notch
 * needs, and no more. A guess is always a notch, so this is what the aim
 * readout, the guess line and the "off by" line all print.
 */
export function formatOnRuler(question: VectorQuestion, value: number): string {
  const step = Math.round(notchStep(question) * 1e9) / 1e9;
  const decimals = Math.min(3, (String(step).split(".")[1] ?? "").length);
  const text = value.toLocaleString("en-AU", {
    maximumFractionDigits: decimals,
    useGrouping: !question.year,
  });
  return question.unit ? `${text} ${question.unit}` : text;
}

/**
 * The true answer, exactly as authored. Not rounded to the ruler: a marathon
 * is 42.195 km however the slider steps.
 */
export function formatAnswer(question: VectorQuestion): string {
  const text = question.answer.toLocaleString("en-AU", {
    maximumFractionDigits: 3,
    useGrouping: !question.year,
  });
  return question.unit ? `${text} ${question.unit}` : text;
}

/** Slider space snapped to the nearest notch, halves rounding up like `toNotch`. */
export function snapToNotch(t: number): number {
  return Math.round(clamp01(t) * VECTOR.notches + NOTCH_EPSILON) / VECTOR.notches;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = items[i]!;
    items[i] = items[j]!;
    items[j] = a;
  }
}
