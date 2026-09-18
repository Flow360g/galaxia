import { anomalyCorrect, scoreLocally } from "./anomaly";
import { Flight, clamp01, outcomeKind } from "./Flight";
import { resolveClusterNova, resolveNova } from "./nova";
import { CLUSTER, ENCOUNTER, LANE, NOVA, SHIELDS } from "./Tuning";
import type {
  AnomalyQuestion,
  AnomalyVerdict,
  ClusterQuestion,
  ClusterState,
  FlightSample,
  GameState,
  NovaResult,
  Outcome,
  Phase,
  Pulse,
  Question,
  Round,
  RunEvent,
  RunSummary,
} from "./types";

/**
 * The run: seven encounters, one after another, each a state machine step.
 *
 *   intro -> approach -> (scanning | collecting) -> resolving -> aftermath -> approach ...
 *
 * Pure game logic. The engine subscribes through `RunHooks` to fly the ship,
 * launch what comes down the lane and light the fireworks; the HUD reads
 * `state`. Nothing in here knows about three.js or React, so the whole run
 * can be stepped in a test with a fake clock.
 *
 * Every picked answer is a LANE. Tapping a square commits the ship to that
 * lane and the verdict rides in on it: a plasma pod on a right answer, a
 * boulder on a wrong one. Nothing is in the sky until a lane is picked, so
 * the scene never gives the answer away.
 *
 * The clock is per pick, not per question: thrust refills for every decision
 * and runs out in `ENCOUNTER.thrustSeconds`. A Cluster is therefore several
 * short decisions, looping approach -> collecting -> approach until the
 * player burns, misses, or lets the clock run out.
 */

export interface RunHooks {
  /** A new question is called. Nothing is in the sky yet. */
  onEncounterStart(index: number, question: Question): void;
  /** A lane was picked. Veer into it and launch the pod or the boulder. */
  onPick(lane: number, correct: boolean): void;
  /**
   * The lane was clean: the pod is collected. `charge` is the reactor total
   * after it, or 0 on a question with no reactor.
   */
  onCollect(lane: number, charge: number): void;
  /** The answer locked. Whatever is in the lane strikes; the ship reacts. */
  onLock(index: number, outcome: Outcome): void;
  /** Contact. Velocity has just changed; play the burst or the impact. */
  onContact(index: number, outcome: Outcome): void;
  onFinished(): void;
  /** Score an anomaly answer. Must never reject; fall back locally instead. */
  scoreAnomaly(question: AnomalyQuestion, answer: string): Promise<AnomalyVerdict>;
}

const SAMPLE_INTERVAL = 0.25;

interface ClusterProgress {
  picked: number[];
  charge: number;
  eliminated: number[];
}

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
  /** Shields left. Every wrong lane costs one; at zero, a miss is a wreck. */
  shields: number = SHIELDS.perRun;
  /** The last resolved outcome, kept through its aftermath. */
  outcome: Outcome | null = null;
  /** The last collect or hit, for the HUD to flash over the scene. */
  pulse: Pulse | null = null;

  elapsed = 0;
  private timer: number = ENCOUNTER.introSeconds;
  private thrustSeconds: number = ENCOUNTER.thrustSeconds;
  private pending: Outcome | null = null;
  private struck = false;
  private sampleTimer = 0;
  private novasUsed = 0;
  private shieldLost = false;
  private pulseId = 0;
  private cluster: ClusterProgress | null = null;
  private pendingPick: { lane: number; correct: boolean } | null = null;
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
      clockSeconds: this.thrustSeconds,
      boostArmed: this.boostArmed,
      novaLeft: this.novaLeft,
      nova: this.nova,
      cluster: this.clusterState(),
      shields: this.shields,
      maxShields: SHIELDS.perRun,
      pulse: this.pulse,
      outcome: this.phase === "aftermath" || this.phase === "finished" ? this.outcome : null,
      running: true,
    };
  }

  private clusterState(): ClusterState | null {
    const cluster = this.cluster;
    if (!cluster || (this.phase !== "approach" && this.phase !== "collecting")) return null;
    return {
      picked: cluster.picked,
      charge: cluster.charge,
      projected: this.burnImpulse(cluster.charge),
      projectedNext: this.burnImpulse(cluster.charge + 1),
      eliminated: cluster.eliminated,
    };
  }

  /** km/h a burn at `charge` would add with the thrust left right now. */
  private burnImpulse(charge: number): number {
    const multiplier = CLUSTER.chargeMultiplier[charge] ?? 0;
    return this.flight.impulseFor(this.thrust) * multiplier;
  }

  // ---------------------------------------------------------------- input

  /** Pick an MCQ lane. Ignored unless an answer is open. */
  answer(option: number): void {
    const question = this.question;
    if (!this.answering || !question || question.type !== "mcq") return;
    if (option < 0 || option >= question.options.length) return;
    if (this.nova?.eliminated.includes(option)) return;

    this.beginPick(option, option === question.answer);
  }

  /** Cluster: pick a lane. The verdict rides in on it. */
  pick(lane: number): void {
    const question = this.question;
    const cluster = this.cluster;
    if (!this.answering || !question || question.type !== "cluster" || !cluster) return;
    if (lane < 0 || lane >= question.options.length) return;
    if (cluster.picked.includes(lane) || cluster.eliminated.includes(lane)) return;

    this.beginPick(lane, question.answers.includes(lane));
  }

  /**
   * Commit to a lane. The ship veers, the pod or the boulder is launched, and
   * the verdict lands when the run-in finishes. Input is shut for the whole
   * of it, and the clock is frozen: the flight time is not the player's.
   */
  private beginPick(lane: number, correct: boolean): void {
    this.pulse = null;
    this.pendingPick = { lane, correct };
    this.phase = "collecting";
    this.timer = LANE.runSeconds;
    this.hooks.onPick(lane, correct);
  }

  /** Cluster: bank the charge. Ignored with nothing in the reactor. */
  burn(): void {
    const question = this.question;
    const cluster = this.cluster;
    if (!this.answering || !question || question.type !== "cluster" || !cluster) return;
    if (cluster.charge <= 0) return;

    this.lock({
      kind: "burn",
      correct: true,
      boosted: false,
      timedOut: false,
      thrustLeft: this.thrust,
      velocityBefore: this.flight.velocity,
      velocityAfter: this.flight.velocity,
      streakBefore: this.flight.streak,
      streakAfter: this.flight.streak,
      chosen: null,
      guessText: cluster.picked.map((lane) => question.options[lane] ?? "").join(", "),
      answerText: clusterAnswerText(question),
      charge: cluster.charge,
      picks: [...cluster.picked],
    });
  }

  toggleBoost(): void {
    if (!this.answering || this.question?.type === "cluster") return;
    this.boostArmed = !this.boostArmed;
  }

  /** Spend a NOVA scan on the current question. */
  useNova(): void {
    const question = this.question;
    if (!this.answering || !question || question.type === "anomaly") return;
    if (this.novaLeft <= 0 || this.nova) return;

    this.novaLeft -= 1;
    this.novasUsed += 1;
    this.thrust = Math.max(this.thrust - NOVA.thrustCost, 0.02);

    if (question.type === "cluster") {
      const cluster = this.cluster;
      this.nova = resolveClusterNova(question, cluster?.picked ?? [], this.random);
      if (cluster) cluster.eliminated = [...this.nova.eliminated];
    } else {
      this.nova = resolveNova(question, this.random);
    }
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
        kind: outcomeKind(correct, boosted, false, this.shields > 0),
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

      case "collecting":
        // Thrust is frozen while the pick is in flight; the verdict lands on
        // the timer, not on the tank.
        this.timer -= dt;
        if (this.timer <= 0) this.resolvePick();
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
          this.timer = this.aftermathSeconds();
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
    this.pulse = null;
    this.pending = null;
    this.pendingPick = null;
    this.struck = false;
    this.cluster =
      question.type === "cluster" ? { picked: [], charge: 0, eliminated: [] } : null;
    this.thrustSeconds =
      question.type === "anomaly"
        ? ENCOUNTER.anomalyThrustSeconds
        : question.type === "cluster"
          ? CLUSTER.thrustSeconds
          : ENCOUNTER.thrustSeconds;

    this.hooks.onEncounterStart(index, question);
  }

  /**
   * The pick's verdict lands: fly through the pod, or take the boulder.
   *
   * A right lane on a Cluster charges the reactor and hands the clock back,
   * fresh, for the next decision. A right lane on an MCQ is the answer, so it
   * locks straight away, with a near-zero strike: the lane is clear and there
   * is nothing left to wait for.
   */
  private resolvePick(): void {
    const question = this.question;
    const pick = this.pendingPick;
    this.pendingPick = null;
    if (!question || !pick) {
      this.phase = "approach";
      return;
    }

    if (pick.correct) {
      this.resolveHit(question, pick.lane);
      return;
    }
    this.resolveMiss(question, pick.lane);
  }

  /** A clean lane. */
  private resolveHit(question: Question, lane: number): void {
    const cluster = this.cluster;

    if (question.type === "cluster" && cluster) {
      cluster.picked.push(lane);
      cluster.charge += 1;
      const full = cluster.charge >= question.answers.length;
      // The last plasma gets no banner of its own: MAXIMUM THRUST is arriving
      // a beat later and the two would land on top of each other.
      if (!full) {
        this.flash("plasma", "PLASMA COLLECTED", `+1 · ${cluster.charge} IN THE REACTOR`);
      }
      this.hooks.onCollect(lane, cluster.charge);
      this.phase = "approach";
      // A fresh five seconds for the next decision.
      this.thrust = 1;
      // Nothing left to find: the whole reactor goes in, no decision needed.
      if (full) this.burn();
      return;
    }

    if (question.type !== "mcq") {
      this.phase = "approach";
      return;
    }

    this.flash("plasma", "BOOSTER COLLECTED", "LANE CLEAR");
    this.hooks.onCollect(lane, 0);
    this.phase = "approach";
    this.lock(
      {
        kind: outcomeKind(true, this.boostArmed, false, this.shields > 0),
        correct: true,
        boosted: this.boostArmed,
        timedOut: false,
        thrustLeft: this.thrust,
        velocityBefore: this.flight.velocity,
        velocityAfter: this.flight.velocity,
        streakBefore: this.flight.streak,
        streakAfter: this.flight.streak,
        chosen: lane,
        guessText: question.options[lane] ?? "",
        answerText: question.options[question.answer] ?? "",
      },
      ENCOUNTER.clearSeconds,
    );
  }

  /** A boulder in the lane. It costs a shield, and everything in the reactor. */
  private resolveMiss(question: Question, lane: number): void {
    const cluster = this.cluster;
    const shielded = this.shields > 0;
    if (shielded) {
      this.shields -= 1;
      this.shieldLost = true;
      this.flash(
        "shield",
        "SHIELD DOWN",
        this.shields > 0 ? `${this.shields} SHIELD${this.shields === 1 ? "" : "S"} LEFT` : "NO SHIELDS LEFT",
      );
    } else {
      this.flash("shield", "HULL BREACH", "NO SHIELDS LEFT");
    }

    if (question.type === "cluster" && cluster) {
      cluster.picked.push(lane);
      this.phase = "approach";
      this.lock({
        kind: outcomeKind(false, false, false, shielded),
        correct: false,
        boosted: false,
        timedOut: false,
        thrustLeft: this.thrust,
        velocityBefore: this.flight.velocity,
        velocityAfter: this.flight.velocity,
        streakBefore: this.flight.streak,
        streakAfter: this.flight.streak,
        chosen: lane,
        guessText: question.options[lane] ?? "",
        answerText: clusterAnswerText(question),
        charge: 0,
        picks: [...cluster.picked],
      });
      return;
    }

    if (question.type !== "mcq") {
      this.phase = "approach";
      return;
    }

    this.phase = "approach";
    this.lock({
      kind: outcomeKind(false, this.boostArmed, false, shielded),
      correct: false,
      boosted: this.boostArmed,
      timedOut: false,
      thrustLeft: this.thrust,
      velocityBefore: this.flight.velocity,
      velocityAfter: this.flight.velocity,
      streakBefore: this.flight.streak,
      streakAfter: this.flight.streak,
      chosen: lane,
      guessText: question.options[lane] ?? "",
      answerText: question.options[question.answer] ?? "",
    });
  }

  /** How long the outcome holds before the next question is called. */
  private aftermathSeconds(): number {
    switch (this.question?.type) {
      case "anomaly":
        return ENCOUNTER.aftermathSecondsAnomaly;
      case "cluster":
        return CLUSTER.aftermathSeconds;
      default:
        return ENCOUNTER.aftermathSeconds;
    }
  }

  /** Raise a one-shot banner over the scene. */
  private flash(kind: Pulse["kind"], label: string, detail: string): void {
    this.pulse = { id: ++this.pulseId, kind, label, detail };
  }

  private timeOut(): void {
    const question = this.question;
    if (!question) return;

    // Running the clock down with plasma in the reactor banks it rather than
    // throwing it away. The risk in a Cluster is the wrong lane, not the
    // stopwatch, and five seconds a pick is tight enough already.
    if (question.type === "cluster" && this.cluster && this.cluster.charge > 0) {
      this.burn();
      return;
    }
    const answerText =
      question.type === "mcq"
        ? (question.options[question.answer] ?? "")
        : question.type === "cluster"
          ? clusterAnswerText(question)
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
      ...(this.cluster ? { charge: 0, picks: [...this.cluster.picked] } : {}),
    });
  }

  private forceLocal(question: AnomalyQuestion): void {
    // Answer text is not retained past submit; the deadline case marks as a
    // blank so the run keeps moving rather than stalling on a dead scorer.
    const verdict = scoreLocally(question, "");
    this.lock({
      kind: outcomeKind(false, this.boostArmed, false, this.shields > 0),
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

  /**
   * The answer is in. Whatever is in the lane strikes; velocity changes on
   * contact, `strikeSeconds` later.
   */
  private lock(outcome: Outcome, strikeSeconds: number = ENCOUNTER.strikeSeconds): void {
    this.pending = outcome;
    this.struck = false;
    this.phase = "resolving";
    this.timer = strikeSeconds + ENCOUNTER.resolveSeconds;
    this.hooks.onLock(this.index, outcome);
  }

  private contact(): void {
    const outcome = this.pending;
    if (!outcome) return;
    this.struck = true;

    const strength = outcome.anomalyScore ?? 1;
    const multiplier =
      outcome.kind === "burn" ? (CLUSTER.chargeMultiplier[outcome.charge ?? 0] ?? 0) : 1;
    outcome.velocityBefore = this.flight.velocity;
    outcome.velocityAfter = this.flight.applyOutcome(
      outcome.kind,
      outcome.thrustLeft,
      strength,
      multiplier,
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
      ...(outcome.kind === "burn" ? { charge: outcome.charge ?? 0 } : {}),
    });
    this.sample();

    this.hooks.onContact(this.index, outcome);
  }

  private finish(): void {
    this.phase = "finished";
    this.index = -1;
    this.cluster = null;
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
    const fullCharge = CLUSTER.chargeMultiplier.length - 1;

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
      fullBurns: this.outcomes.filter((o) => o.kind === "burn" && (o.charge ?? 0) >= fullCharge)
        .length,
      shieldLost: this.shieldLost,
      shieldsLeft: this.shields,
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

/** The three right answers, for the toast and the share record. */
function clusterAnswerText(question: ClusterQuestion): string {
  return question.answers.map((lane) => question.options[lane] ?? "").join(", ");
}
