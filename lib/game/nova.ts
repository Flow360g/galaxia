import { NOVA } from "./Tuning";
import type { McqQuestion, NovaKind, NovaResult } from "./types";

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

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = items[i]!;
    items[i] = items[j]!;
    items[j] = a;
  }
}
