import { QuestionAsteroid } from "./QuestionAsteroid";
import { labelsForQuestion, laneToValue, scoreAnswer } from "./scoring";
import { QUESTION, SCORING, SHIP, WORLD } from "./Tuning";
import type { AnswerEvent, Band, Question, Round } from "./types";

/**
 * Runs the round: spawns each question as a set of lane asteroids, locks the
 * answer in when the set reaches the commit line, scores it, and drives the
 * consequences (colour, boost, shake, collision) through the hooks below.
 *
 * Progression is by distance, not time, so pacing stays constant as the
 * speed ramps.
 */

export interface QuizHooks {
  /** Read the ship's continuous lane position at commit. */
  lanePosition(): number;
  lane(): number;
  setSpeedMultiplier(multiplier: number): void;
  shake(intensity: number): void;
  pulseExhaust(strength: number): void;
  onAnswer?(event: AnswerEvent): void;
  onRoundEnd?(): void;
}

export class Quiz {
  readonly asteroids: QuestionAsteroid[];

  score = 0;
  hull = 1;
  readonly bands: Band[] = [];

  /** Index into round.questions of the set in flight, or -1 between sets. */
  private index = -1;
  private committed = false;
  private chosen: QuestionAsteroid | null = null;
  private spawnedAt = 0;
  /** Seconds left before the rocks of the announced set spawn. */
  private previewTimer = 0;
  private rocksLive = false;
  private nextSpawnDistance: number = QUESTION.firstGapDistance;
  private boostTimer = 0;
  private finished = false;

  constructor(
    private readonly round: Round,
    asteroids: QuestionAsteroid[],
    private readonly hooks: QuizHooks,
  ) {
    this.asteroids = asteroids;
  }

  get activeQuestion(): number {
    return this.index;
  }

  get answering(): boolean {
    return this.index >= 0 && !this.committed;
  }

  /** True once the announced set's rocks are in flight. */
  get rocksInFlight(): boolean {
    return this.rocksLive;
  }

  get question(): Question | undefined {
    return this.index >= 0 ? this.round.questions[this.index] : undefined;
  }

  get questionsAnswered(): number {
    return this.bands.length;
  }

  /** What the ship's current X would answer, for the live HUD readout. */
  liveGuess(lanePosition: number): number | null {
    const question = this.question;
    if (!question || this.committed || question.type === "mcq") return null;
    return laneToValue(question, lanePosition);
  }

  update(dt: number, speed: number, distance: number, elapsed: number): void {
    this.asteroids.forEach((asteroid) => asteroid.update(dt, speed));

    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) this.hooks.setSpeedMultiplier(1);
    }

    if (this.finished) return;

    if (this.index >= 0) {
      if (!this.rocksLive) {
        // Preview: the prompt is up, the rocks are not yet. Let the player
        // read and pre-steer.
        this.previewTimer -= dt;
        if (this.previewTimer <= 0) this.spawnRocks();
        return;
      }
      this.updateSet(elapsed, distance);
      return;
    }

    if (distance >= this.nextSpawnDistance) this.announce(elapsed);
  }

  /** Put the next question on the HUD; its rocks follow after the preview. */
  private announce(elapsed: number): void {
    const { questions } = this.round;
    const next = this.bands.length;
    if (next >= questions.length) {
      this.finished = true;
      this.hooks.onRoundEnd?.();
      return;
    }

    this.index = next;
    this.committed = false;
    this.chosen = null;
    this.rocksLive = false;
    this.spawnedAt = elapsed;
    this.previewTimer = QUESTION.previewSeconds;
  }

  private spawnRocks(): void {
    const question = this.question;
    if (!question) return;

    this.rocksLive = true;
    const labels = labelsForQuestion(question, WORLD.laneCount);
    for (let lane = 0; lane < WORLD.laneCount; lane += 1) {
      this.asteroids[lane]?.spawn(lane, labels[lane] ?? "");
    }
  }

  private updateSet(elapsed: number, distance: number): void {
    if (!this.committed) {
      // The set is committed when its lead rock crosses the commit line. The
      // ship's X at that instant is the answer.
      const lead = this.asteroids[0];
      if (lead && lead.active && lead.group.position.z >= QUESTION.commitZ) {
        this.commit(elapsed);
      }
      return;
    }

    // Collision: the chosen rock shatters as it reaches the ship.
    if (this.chosen && this.chosen.active && !this.chosen.shattering) {
      if (this.chosen.group.position.z >= SHIP.z - QUESTION.radius * 0.6) {
        this.chosen.shatter();
        this.hooks.shake(0.7);
      }
    }

    // Once every rock in the set has retired, open the gap to the next one.
    if (this.asteroids.every((asteroid) => !asteroid.active)) {
      this.index = -1;
      this.chosen = null;
      this.rocksLive = false;
      // Next set spawns a fixed distance after this one clears.
      this.nextSpawnDistance = distance + QUESTION.gapDistance;
    }
  }

  private commit(elapsed: number): void {
    const question = this.question;
    if (!question) return;

    const lanePosition = this.hooks.lanePosition();
    const lane = this.hooks.lane();
    const result = scoreAnswer({
      question,
      lanePosition,
      lane,
      elapsed: elapsed - this.spawnedAt,
      window: elapsed - this.spawnedAt,
    });

    this.committed = true;
    this.score += result.points;
    this.hull = Math.max(0, Math.min(1, this.hull + result.hullDelta));
    this.bands.push(result.band);

    this.chosen = this.asteroids[lane] ?? null;
    for (const asteroid of this.asteroids) {
      asteroid.setResolved(result.accuracy, asteroid === this.chosen);
    }

    this.hooks.setSpeedMultiplier(result.speedMultiplier);
    this.boostTimer = SCORING.boostSeconds;
    if (result.accuracy >= SCORING.close) this.hooks.pulseExhaust(1.2);
    if (result.band === "miss") this.hooks.shake(1);

    this.hooks.onAnswer?.({ questionIndex: this.index, question, result });
  }
}
