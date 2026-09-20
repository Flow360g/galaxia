import { earthLadder } from "./feed";
import { Flight, clamp01, outcomeKind } from "./Flight";
import { fromSlider, resolveClusterNova, resolveNova, resolveVectorNova, toSlider } from "./nova";
import { maxScoreFor, scoreLines, scoreOutcome } from "./Score";
import {
  CLUSTER,
  COUNTDOWN,
  ENCOUNTER,
  LANE,
  NOVA,
  SCORE,
  SHIELDS,
  STATION,
  VECTOR,
  WAYPOINT,
} from "./Tuning";
import type {
  ClusterQuestion,
  ClusterState,
  FlightSample,
  GameState,
  NovaResult,
  Outcome,
  Phase,
  Pulse,
  Question,
  Rating,
  Round,
  RunEvent,
  RunSummary,
  VectorState,
  WaypointState,
} from "./types";

/**
 * The run: seven encounters, one after another, each a state machine step.
 *
 *   intro -> approach -> collecting -> resolving -> aftermath -> approach ...
 *                                                  ... -> station -> docked -> finished
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
  /**
   * The launch countdown ticked over. `step` is 3, 2 or 1, then 0 for GO.
   * Fired once per number, not per frame.
   */
  onCountdown(step: number): void;
  /** A new question is called. Nothing is in the sky yet. */
  onEncounterStart(index: number, question: Question): void;
  /** A lane was picked. Veer into it and launch the pod or the boulder. */
  onPick(lane: number, correct: boolean): void;
  /**
   * Cluster: a boulder is in the lane but the cluster's own shield is up.
   * The boulder makes its final run; `onShieldHit` lands `ENCOUNTER.strikeSeconds`
   * later. Nothing in the flight model changes: the shield takes the whole hit.
   */
  onShieldStrike(lane: number): void;
  /** Contact on a shielded lane. Break the boulder, flash the shield, carry on. */
  onShieldHit(lane: number): void;
  /**
   * The lane was clean: the pod is collected. `charge` is the reactor total
   * after it, or 0 on a question with no reactor.
   */
  onCollect(lane: number, charge: number): void;
  /** Vector: the aim moved. `t` is the slider position, 0..1 left to right. */
  onAim(t: number): void;
  /**
   * Vector: locked. The scout slides to `truthT` whatever happened; whether
   * the ship's gun goes off at all is the engine's call, off `outcome`.
   */
  onVectorLock(outcome: Outcome, truthT: number): void;
  /** A stage ended. Play the card; the next encounter starts after `WAYPOINT.seconds`. */
  onWaypoint(info: WaypointState): void;
  /** The answer locked. Whatever is in the lane strikes; the ship reacts. */
  onLock(index: number, outcome: Outcome): void;
  /** Contact. Velocity has just changed; play the burst or the impact. */
  onContact(index: number, outcome: Outcome): void;
  onFinished(): void;
  /** WHERE ON EARTH: the ship is aboard. The station screen takes over from the scene. */
  onDock(): void;
}

const SAMPLE_INTERVAL = 0.25;

interface ClusterProgress {
  picked: number[];
  charge: number;
  eliminated: number[];
  /** The cluster's own shields, see `CLUSTER.shields`. */
  shields: number;
  /** Wrong lanes a shield took. */
  struck: number[];
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
  /** The score. Distance is still tracked; this is what the run is played for. */
  score = 0;
  /** What a perfect run would score. Fixed by the round. */
  readonly maxScore: number;
  /**
   * The run is parked on a toast or a waypoint card, waiting to be tapped on.
   * Nothing advances on a timer once a verdict is up: the player reads it and
   * says when they are done with it.
   */
  awaitingTap = false;

  elapsed = 0;
  private timer: number = ENCOUNTER.introSeconds;
  /**
   * Where the launch countdown has got to: 3, 2, 1, then 0 for GO, and null
   * once the run is flying. Held rather than derived every read so a step
   * change can be noticed and announced exactly once.
   */
  private countdown: number | null = null;
  private thrustSeconds: number = ENCOUNTER.thrustSeconds;
  /**
   * Seconds the clock is held full at the top of an approach. A beat to read
   * what just happened before the countdown starts costing anything.
   */
  private grace = 0;
  private pending: Outcome | null = null;
  private struck = false;
  private sampleTimer = 0;
  private novasUsed = 0;
  private shieldLost = false;
  private pulseId = 0;
  private cluster: ClusterProgress | null = null;
  /**
   * A full gauge holds the clock. Every right lane is found, there is nothing
   * left to pick, and the run waits on the player firing the boost rather
   * than spending it for them.
   */
  private clusterHold = false;
  /**
   * The gauge emptying into the engines: the charge that went in, and the
   * sweep back to the peg, 1 to 0.
   */
  private burnCharge = 0;
  private burnDrain = 0;
  private pendingPick: { lane: number; correct: boolean } | null = null;
  /**
   * A boulder the cluster's shield is about to take: the lane it is in while
   * its final run plays out, or null. Sits in `collecting` like a pick does.
   */
  private absorbing: number | null = null;
  /** Vector aim in slider space, and the window a NOVA scan left open. */
  private vectorT = 0.5;
  private vectorWindow: [number, number] = [0, 1];
  private vectorsFlown = 0;
  /** Strength of the pending vector lock's burst (glancing hits are partial). */
  private vectorStrength = 1;
  private waypoint: WaypointState | null = null;
  private readonly ratings: Rating[] = [];
  /** WHERE ON EARTH: the engine has reported the ship alongside the station. */
  private stationReady = false;
  /** WHERE ON EARTH: intel rungs bought and optics levels paid for, this site. */
  private earthIntel = 0;
  private earthOptics: number[] = [];
  /** True once the feed's imagery has arrived and the clock may run. */
  private feedReady = false;

  constructor(
    private readonly round: Round,
    private readonly hooks: RunHooks,
    private readonly random: () => number,
  ) {
    this.maxScore = maxScoreFor(round);
    this.sample();
  }

  get question(): Question | undefined {
    return this.index >= 0 ? this.round.questions[this.index] : undefined;
  }

  get answering(): boolean {
    return this.phase === "approach";
  }

  /** Whether a NOVA scan would land right now. The HUD and the sound ask. */
  get canNova(): boolean {
    const question = this.question;
    if (!this.answering || !question || question.type === "earth") return false;
    // A held gauge has nothing left to scan: every lane is already picked.
    if (this.clusterHold) return false;
    return this.novaLeft > 0 && !this.nova;
  }

  get state(): GameState {
    return {
      phase: this.phase,
      encounter: this.index,
      resolved: this.outcomes.length,
      score: this.score,
      maxScore: this.maxScore,
      distance: this.flight.distance,
      velocity: this.flight.velocity,
      peakVelocity: this.flight.peakVelocity,
      streak: this.flight.streak,
      thrust: this.thrust,
      boostArmed: this.boostArmed,
      novaLeft: this.novaLeft,
      nova: this.nova,
      cluster: this.clusterState(),
      burnCharge: this.burnCharge,
      burnDrain: this.burnDrain,
      vector: this.vectorState(),
      waypoint: this.phase === "waypoint" ? this.waypoint : null,
      stationReady: this.stationReady,
      clockSeconds: this.thrustSeconds,
      readSeconds: this.phase === "reading" ? Math.max(0, this.timer) : 0,
      countdown: this.countdown,
      shields: this.shields,
      feedReady: this.feedReady,
      feedSeconds: this.phase === "docked" ? Math.max(0, this.timer) : 0,
      earthIntel: this.earthIntel,
      earthOptics: this.earthOptics,
      maxShields: SHIELDS.perRun,
      pulse: this.pulse,
      outcome:
        this.phase === "aftermath" || this.phase === "docked" || this.phase === "finished"
          ? this.outcome
          : null,
      awaitingTap: this.awaitingTap,
      running: true,
    };
  }

  private clusterState(): ClusterState | null {
    const cluster = this.cluster;
    if (
      !cluster ||
      (this.phase !== "reading" && this.phase !== "approach" && this.phase !== "collecting")
    ) {
      return null;
    }
    return {
      picked: cluster.picked,
      charge: cluster.charge,
      projected: this.burnImpulse(cluster.charge),
      projectedNext: this.burnImpulse(cluster.charge + 1),
      eliminated: cluster.eliminated,
      full: this.clusterHold,
      shields: cluster.shields,
      struck: cluster.struck,
    };
  }

  private vectorState(): VectorState | null {
    const question = this.question;
    if (!question || question.type !== "vector" || !this.answering) return null;
    return {
      t: this.vectorT,
      value: fromSlider(question, this.vectorT),
      window: this.vectorWindow,
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
    if (cluster.struck.includes(lane)) return;

    this.beginPick(lane, question.answers.includes(lane));
  }

  /**
   * Cluster: the question has been read, open the lanes. The read clock
   * calls this too when it runs out; either way the pick clock starts here
   * and not a moment before.
   */
  ready(): void {
    if (this.phase !== "reading") return;
    this.openLanes();
  }

  /**
   * Commit to a lane. The ship veers, the pod or the boulder is launched, and
   * the verdict lands when the run-in finishes. Input is shut for the whole
   * of it, and the clock is frozen: the flight time is not the player's.
   */
  private beginPick(lane: number, correct: boolean): void {
    this.pulse = null;
    this.grace = 0;
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

    // The gauge empties as the charge goes in, so the boost is seen being
    // spent rather than simply gone.
    this.clusterHold = false;
    this.burnCharge = cluster.charge;
    this.burnDrain = 1;

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

  /** Vector: move the aim. Clamped to the NOVA window. Never changes phase. */
  aim(t: number): void {
    const question = this.question;
    if (!this.answering || !question || question.type !== "vector") return;
    const [lo, hi] = this.vectorWindow;
    this.vectorT = Math.min(hi, Math.max(lo, Number.isFinite(t) ? t : this.vectorT));
    this.hooks.onAim(this.vectorT);
  }

  /** Vector: fire on the current aim. */
  lockVector(): void {
    const question = this.question;
    if (!this.answering || !question || question.type !== "vector") return;

    const guess = fromSlider(question, this.vectorT);
    const truthT = toSlider(question, question.answer);
    // How far off, as a fraction of the truth. The same bands for every
    // question, log-scaled or not: "within 10%" means one thing in the game.
    const error = Math.abs(guess - question.answer) / Math.max(Math.abs(question.answer), 1e-9);
    const { direct, close, graze } = VECTOR.bands;

    let kind: Outcome["kind"];
    let strength = 1;
    let severity = 1;
    let salvage: Outcome["salvage"];
    if (error <= direct) {
      kind = "slingshot";
      salvage = this.shields < SHIELDS.perRun ? "shield" : "nova";
    } else if (error <= close) {
      kind = "thread";
      const across = (error - direct) / Math.max(close - direct, 1e-6);
      strength = 1 - across * (1 - VECTOR.glanceFloor);
    } else if (error <= graze) {
      // Clipped the scout. Nothing is earned and nothing is taken: the shot
      // was good enough not to be punished, and not good enough to pay.
      kind = "graze";
      strength = 0;
      severity = 0;
    } else {
      kind = outcomeKind(false, false, false, this.shields > 0);
      // How wrong, not just wrong: a shot that grazed the tolerance costs a
      // fraction of what a wild one does.
      severity = missSeverity(error);
      if (this.shields > 0) {
        this.shields -= 1;
        this.shieldLost = true;
      }
      // No banner yet. Nothing has happened to the ship at this point: the
      // shot was simply not taken. The damage lands when the scout fires,
      // and `contact` puts it on screen then.
    }

    this.vectorStrength = strength;
    const outcome: Outcome = {
      kind,
      correct: error <= close,
      boosted: false,
      timedOut: false,
      thrustLeft: this.thrust,
      velocityBefore: this.flight.velocity,
      velocityAfter: this.flight.velocity,
      streakBefore: this.flight.streak,
      streakAfter: this.flight.streak,
      chosen: null,
      guessText: formatValue(guess, question.unit),
      answerText: formatValue(question.answer, question.unit),
      error,
      guessValue: guess,
      severity,
      ...(salvage ? { salvage } : {}),
    };
    // A shot that is taken resolves almost instantly: the bolt crosses and
    // the scout goes up in one event. A shot that is not taken leaves a beat
    // of silence before the scout fires back. A graze is a shot taken.
    this.lock(outcome, error <= graze ? VECTOR.strikeSeconds : VECTOR.returnDelaySeconds);
    this.hooks.onVectorLock(outcome, truthT);
  }

  /**
   * The player tapped to move on. Only ever called while `awaitingTap`, and
   * the one thing that advances a toast or a waypoint card.
   */
  confirm(): void {
    if (!this.awaitingTap) return;
    this.awaitingTap = false;
    if (this.phase === "waypoint") {
      this.startEncounter(this.index + 1);
      return;
    }
    if (this.phase === "aftermath") {
      if (!this.startWaypoint()) this.startEncounter(this.index + 1);
    }
  }

  toggleBoost(): void {
    if (!this.answering) return;
    const type = this.question?.type;
    if (type === "cluster" || type === "vector" || type === "earth") return;
    this.boostArmed = !this.boostArmed;
  }

  /** Spend a NOVA scan on the current question. */
  useNova(): void {
    const question = this.question;
    if (!this.canNova || !question || question.type === "earth") return;

    this.novaLeft -= 1;
    this.novasUsed += 1;
    // A lifeline, not a trade: the scan puts seconds back on the clock. The
    // tank is stretched to hold them, so the bar climbs without overfilling
    // and `clockSeconds` keeps quoting the right total.
    const remaining = this.thrust * this.thrustSeconds + NOVA.bonusSeconds;
    this.thrustSeconds += NOVA.bonusSeconds;
    this.thrust = Math.min(remaining / this.thrustSeconds, 1);

    if (question.type === "cluster") {
      const cluster = this.cluster;
      this.nova = resolveClusterNova(question, cluster?.picked ?? [], this.random);
      if (cluster) cluster.eliminated = [...this.nova.eliminated];
    } else if (question.type === "vector") {
      const scan = resolveVectorNova(question, this.random);
      this.vectorWindow = scan.window;
      this.nova = { kind: "narrow", eliminated: [], highlighted: [], clue: null };
      this.aim(this.vectorT);
    } else if (question.type === "mcq") {
      this.nova = resolveNova(question, this.random);
    }
  }

  // ------------------------------------------------------- WHERE ON EARTH

  /**
   * The engine's fly-in is over: the ship is alongside the station. Arms
   * ENTER SPACE STATION. Idempotent, and ignored outside the approach.
   */
  arriveAtStation(): void {
    if (this.phase !== "station") return;
    this.stationReady = true;
  }

  /** ENTER SPACE STATION. The station screen takes over from the scene. */
  enterStation(): void {
    if (this.phase !== "station" || !this.stationReady) return;
    this.phase = "docked";
    this.pulse = null;
    this.earthIntel = 0;
    this.earthOptics = [];
    this.feedReady = false;
    this.awaitingTap = false;
    this.timer = STATION.answerSeconds;
    this.hooks.onDock();
  }

  /**
   * The feed's imagery has arrived. Until this lands the clock is held: tiles
   * come off a public service over the player's own connection and can take
   * tens of seconds, and a site spent staring at a black square while the
   * countdown drains is not a question, it is a coin flip. The engine also
   * calls this on a grace timeout, so a tile that never resolves cannot
   * freeze the run.
   */
  feedArrived(): void {
    if (this.phase !== "docked" || this.feedReady) return;
    this.feedReady = true;
    this.timer = STATION.answerSeconds;
  }

  /**
   * Buy the next rung of intel on this site. Costs a share of the base.
   * Capped at the site's ladder: a double tap on the last rung must not pay
   * for a hint that does not exist.
   */
  buyIntel(): void {
    if (this.phase !== "docked" || !this.feedReady) return;
    const question = this.question;
    if (!question || question.type !== "earth") return;
    if (this.earthIntel >= earthLadder(question).length) return;
    this.earthIntel += 1;
  }

  /**
   * Work the optics. Charged once per level per site, so stepping back to a
   * level already paid for is free and the dial can be worked without being
   * punished for changing your mind.
   */
  setOptics(step: number): void {
    if (this.phase !== "docked" || !this.feedReady) return;
    if (step !== 0 && !this.earthOptics.includes(step)) this.earthOptics.push(step);
  }

  /**
   * Name the site. A right call scores the finale's double base less whatever
   * was bought; a wrong one costs a shield and the streak, exactly like any
   * other miss, because the station is an encounter and not a cutscene.
   *
   * With two sites on the feed the run stays docked between them: the approach
   * is flown once, and the second site begins where the first was answered.
   */
  submitSite(text: string, timedOut = false): void {
    const question = this.question;
    if (this.phase !== "docked" || !question || question.type !== "earth") return;

    const guess = normaliseGuess(text);
    const correct =
      !timedOut &&
      guess.length >= 3 &&
      question.accept.some((entry) => guess.includes(normaliseGuess(entry)));

    const kind = correct ? "thread" : outcomeKind(false, false, timedOut, this.shields > 0);
    if (!correct && this.shields > 0) {
      this.shields -= 1;
      this.shieldLost = true;
    }

    const streakBefore = this.flight.streak;
    const velocityBefore = this.flight.velocity;
    const thrustLeft = Math.max(0, this.timer / STATION.answerSeconds);
    // The feed has no lane to fly down, so the outcome lands here rather than
    // through `lock` and `contact`: there is nothing in flight to wait for.
    const velocityAfter = this.flight.applyOutcome(kind, thrustLeft);

    this.record({
      kind,
      correct,
      boosted: false,
      timedOut,
      thrustLeft,
      velocityBefore,
      velocityAfter,
      streakBefore,
      streakAfter: this.flight.streak,
      chosen: null,
      guessText: text.trim(),
      answerText: answerTextFor(question),
      earthIntel: this.earthIntel,
      earthOptics: this.earthOptics.length,
    });

    this.awaitingTap = true;
  }

  /**
   * Past the verdict on a site. The next site, if there is one, starts here
   * rather than back at the approach; otherwise the run is over.
   */
  nextSite(): void {
    if (this.phase !== "docked" || !this.awaitingTap) return;
    const next = this.round.questions[this.index + 1];
    if (next && next.type === "earth") {
      this.index += 1;
      this.earthIntel = 0;
      this.earthOptics = [];
      this.feedReady = false;
      this.awaitingTap = false;
      this.outcome = null;
      this.timer = STATION.answerSeconds;
      this.hooks.onEncounterStart(this.index, next);
      return;
    }
    this.finish();
  }

  // ---------------------------------------------------------------- update

  /**
   * Aboard: the only clock still running.
   *
   * The engine parks itself while the station screen is up, so `update` is not
   * being called, and that is deliberate twice over: the world is asleep, and
   * the flight is too. A run whose distance kept climbing through a minute of
   * questions would be lying about how far it flew. But the answer clock is
   * the run's, so it has to be stepped from somewhere, and this is the whole
   * of what the docked screen advances. Without it the countdown sat at its
   * full 40 and a site could be stared at forever.
   */
  tickDocked(dt: number): void {
    if (this.phase !== "docked") return;
    this.elapsed += dt;

    // The clock starts when the imagery does, never before, and stops the
    // moment a verdict is up.
    if (!this.awaitingTap && this.feedReady) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.submitSite("", true);
      }
    }

    // No `sample()`: those are flight telemetry for the share card's speed
    // trace, and a docked ship has no velocity or distance worth recording.
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.flight.update(dt);

    // The gauge sweeping back to the peg outlives the phase that fired it, so
    // it keeps draining through the burn and its verdict.
    if (this.burnDrain > 0) {
      this.burnDrain = Math.max(this.burnDrain - dt / CLUSTER.gauge.drainSeconds, 0);
      if (this.burnDrain === 0) this.burnCharge = 0;
    }

    this.sampleTimer += dt;
    if (this.sampleTimer >= SAMPLE_INTERVAL) {
      this.sampleTimer = 0;
      this.sample();
    }

    switch (this.phase) {
      case "intro": {
        this.timer -= dt;
        // The engines lighting IS the countdown. One announcement per number.
        const step = countdownStep(this.timer);
        if (step !== this.countdown) {
          this.countdown = step;
          if (step !== null) this.hooks.onCountdown(step);
        }
        if (this.timer <= 0) this.startEncounter(0);
        break;
      }

      case "reading":
        // The question alone. READY opens the lanes; so does this clock, so
        // a player who never finds the button is still not stuck.
        this.timer -= dt;
        if (this.timer <= 0) this.openLanes();
        break;

      case "approach":
        // A full gauge holds the clock: the boost is fired on a tap, not on a
        // stopwatch.
        if (this.clusterHold) break;
        if (this.grace > 0) {
          this.grace -= dt;
          break;
        }
        this.thrust -= dt / this.thrustSeconds;
        if (this.thrust <= 0) {
          this.thrust = 0;
          this.timeOut();
        }
        break;

      case "collecting":
        // Thrust is frozen while the pick is in flight; the verdict lands on
        // the timer, not on the tank. A boulder the shield is taking makes
        // its final run on the same timer.
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.absorbing !== null) this.absorbHit();
          else this.resolvePick();
        }
        break;

      case "station":
        // The approach runs on the engine, not the clock: it says when the
        // ship is alongside, and the player says when to go aboard.
        break;

      case "docked":
        // Nothing: the engine is parked while the station screen is up and is
        // not calling this at all. The answer clock runs in `tickDocked`.
        break;

      case "resolving":
        this.timer -= dt;
        if (!this.struck && this.timer <= ENCOUNTER.resolveSeconds) this.contact();
        if (this.timer <= 0) {
          this.phase = "aftermath";
          this.timer = ENCOUNTER.confirmArmSeconds;
        }
        break;

      case "aftermath":
        // A short beat so the tap that answered cannot skip its own verdict,
        // then it sits here until the player taps. No timer takes it away.
        if (this.awaitingTap) break;
        this.timer -= dt;
        if (this.timer <= 0) this.awaitingTap = true;
        break;

      case "waypoint":
        if (this.awaitingTap) break;
        this.timer -= dt;
        if (this.waypoint) this.waypoint.t = WAYPOINT.seconds - this.timer;
        if (this.timer <= 0) this.awaitingTap = true;
        break;

      case "finished":
        break;
    }
  }

  // -------------------------------------------------------------- internals

  /**
   * If a stage ends on the encounter just flown, and another follows, play
   * the waypoint. Returns false when the run should just carry on.
   */
  private startWaypoint(): boolean {
    const stages = this.round.stages ?? [];
    const stageIndex = stages.findIndex((stage) => stage.after === this.index);
    const stage = stages[stageIndex];
    const next = stages[stageIndex + 1];
    const nextQuestion = this.round.questions[this.index + 1];
    if (!stage || !next || !nextQuestion) return false;

    const plasma = this.outcomes.reduce((sum, o) => sum + (o.kind === "burn" ? (o.charge ?? 0) : 0), 0);
    const rating = rateStage(plasma, this.shields);
    this.ratings.push(rating);
    const closing = this.events[this.events.length - 1];
    if (closing) closing.rating = rating;
    this.waypoint = {
      stage: stage.name,
      next: next.name,
      nextType: nextQuestion.type,
      // Stages count from phase 1, so the stage after this one is index + 2.
      nextPhase: next.phase ?? stageIndex + 2,
      rating,
      plasma,
      shields: this.shields,
      peakVelocity: this.flight.peakVelocity,
      t: 0,
    };
    this.pulse = null;
    this.phase = "waypoint";
    this.awaitingTap = false;
    this.timer = WAYPOINT.seconds;
    this.hooks.onWaypoint(this.waypoint);
    return true;
  }

  private startEncounter(index: number): void {
    const question = this.round.questions[index];
    if (!question) {
      this.finish();
      return;
    }

    this.index = index;
    // WHERE ON EARTH is untimed: the ship flies in, nothing is tappable
    // until it arrives, and the clock never starts. A cluster opens on its
    // question alone and waits for READY (or the read clock) before the
    // lanes and the pick clock come up.
    this.phase =
      question.type === "earth" ? "station" : question.type === "cluster" ? "reading" : "approach";
    if (question.type === "cluster") this.timer = CLUSTER.readSeconds;
    this.stationReady = false;
    // Throttle back to dock. Velocity relaxes to the crawl on the flight
    // model's own curve, so the readout, the FOV and the drone fall together.
    if (question.type === "earth") this.flight.throttle = STATION.dockThrottle;
    this.awaitingTap = false;
    this.thrust = 1;
    this.boostArmed = false;
    this.nova = null;
    this.pulse = null;
    this.pending = null;
    this.pendingPick = null;
    this.absorbing = null;
    this.struck = false;
    this.cluster =
      question.type === "cluster"
        ? { picked: [], charge: 0, eliminated: [], shields: CLUSTER.shields, struck: [] }
        : null;
    this.clusterHold = false;
    this.burnCharge = 0;
    this.burnDrain = 0;
    this.vectorT = 0.5;
    this.vectorWindow = [0, 1];
    this.vectorStrength = 1;
    const vectorSlot = Math.min(this.vectorsFlown, VECTOR.thrustSeconds.length - 1);
    if (question.type === "vector") this.vectorsFlown += 1;
    this.thrustSeconds =
      question.type === "vector"
        ? VECTOR.thrustSeconds[vectorSlot]!
        : question.type === "cluster"
          ? // Six options and a prompt to read before the first tap. Every
            // pick after it drops back to the plain five.
            ENCOUNTER.thrustSeconds + CLUSTER.firstPickBonusSeconds
          : ENCOUNTER.thrustSeconds;
    this.grace = 0;

    this.hooks.onEncounterStart(index, question);
    if (question.type === "vector") this.hooks.onAim(this.vectorT);
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
      this.flash(
        "plasma",
        full ? `ALL ${question.answers.length} FOUND` : "CORRECT",
        full ? "TAP FIRE TO BANK IT" : "+1 PLASMA · SPEED UP",
      );
      this.hooks.onCollect(lane, cluster.charge);
      this.phase = "approach";
      // A fresh five seconds for the next decision, after a beat to see what
      // was banked. The prompt has been read by now, so no reading bonus.
      this.thrust = 1;
      this.thrustSeconds = ENCOUNTER.thrustSeconds;
      if (full) {
        // Nothing left to find, so nothing left to be timed on: the clock
        // stops and the gauge sits full until the player fires it.
        this.clusterHold = true;
      } else {
        this.grace = CLUSTER.collectPauseSeconds;
      }
      return;
    }

    if (question.type !== "mcq") {
      this.phase = "approach";
      return;
    }

    this.flash("plasma", "CORRECT", "SPEED UP");
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

  /**
   * A boulder in the lane.
   *
   * On a cluster the cluster's own shield takes the first one: the lane is
   * struck out and the clock comes back for the next pick, but the banked
   * plasma is lost (see `absorbHit`). With no cluster shield left the cluster
   * is over, for zero points and none of the run's shields.
   *
   * Everywhere else it costs one of the run's shields.
   */
  private resolveMiss(question: Question, lane: number): void {
    const cluster = this.cluster;

    if (question.type === "cluster" && cluster) {
      if (cluster.shields > 0) {
        cluster.shields -= 1;
        cluster.struck.push(lane);
        // The boulder's final run, then `absorbHit` on contact. The pulse
        // waits for the hit so the words land with the crack.
        this.absorbing = lane;
        this.phase = "collecting";
        this.timer = ENCOUNTER.strikeSeconds;
        this.hooks.onShieldStrike(lane);
        return;
      }

      const lost = cluster.charge;
      cluster.picked.push(lane);
      cluster.charge = 0;
      this.flash("shield", `WRONG · ${SCORE.penalty.cluster} POINTS`, lost > 0 ? `${lost} PLASMA LOST` : "NO SHIELD LEFT");
      this.phase = "approach";
      this.lock({
        kind: "collision",
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
        lost,
      });
      return;
    }

    const shielded = this.shields > 0;
    if (shielded) {
      this.shields -= 1;
      this.shieldLost = true;
      this.flash(
        "shield",
        "WRONG",
        this.shields > 0 ? `SHIELD USED · ${this.shields} LEFT` : "NO SHIELDS LEFT",
      );
    } else {
      this.flash("shield", "WRONG", "NO SHIELDS LEFT");
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

  /**
   * Cluster: the lanes come up and the first pick's clock starts. The prompt
   * has been read by now, so the bonus on this clock is for the six options.
   */
  private openLanes(): void {
    this.phase = "approach";
    this.thrust = 1;
    this.thrustSeconds = ENCOUNTER.thrustSeconds + CLUSTER.firstPickBonusSeconds;
    this.grace = 0;
  }

  /**
   * Contact on a shielded lane. The boulder breaks on the shield, so the ship
   * flies on and the question stays open, but the reactor is knocked out: the
   * banked plasma is lost and the next pick starts from empty. The shield saves
   * the player from skipping the rest of the question, not from the loss.
   * Velocity and streak are left where they were: the shield took the hit.
   */
  private absorbHit(): void {
    const lane = this.absorbing;
    const cluster = this.cluster;
    this.absorbing = null;
    if (lane === null || !cluster) {
      this.phase = "approach";
      return;
    }
    const lost = cluster.charge;
    cluster.charge = 0;
    this.flash("shield", "WRONG", lost > 0 ? "PLASMA LOST · KEEP GOING" : "SHIELD USED · KEEP GOING");
    this.hooks.onShieldHit(lane);
    this.phase = "approach";
    this.thrust = 1;
    this.thrustSeconds = ENCOUNTER.thrustSeconds;
    this.grace = CLUSTER.collectPauseSeconds;
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
    const answerText = answerTextFor(question);

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

    const strength = outcome.error !== undefined ? this.vectorStrength : 1;
    const multiplier =
      outcome.kind === "burn" ? (CLUSTER.chargeMultiplier[outcome.charge ?? 0] ?? 0) : 1;
    outcome.velocityBefore = this.flight.velocity;
    outcome.velocityAfter = this.flight.applyOutcome(
      outcome.kind,
      outcome.thrustLeft,
      strength,
      multiplier,
      outcome.severity ?? 1,
    );
    outcome.streakAfter = this.flight.streak;

    // The scout's shot landing on the hull. The ship took nothing at lock --
    // it simply did not fire -- so this is the moment the damage happens,
    // and the moment the screen says so.
    if (this.question?.type === "vector" && !outcome.correct && outcome.kind !== "graze") {
      const detail = outcome.timedOut
        ? "NO GUESS MADE"
        : outcome.kind === "wreck"
          ? "NO SHIELDS LEFT"
          : `SHIELD USED \u00b7 ${this.shields} LEFT`;
      this.flash("damage", outcome.timedOut ? "TOO SLOW" : "WAY OFF", detail);
    }

    // Salvage lands with the burst, so the HUD change and the FX line up.
    if (outcome.salvage === "shield") {
      this.shields = Math.min(this.shields + 1, SHIELDS.perRun);
      this.flash("plasma", "BONUS", "SHIELD BACK");
    } else if (outcome.salvage === "nova") {
      this.novaLeft += 1;
      this.flash("plasma", "BONUS", "+1 HINT");
    }

    this.record(outcome);
    this.hooks.onContact(this.index, outcome);
  }

  /** Score an outcome and write it into the record: the tally, the strip, the path. */
  private record(outcome: Outcome): void {
    // The score: fixed points, whole multipliers, a flat dock for a miss.
    const scored = scoreOutcome(outcome, this.question);
    outcome.base = scored.base;
    outcome.multiplier = scored.multiplier;
    outcome.points = scored.points;
    this.score = Math.max(this.score + scored.points, 0);
    outcome.scoreAfter = this.score;

    this.outcome = outcome;
    this.outcomes.push(outcome);
    this.events.push({
      t: this.elapsed,
      index: this.index,
      kind: outcome.kind,
      correct: outcome.correct,
      boosted: outcome.boosted,
      d: this.flight.distance,
      v: outcome.velocityAfter,
      streak: outcome.streakAfter,
      ...(outcome.kind === "burn" ? { charge: outcome.charge ?? 0 } : {}),
    });
    this.sample();
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
      score: this.score,
      maxScore: this.maxScore,
      lines: scoreLines(this.round, this.outcomes),
      distance: this.flight.distance,
      peakVelocity: this.flight.peakVelocity,
      bestStreak,
      correct: this.outcomes.filter((o) => o.correct).length,
      total: this.round.questions.length,
      boosts,
      boostHits: this.outcomes.filter((o) => o.boosted && o.correct).length,
      // A graze is neither: nothing struck the ship.
      collisions: this.outcomes.filter((o) => !o.correct && o.kind !== "graze").length,
      novasUsed: this.novasUsed,
      fullBurns: this.outcomes.filter((o) => o.kind === "burn" && (o.charge ?? 0) >= fullCharge)
        .length,
      shieldLost: this.shieldLost,
      shieldsLeft: this.shields,
      ratings: [...this.ratings],
      outcomes: [...this.outcomes],
      samples: [...this.samples],
      events: [...this.events],
      durationSeconds: this.elapsed,
    };
  }
}

/**
 * Typed answers are compared on letters and digits only, so punctuation,
 * accents and spacing never decide whether a player got it right.
 */
function normaliseGuess(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How hard a vector miss lands, 0..1, from its relative error.
 *
 * The edge of the graze band is where a miss begins: a shot that only just
 * missed costs `severityFloor` of a full impact. It ramps to a full impact at
 * `severityFullAt` and stays there, so a wild guess is the worst it gets.
 */
export function missSeverity(error: number): number {
  const from = VECTOR.bands.graze;
  const span = Math.max(VECTOR.severityFullAt - from, 1e-6);
  const across = clamp01((error - from) / span);
  return VECTOR.severityFloor + (1 - VECTOR.severityFloor) * across;
}

/** Stage rating from plasma banked. S also needs every shield still up. */
export function rateStage(plasma: number, shields: number): Rating {
  if (plasma >= WAYPOINT.ratings.S && shields >= SHIELDS.perRun) return "S";
  if (plasma >= WAYPOINT.ratings.A) return "A";
  if (plasma >= WAYPOINT.ratings.B) return "B";
  return "C";
}

/** A number with grouping and its unit, for toasts and the share record. */
export function formatValue(value: number, unit: string | undefined): string {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const text = rounded.toLocaleString("en-AU");
  return unit ? `${text} ${unit}` : text;
}

/** The three right answers, for the toast and the share record. */
function clusterAnswerText(question: ClusterQuestion): string {
  return question.answers.map((lane) => question.options[lane] ?? "").join(", ");
}

/** The right answer of any question, as the toast and the share record show it. */
function answerTextFor(question: Question): string {
  switch (question.type) {
    case "mcq":
    case "earth":
      return question.options[question.answer] ?? "";
    case "cluster":
      return clusterAnswerText(question);
    case "vector":
      return formatValue(question.answer, question.unit);
  }
}

/**
 * Where the launch countdown stands with `timer` seconds of intro left:
 * 3, 2, 1, then 0 for GO, and null once the run is under way. The numbers
 * are read off the clock rather than counted, so a dropped frame cannot skip
 * one or leave the run starting on "2".
 */
function countdownStep(timer: number): number | null {
  if (timer <= 0) return null;
  const { stepSeconds, goSeconds } = COUNTDOWN;
  if (timer > stepSeconds * 2 + goSeconds) return 3;
  if (timer > stepSeconds + goSeconds) return 2;
  if (timer > goSeconds) return 1;
  return 0;
}
