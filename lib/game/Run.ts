import { anomalyCorrect, scoreLocally } from "./anomaly";
import { Flight, clamp01, outcomeKind } from "./Flight";
import { resolveNova } from "./nova";
import { ENCOUNTER, NOVA } from "./Tuning";
import type {
  AnomalyQuestion,
  AnomalyVerdict,
  FlightSample,
  GameState,
  NovaResult,
  Outcome,
  Phase,
  Question,
  Round,
  RunEvent,
  RunSummary,
} from "./types";

/**
 * The run: seven encounters, one after another, each a state machine step.
 *
 *   intro -> approach -> (scanning) -> resolving -> aftermath -> approach ...
 *
 * Pure game logic. The engine subscribes through `RunHooks` to spawn rocks,
 * play the strike and light the fireworks; the HUD reads `state`. Nothing in
 * here knows about three.js or React, so the whole run can be stepped in a
 * test with a fake clock.
 */

export interface RunHooks {
  /** A new asteroid is called. Spawn it at the far hold. */
  onEncounterStart(index: number, question: Question): void;
  /** The answer locked. The rock strikes; the ship reacts to `outcome.kind`. */
  onLock(index: number, outcome: Outcome): void;
  /** Contact. Velocity has just changed; play the burst or the impact. */
  onContact(index: number, outcome: Outcome): void;
  onFinished(): void;
  /** Score an anomaly answer. Must never reject; fall back locally instead. */
  scoreAnomaly(question: AnomalyQuestion, answer: string): Promise<AnomalyVerdict>;
}

const SAMPLE_INTERVAL = 0.25;

export class Run {
  readonly flight = new Flight();
  readonly outcomes: Outcome[] = [];
  readonly events: RunEvent[] = [];
  readonly samples: FlightSample[] = [];

  phase: Phase = "intro";
  /** Encounter in progress, or -1. */
  index = -1;
  thrust = 1;
  boostArmed = false;
  novaLeft: number = NOVA.perRun;
  nova: NovaResult | null = null;
  /** The last resolved outcome, kept through its aftermath. */
  outcome: Outcome | null = null;

  elapsed = 0;
  private timer: number = ENCOUNTER.introSeconds;
  private thrustSeconds: number = ENCOUNTER.thrustSeconds;
  private pending: Outcome | null = null;
  private struck = false;
  private sampleTimer = 0;
  private novasUsed = 0;
  /** Bumped on every lock so a late scan result cannot land on a later rock. */
  private scanToken = 0;

  constructor(
    private readonly round: Round,
    private readonly hooks: RunHooks,
    private readonly random: () => number,
  ) {
    this.sample();
  }

  get question(): Question | undefined {
    return this.index >= 0 ? this.round.questions[this.index] : undefined;
  }

  get answering(): boolean {
    return this.phase === "approach";
  }

  get state(): GameState {
    return {
      phase: this.phase,
      encounter: this.index,
      resolved: this.outcomes.length,
      distance: this.flight.distance,
      velocity: this.flight.velocity,
      peakVelocity: this.flight.peakVelocity,
      streak: this.flight.streak,
      thrust: this.thrust,
      boostArmed: this.boostArmed,
      novaLeft: this.novaLeft,
      nova: this.nova,
      outcome: this.phase === "aftermath" || this.phase === "finished" ? this.outcome : null,
      running: true,
    };
  }

  // ---------------------------------------------------------------- input

  /** Lock an MCQ option. Ignored unless an answer is open. */
  answer(option: number): void {
    const question = this.question;
    if (!this.answering || !question || question.type !== "mcq") return;
    if (option < 0 || option >= question.options.length) return;
    if (this.nova?.eliminated.includes(option)) return;

    const correct = option === question.answer;
    this.lock({
      kind: outcomeKind(correct, this.boostArmed, false),
      correct,
      boosted: this.boostArmed,
      timedOut: false,
      thrustLeft: this.thrust,
      velocityBefore: this.flight.velocity,
      velocityAfter: this.flight.velocity,
      streakBefore: this.flight.streak,
      streakAfter: this.flight.streak,
      chosen: option,
      guessText: question.options[option] ?? "",
      answerText: question.options[question.answer] ?? "",
    });
  }

  toggleBoost(): void {
    if (!this.answering) return;
    this.boostArmed = !this.boostArmed;
  }

  /** Spend a NOVA scan on the current question. */
  useNova(): void {
    const question = this.question;
    if (!this.answering || !question || question.type !== "mcq") return;
    if (this.novaLeft <= 0 || this.nova) return;

    this.novaLeft -= 1;
    this.novasUsed += 1;
    this.thrust = Math.max(this.thrust - NOVA.thrustCost, 0.02);
    this.nova = resolveNova(question, this.random);
  }

  /** Send an anomaly answer to the scorer. Thrust freezes while it scans. */
  submitAnomaly(text: string): void {
    const question = this.question;
    if (!this.answering || !question || question.type !== "anomaly") return;

    const answer = text.trim().slice(0, 400);
    const thrustLeft = this.thrust;
    const boosted = this.boostArmed;
    const token = ++this.scanToken;

    this.phase = "scanning";
    this.timer = ENCOUNTER.scanTimeoutSeconds;

    const settle = (verdict: AnomalyVerdict) => {
      if (token !== this.scanToken || this.phase !== "scanning") return;
      const score = clamp01(verdict.score);
      const correct = anomalyCorrect(score);
      this.lock({
        kind: outcomeKind(correct, boosted, false),
        correct,
        boosted,
        timedOut: false,
        thrustLeft,
        velocityBefore: this.flight.velocity,
        velocityAfter: this.flight.velocity,
        streakBefore: this.flight.streak,
        streakAfter: this.flight.streak,
        chosen: null,
        guessText: answer || "(no answer)",
        answerText: question.answerText,
        anomalyScore: score,
        anomalyVerdict: verdict.verdict,
      });
    };

    this.hooks
      .scoreAnomaly(question, answer)
      .then(settle)
      .catch(() => settle(scoreLocally(question, answer)));
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.elapsed += dt;
    this.flight.update(dt);

    this.sampleTimer += dt;
    if (this.sampleTimer >= SAMPLE_INTERVAL) {
      this.sampleTimer = 0;
      this.sample();
    }

    switch (this.phase) {
      case "intro":
        this.timer -= dt;
        if (this.timer <= 0) this.startEncounter(0);
        break;

      case "approach":
        this.thrust -= dt / this.thrustSeconds;
        if (this.thrust <= 0) {
          this.thrust = 0;
          this.timeOut();
        }
        break;

      case "scanning":
        // The scorer has a hard deadline; past it the local marker decides.
        this.timer -= dt;
        if (this.timer <= 0) {
          const question = this.question;
          if (question && question.type === "anomaly") {
            this.scanToken += 1;
            this.phase = "approach";
            this.forceLocal(question);
          }
        }
        break;

      case "resolving":
        this.timer -= dt;
        if (!this.struck && this.timer <= ENCOUNTER.resolveSeconds) this.contact();
        if (this.timer <= 0) {
          this.phase = "aftermath";
          this.timer =
            this.question?.type === "anomaly"
              ? ENCOUNTER.aftermathSecondsAnomaly
              : ENCOUNTER.aftermathSeconds;
        }
        break;

      case "aftermath":
        this.timer -= dt;
        if (this.timer <= 0) this.startEncounter(this.index + 1);
        break;

      case "finished":
        break;
    }
  }

  // -------------------------------------------------------------- internals

  private startEncounter(index: number): void {
    const question = this.round.questions[index];
    if (!question) {
      this.finish();
      return;
    }

    this.index = index;
    this.phase = "approach";
    this.thrust = 1;
    this.boostArmed = false;
    this.nova = null;
    this.pending = null;
    this.struck = false;
    this.thrustSeconds =
      question.type === "anomaly"
        ? ENCOUNTER.anomalyThrustSeconds
        : ENCOUNTER.thrustSeconds;

    this.hooks.onEncounterStart(index, question);
  }

  private timeOut(): void {
    const question = this.question;
    if (!question) return;
    const answerText =
      question.type === "mcq"
        ? (question.options[question.answer] ?? "")
        : question.answerText;

    this.lock({
      kind: "timeout",
      correct: false,
      boosted: false,
      timedOut: true,
      thrustLeft: 0,
      velocityBefore: this.flight.velocity,
      velocityAfter: this.flight.velocity,
      streakBefore: this.flight.streak,
      streakAfter: this.flight.streak,
      chosen: null,
      guessText: "No answer",
      answerText,
    });
  }

  private forceLocal(question: AnomalyQuestion): void {
    // Answer text is not retained past submit; the deadline case marks as a
    // blank so the run keeps moving rather than stalling on a dead scorer.
    const verdict = scoreLocally(question, "");
    this.lock({
      kind: outcomeKind(false, this.boostArmed, false),
      correct: false,
      boosted: this.boostArmed,
      timedOut: false,
      thrustLeft: this.thrust,
      velocityBefore: this.flight.velocity,
      velocityAfter: this.flight.velocity,
      streakBefore: this.flight.streak,
      streakAfter: this.flight.streak,
      chosen: null,
      guessText: "Scanner timed out",
      answerText: question.answerText,
      anomalyScore: 0,
      anomalyVerdict: verdict.verdict,
    });
  }

  /** The answer is in. The rock strikes; velocity changes on contact. */
  private lock(outcome: Outcome): void {
    this.pending = outcome;
    this.struck = false;
    this.phase = "resolving";
    this.timer = ENCOUNTER.strikeSeconds + ENCOUNTER.resolveSeconds;
    this.hooks.onLock(this.index, outcome);
  }

  private contact(): void {
    const outcome = this.pending;
    if (!outcome) return;
    this.struck = true;

    const strength = outcome.anomalyScore ?? 1;
    outcome.velocityBefore = this.flight.velocity;
    outcome.velocityAfter = this.flight.applyOutcome(
      outcome.kind,
      outcome.thrustLeft,
      strength,
    );
    outcome.streakAfter = this.flight.streak;

    this.outcome = outcome;
    this.outcomes.push(outcome);
    this.events.push({
      t: this.elapsed,
      index: this.index,
      kind: outcome.kind,
      correct: outcome.correct,
      boosted: outcome.boosted,
      anomaly: outcome.anomalyScore !== undefined,
      d: this.flight.distance,
      v: outcome.velocityAfter,
      streak: outcome.streakAfter,
    });
    this.sample();

    this.hooks.onContact(this.index, outcome);
  }

  private finish(): void {
    this.phase = "finished";
    this.index = -1;
    this.sample();
    this.hooks.onFinished();
  }

  private sample(): void {
    this.samples.push({
      t: this.elapsed,
      v: this.flight.velocity,
      d: this.flight.distance,
    });
  }

  summary(): RunSummary {
    const anomaly = this.outcomes.find((o) => o.anomalyScore !== undefined);
    let bestStreak = 0;
    for (const outcome of this.outcomes) {
      bestStreak = Math.max(bestStreak, outcome.streakAfter);
    }
    const boosts = this.outcomes.filter((o) => o.boosted).length;

    return {
      date: this.round.date,
      roundNumber: this.round.roundNumber,
      theme: this.round.theme,
      distance: this.flight.distance,
      peakVelocity: this.flight.peakVelocity,
      bestStreak,
      correct: this.outcomes.filter((o) => o.correct).length,
      total: this.round.questions.length,
      boosts,
      boostHits: this.outcomes.filter((o) => o.boosted && o.correct).length,
      collisions: this.outcomes.filter((o) => !o.correct).length,
      novasUsed: this.novasUsed,
      anomaly: anomaly
        ? {
            score: anomaly.anomalyScore ?? 0,
            correct: anomaly.correct,
            verdict: anomaly.anomalyVerdict ?? "",
          }
        : null,
      outcomes: [...this.outcomes],
      samples: [...this.samples],
      events: [...this.events],
      durationSeconds: this.elapsed,
    };
  }
}

