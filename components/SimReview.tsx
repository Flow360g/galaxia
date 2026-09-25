"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  clearSimNotes,
  emptySimNotes,
  loadSimNotes,
  saveSimNotes,
  type SimNotes,
  type SimQuestionNote,
} from "@/lib/game/storage";
import {
  correctAnswer,
  feedbackIssueUrl,
  feedbackMarkdown,
  typeLabel,
  weekday,
} from "@/lib/game/simFeedback";
import type { Question, Round } from "@/lib/game/types";
import styles from "./SimReview.module.css";

interface Props {
  round: Round;
  /** Whether the date has a round file of its own, or rotates one in. */
  authored: boolean;
  /**
   * The question on screen when the sheet was opened mid-run. It leads the
   * sheet, with its answer behind a tap so a note does not spoil the pick.
   */
  focus?: number;
  /**
   * How many questions have been played through: their answers show. Anything
   * past it is folded away so a mid-run note cannot spoil what is coming.
   * Defaults to the whole round, which is the review page off `/dev`.
   */
  reached?: number;
}

/**
 * The simulation mode's notes for one day: a flag and a note per question, a
 * note on the day as a whole, and the two ways the notes leave the phone (a
 * prefilled GitHub issue, or the same text copied). Written through to
 * localStorage on every keystroke, so closing the sheet never loses one.
 *
 * Only ever on `/dev` and on a simulated run off it. A player never sees it.
 */
export function SimReview(props: Props) {
  // Storage is read on the client only; the server pass renders nothing.
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return hydrated ? <SimReviewBody {...props} /> : null;
}

function SimReviewBody({ round, authored, focus, reached }: Props) {
  const [notes, setNotes] = useState<SimNotes>(() => loadSimNotes(round.date));
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [fallback, setFallback] = useState<string | null>(null);
  const played = reached ?? round.questions.length;

  const update = useCallback(
    (next: SimNotes) => {
      setNotes(next);
      saveSimNotes(round.date, next);
    },
    [round.date],
  );

  const setQuestion = (id: string, patch: Partial<SimQuestionNote>) => {
    const current = notes.questions[id] ?? { flag: false, note: "" };
    update({ ...notes, questions: { ...notes.questions, [id]: { ...current, ...patch } } });
  };

  const text = () => feedbackMarkdown(round, notes, authored);

  const copy = async () => {
    const body = text();
    try {
      await navigator.clipboard.writeText(body);
      setCopied("copied");
      setFallback(null);
    } catch {
      // Clipboard refused (an insecure origin, an old browser): show the text
      // so it can be selected by hand.
      setCopied("failed");
      setFallback(body);
    }
  };

  const issueUrl = feedbackIssueUrl(round, text());

  const clear = () => {
    if (!window.confirm(`Clear every note for ${round.date}?`)) return;
    clearSimNotes(round.date);
    setNotes(emptySimNotes());
    setFallback(null);
  };

  const focused = focus !== undefined ? round.questions[focus] : undefined;

  return (
    <div className={styles.review} data-testid="sim-review">
      <div className={styles.meta}>
        <span className={`${styles.eyebrow} arcade`}>
          {weekday(round.date)} {round.date}
        </span>
        <span className={styles.metaLine}>
          Round {round.roundNumber} ·{" "}
          {authored ? `content/rounds/${round.date}.json` : "rotated in from the pool"}
        </span>
      </div>

      {focused && focus !== undefined ? (
        <section className={styles.section}>
          <h3 className={`${styles.heading} arcade`}>This question</h3>
          <QuestionNote
            question={focused}
            index={focus}
            entry={notes.questions[focused.id]}
            onChange={(patch) => setQuestion(focused.id, patch)}
            answerHidden
          />
        </section>
      ) : null}

      <section className={styles.section}>
        <h3 className={`${styles.heading} arcade`}>
          {focused ? "The rest of the day" : "Every question"}
        </h3>
        {round.questions.map((question, index) =>
          index === focus ? null : index < played ? (
            <QuestionNote
              key={question.id}
              question={question}
              index={index}
              entry={notes.questions[question.id]}
              onChange={(patch) => setQuestion(question.id, patch)}
            />
          ) : (
            <div key={question.id} className={styles.locked}>
              <span className="label">
                Q{index + 1} · {typeLabel(question)}
              </span>
              <span>Not reached yet</span>
            </div>
          ),
        )}
      </section>

      <section className={styles.section}>
        <h3 className={`${styles.heading} arcade`}>The day as a whole</h3>
        <textarea
          className={styles.note}
          value={notes.general}
          placeholder="Too hard, too easy, a bad mix, a phase that dragged..."
          rows={3}
          onChange={(e) => update({ ...notes, general: e.target.value })}
          data-testid="sim-general"
        />
      </section>

      <section className={styles.section}>
        <h3 className={`${styles.heading} arcade`}>Send the notes</h3>
        <div className={styles.actions}>
          {issueUrl ? (
            <a
              className={`${styles.primary} arcade`}
              href={issueUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="sim-issue"
            >
              File as GitHub issue
            </a>
          ) : (
            <span className={styles.hint}>Too long for a prefilled issue. Copy it instead.</span>
          )}
          <button type="button" className={`${styles.secondary} arcade`} onClick={copy} data-testid="sim-copy">
            {copied === "copied" ? "Copied" : "Copy the notes"}
          </button>
          <button type="button" className={`${styles.ghost} arcade`} onClick={clear} data-testid="sim-clear">
            Clear notes
          </button>
        </div>
        <span className={styles.hint}>
          An issue on {`Flow360g/galaxia`} can be read straight from the repo. Copied text can be
          pasted into a chat.
        </span>
        {fallback ? (
          <textarea className={styles.note} readOnly value={fallback} rows={8} data-testid="sim-fallback" />
        ) : null}
      </section>
    </div>
  );
}

function QuestionNote({
  question,
  index,
  entry,
  onChange,
  answerHidden = false,
}: {
  question: Question;
  index: number;
  entry: SimQuestionNote | undefined;
  onChange: (patch: Partial<SimQuestionNote>) => void;
  answerHidden?: boolean;
}) {
  const [shown, setShown] = useState(!answerHidden);
  const flagged = entry?.flag ?? false;
  const options = question.type === "mcq" || question.type === "cluster" ? question.options : null;

  return (
    <div
      className={`${styles.question} ${flagged ? styles.flagged : ""}`}
      data-testid={`sim-q-${index + 1}`}
    >
      <div className={styles.questionHead}>
        <span className="label">
          Q{index + 1} · {typeLabel(question)} · {question.id}
        </span>
        <button
          type="button"
          className={`${styles.flag} arcade`}
          aria-pressed={flagged}
          onClick={() => onChange({ flag: !flagged })}
          data-testid={`sim-flag-${index + 1}`}
        >
          {flagged ? "Flagged" : "Flag"}
        </button>
      </div>
      <p className={styles.prompt}>{question.prompt}</p>
      {options ? <p className={styles.options}>{options.join(" · ")}</p> : null}
      {shown ? (
        <p className={styles.answer}>Correct: {correctAnswer(question)}</p>
      ) : (
        <button type="button" className={styles.reveal} onClick={() => setShown(true)}>
          Show the answer
        </button>
      )}
      <textarea
        className={styles.note}
        value={entry?.note ?? ""}
        placeholder="What is wrong with it?"
        rows={2}
        onChange={(e) => onChange({ note: e.target.value })}
        data-testid={`sim-note-${index + 1}`}
      />
    </div>
  );
}

function noop(): () => void {
  return () => {};
}
