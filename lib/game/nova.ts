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
 * NOVA on a vector: the slider narrows to a window that contains the truth.
 * Where the truth sits inside the window is a seeded draw, so the window's
 * centre is not the answer and everyone gets the same window.
 */
export function resolveVectorNova(
  question: VectorQuestion,
  random: () => number,
): { kind: "narrow"; window: [number, number] } {
  const truth = toSlider(question, question.answer);
  const width = VECTOR.novaWindow;
  const lo = Math.max(0, Math.min(1 - width, truth - random() * width));
  return { kind: "narrow", window: [lo, lo + width] };
}

/**
 * The step a vector's aim moves in, in answer units, or 0 for a smooth
 * slider. A question whose ends are both whole numbers and close together is
 * a counting question: aiming at 7.04 strings and being scored on 7.04 while
 * the readout says 7 is a lie the player cannot see. A wide range stays
 * smooth, because whole metres of the Mariana Trench is false precision.
 *
 * It is derived from the ENDS, never the answer, so it can never leak one.
 */
export function stepFor(question: VectorQuestion): number {
  const { min, max } = question;
  if (question.log) return 0;
  if (!Number.isInteger(min) || !Number.isInteger(max)) return 0;
  return max - min <= VECTOR.snapMaxSpan ? 1 : 0;
}

/** That step in slider space, or 0 when the slider is smooth. */
export function stepT(question: VectorQuestion): number {
  const step = stepFor(question);
  const span = question.max - question.min;
  return step > 0 && span > 0 ? step / span : 0;
}

/**
 * Snap an aim to the nearest whole unit inside `window`, if this question
 * aims in whole units. Snapping and clamping have to happen together: snap
 * then clamp and the aim can sit between two units at the window's edge,
 * clamp then snap and it can sit a half-step outside the window.
 */
export function snapT(
  question: VectorQuestion,
  t: number,
  window: [number, number] = [0, 1],
): number {
  const [lo, hi] = window;
  const step = stepT(question);
  const held = Math.min(hi, Math.max(lo, clamp01(t)));
  if (step <= 0) return held;
  let snapped = Math.round(held / step) * step;
  if (snapped < lo) snapped += step;
  if (snapped > hi) snapped -= step;
  // A window narrower than one step has no whole unit in it; the clamp wins.
  return snapped < lo || snapped > hi ? held : clamp01(snapped);
}

/** Answer units to slider space 0..1, honouring the log flag. */
export function toSlider(question: VectorQuestion, value: number): number {
  const { min, max } = question;
  if (question.log && min > 0) {
    const t = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
    return clamp01(t);
  }
  return clamp01((value - min) / (max - min));
}

/** Slider space 0..1 to answer units. */
export function fromSlider(question: VectorQuestion, t: number): number {
  const { min, max } = question;
  const c = clamp01(t);
  if (question.log && min > 0) {
    return Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * c);
  }
  return min + (max - min) * c;
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
