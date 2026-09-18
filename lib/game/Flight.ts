import { FLIGHT } from "./Tuning";
import type { OutcomeKind } from "./types";

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

  /** The floor velocity relaxes toward, set by the streak. */
  get cruise(): number {
    const steps = Math.min(this.streak, FLIGHT.streakCap);
    return FLIGHT.cruise * (1 + FLIGHT.streakCruiseGain * steps);
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
   * `strength` scales a correct outcome's impulse, so a partially right
   * anomaly answer earns a partial burst.
   */
  applyOutcome(kind: OutcomeKind, thrustLeft: number, strength = 1): number {
    switch (kind) {
      case "thread":
      case "slingshot": {
        const boost = kind === "slingshot" ? FLIGHT.boostImpulse : 1;
        const impulse = this.impulseFor(thrustLeft) * boost * clamp01(strength);
        this.streak += 1;
        this.velocity = Math.min(this.velocity + impulse, FLIGHT.maxVelocity);
        break;
      }
      case "collision":
      case "timeout":
        this.streak = 0;
        this.velocity = Math.max(this.velocity * FLIGHT.collisionRetain, FLIGHT.minVelocity);
        break;
      case "wreck":
        this.streak = 0;
        this.velocity = Math.max(this.velocity * FLIGHT.wreckRetain, FLIGHT.minVelocity);
        break;
    }
    this.peakVelocity = Math.max(this.peakVelocity, this.velocity);
    return this.velocity;
  }
}

/** Which physical outcome an answer produces. */
export function outcomeKind(correct: boolean, boosted: boolean, timedOut: boolean): OutcomeKind {
  if (timedOut) return "timeout";
  if (correct) return boosted ? "slingshot" : "thread";
  return boosted ? "wreck" : "collision";
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
