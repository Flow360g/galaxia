import type { Question, Round } from "./types";
import type { SimNotes } from "./storage";

/**
 * The simulation mode's notes as text: what gets copied or filed as an issue
 * so the questions can be fixed in `content/rounds/`. Every noted or flagged
 * question is written out whole (prompt, options, the correct answer), so the
 * reader never has to open the round file to know what the note is about.
 */

/** Where the feedback is filed. */
export const FEEDBACK_REPO = "Flow360g/galaxia";

/** GitHub refuses a prefilled issue much past this; the copy button has no limit. */
const ISSUE_URL_MAX = 7500;

export function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-AU", {
    weekday: "long",
    timeZone: "UTC",
  });
}

export function correctAnswer(question: Question): string {
  switch (question.type) {
    case "mcq":
      return question.options[question.answer] ?? "?";
    case "cluster":
      return question.answers.map((i) => question.options[i] ?? "?").join(", ");
    case "vector":
      return `${question.year ? String(question.answer) : question.answer.toLocaleString("en-AU")}${
        question.unit ? ` ${question.unit}` : ""
      } (ruler ${question.min} to ${question.max})`;
    case "earth":
      return `${question.name}, ${question.country}`;
  }
}

export function typeLabel(question: Question): string {
  switch (question.type) {
    case "cluster":
      return "Find the 3";
    case "vector":
      return "Guess the number";
    case "mcq":
      return "Pick one";
    case "earth":
      return "Name the place";
  }
}

function hasNotes(notes: SimNotes, question: Question): boolean {
  const entry = notes.questions[question.id];
  return Boolean(entry && (entry.flag || entry.note.trim()));
}

export function countNoted(notes: SimNotes): number {
  return Object.values(notes.questions).filter((q) => q.flag || q.note.trim()).length;
}

export function feedbackTitle(round: Round): string {
  return `Sim feedback: ${weekday(round.date)} ${round.date} (round ${round.roundNumber})`;
}

export function feedbackMarkdown(round: Round, notes: SimNotes, authored: boolean): string {
  const lines: string[] = [];
  lines.push(`## ${feedbackTitle(round)}`);
  lines.push("");
  lines.push(
    authored
      ? `Round file: \`content/rounds/${round.date}.json\``
      : `No file of its own: this date rotates in round ${round.roundNumber} from the pool.`,
  );
  if (notes.lastScore !== undefined) {
    lines.push(`Last simulated score: ${notes.lastScore} of ${notes.lastMaxScore ?? "?"}`);
  }
  if (notes.general.trim()) {
    lines.push("");
    lines.push("### General");
    lines.push(notes.general.trim());
  }

  const noted = round.questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => hasNotes(notes, question));
  for (const { question, index } of noted) {
    const entry = notes.questions[question.id];
    lines.push("");
    lines.push(
      `### Q${index + 1} · ${typeLabel(question)} · \`${question.id}\`${entry?.flag ? " · FLAGGED" : ""}`,
    );
    lines.push(`**Prompt:** ${question.prompt}`);
    if (question.type === "mcq" || question.type === "cluster") {
      lines.push(`**Options:** ${question.options.join(" | ")}`);
    }
    lines.push(`**Correct:** ${correctAnswer(question)}`);
    if (entry?.note.trim()) lines.push(`**Note:** ${entry.note.trim()}`);
  }

  if (noted.length === 0 && !notes.general.trim()) {
    lines.push("");
    lines.push("No notes. The day played clean.");
  }
  return lines.join("\n");
}

/** A prefilled new-issue link, or null when the text is too long for one. */
export function feedbackIssueUrl(round: Round, body: string): string | null {
  const url =
    `https://github.com/${FEEDBACK_REPO}/issues/new` +
    `?title=${encodeURIComponent(feedbackTitle(round))}` +
    `&body=${encodeURIComponent(body)}`;
  return url.length > ISSUE_URL_MAX ? null : url;
}
