import { CLUSTER, FLIGHT } from "./Tuning";
import type { Outcome, OutcomeKind } from "./types";

/**
 * The velocity model. Pure: no three.js, no DOM, so it can be reasoned about
 * and tested on its own.
 *
 * Distance is a speedometer integrated over the whole run, not seven point
 * awards. Correct answers add an impulse and raise the cruise floor through
 * the streak; wrong answers collapse velocity and reset the floor. Between
 * events velocity relaxes toward the floor, so a burst is a burst and the
 * streak is what you keep.
 */
export class Flight {
  /** km/h. */
  velocity: number = FLIGHT.cruise;
  /** km. The score. */
  distance = 0;
  streak = 0;
  peakVelocity: number = FLIGHT.cruise;
  /**
   * Scales the cruise floor, 0..1. Throttling back does not touch velocity
   * directly: it lowers the floor and lets velocity relax down to it on the
   * same curve everything else rides, so a slowdown reads as one.
   */
  throttle = 1;

  /** The floor velocity relaxes toward, set by the streak. */
  get cruise(): number {
    const steps = Math.min(this.streak, FLIGHT.streakCap);
    return FLIGHT.cruise * (1 + FLIGHT.streakCruiseGain * steps) * this.throttle;
  }

  /** World units per second for the scene. */
  get worldSpeed(): number {
    return this.velocity * FLIGHT.worldScale;
  }

  /** 0..1 across the visual band, for FOV, streaks and exhaust. */
  get visualRatio(): number {
    const range = Math.max(FLIGHT.visualMaxVelocity - FLIGHT.cruise, 1);
    return clamp01((this.velocity - FLIGHT.cruise) / range);
  }

  update(dt: number): void {
    const cruise = this.cruise;
    const rate = this.velocity > cruise ? FLIGHT.decayRate : FLIGHT.recoveryRate;
    // Framerate-independent exponential relaxation toward the floor.
    this.velocity += (cruise - this.velocity) * (1 - Math.exp(-rate * dt));
    this.distance += (this.velocity / 3600) * FLIGHT.distanceTimeScale * dt;
  }

  /** The km/h a correct answer would add right now, before boost. */
  impulseFor(thrustLeft: number): number {
    const base = FLIGHT.impulseBase + FLIGHT.impulseThrust * clamp01(thrustLeft);
    return base * (1 + FLIGHT.impulseStreakGain * Math.min(this.streak, FLIGHT.streakCap));
  }

  /**
   * Apply an outcome. Returns the velocity after it landed.
   *
   * `strength` (0..1) scales a correct outcome's impulse, so a glancing
   * vector hit earns a partial burst. `multiplier` scales it up:
   * a cluster burn passes the charge multiplier here.
   *
   * `severity` (0..1) scales a WRONG outcome the same way: at 1 the impact
   * costs the full share of velocity, and below it the ship keeps more. A
   * vector shot that only just missed is a graze, not a wreck.
   */
  applyOutcome(
    kind: OutcomeKind,
    thrustLeft: number,
    strength = 1,
    multiplier = 1,
    severity = 1,
  ): number {
    switch (kind) {
      case "thread":
      case "slingshot":
      case "burn": {
        const boost = kind === "slingshot" ? FLIGHT.boostImpulse : 1;
        const impulse =
          this.impulseFor(thrustLeft) * boost * clamp01(strength) * Math.max(multiplier, 0);
        this.streak += 1;
        this.velocity = Math.min(this.velocity + impulse, FLIGHT.maxVelocity);
        break;
      }
      case "collision":
      case "timeout":
        this.streak = 0;
        this.velocity = Math.max(this.velocity * retain(FLIGHT.collisionRetain, severity), FLIGHT.minVelocity);
        break;
      case "wreck":
        this.streak = 0;
        this.velocity = Math.max(this.velocity * retain(FLIGHT.wreckRetain, severity), FLIGHT.minVelocity);
        break;
      case "dock":
        // Neutral: the ship is alongside, nothing has struck it and nothing
        // has been earned. Velocity and streak are left where they were.
        break;
    }
    this.peakVelocity = Math.max(this.peakVelocity, this.velocity);
    return this.velocity;
  }
}

/**
 * Which physical outcome an answer produces. A wrong answer with boost armed,
 * or with the run's shield already gone, is a wreck rather than a collision.
 */
export function outcomeKind(
  correct: boolean,
  boosted: boolean,
  timedOut: boolean,
  shielded = true,
): OutcomeKind {
  if (timedOut) return "timeout";
  if (correct) return boosted ? "slingshot" : "thread";
  return boosted || !shielded ? "wreck" : "collision";
}

/** The fraction of velocity a hit leaves behind, softened by a low severity. */
function retain(full: number, severity: number): number {
  return 1 - (1 - full) * clamp01(severity);
}

/** Plasma in a full reactor: every lane of a cluster found. */
export const FULL_CHARGE = CLUSTER.chargeMultiplier.length - 1;

/**
 * MAXIMUM THRUST: a burn that banked the whole reactor.
 *
 * The one outcome the engine, the ship and the HUD all treat as special, so
 * they all ask the same question here rather than each re-deriving it.
 */
export function isMaxThrust(outcome: Outcome | null | undefined): boolean {
  return !!outcome && outcome.kind === "burn" && (outcome.charge ?? 0) >= FULL_CHARGE;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
