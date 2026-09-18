import * as THREE from "three";
import { CAMERA, FX, SHIP } from "./Tuning";
import type { Ship } from "./Ship";

/**
 * Third-person chase rig: behind and above the ship, the standard vehicle
 * view.
 *
 * Three things make it feel like a camera operator rather than a bolted-on
 * transform:
 *   - it lags, with critical damping, so hard steering lets the ship lead;
 *   - it aims ahead of the ship and leans into lateral velocity, so a turn
 *     reads as intent rather than drift;
 *   - FOV widens with speed, which is most of what sells acceleration.
 */

const scratchTarget = new THREE.Vector3();
const scratchLook = new THREE.Vector3();
const scratchRay = new THREE.Vector3();

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;

  private shakeAmount = 0;
  private shakeX = 0;
  private shakeY = 0;
  /** Burst pull-back and FOV kick, both decaying together. */
  private pullback = 0;
  private fovKick = 0;
  /**
   * Seconds left of a lane lock. While it runs the camera holds its X, so a
   * veer moves the ship across the frame instead of dragging the frame along
   * with it. Without this the ship never actually arrives under the answer
   * square the player tapped.
   */
  private laneLock = 0;
  /**
   * A sustained rumble, unlike `shake`'s single decaying kick: it holds at
   * full for most of its life and only then eases off. MAXIMUM THRUST is the
   * one thing that asks for it, and holding it is the whole point -- a hull
   * struggling with the burn, not a single bang.
   */
  private rumbleLeft = 0;
  private rumbleSeconds = 0;
  private rumbleMagnitude = 0;
  private rumbleRoll = 0;
  /** A neutral copy of the rig, used to map screen fractions onto lanes. */
  private readonly probe: THREE.PerspectiveCamera;

  constructor(
    aspect: number,
    private readonly reducedMotion: boolean,
  ) {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      aspect,
      CAMERA.near,
      CAMERA.far,
    );
    this.camera.position.set(0, CAMERA.offsetY, CAMERA.offsetZ);
    this.camera.lookAt(0, CAMERA.lookLift, -CAMERA.lookAheadZ);
    this.probe = this.camera.clone();
  }

  /** Hold the camera still laterally for `seconds` while the ship changes lane. */
  lockLane(seconds: number): void {
    this.laneLock = seconds;
  }

  releaseLane(): void {
    this.laneLock = 0;
  }

  /**
   * The world X on the ship's plane that lands at horizontal screen fraction
   * `fraction` (0 = left edge, 1 = right edge).
   *
   * Measured through a neutral copy of the rig rather than the live camera:
   * lanes must not move when the camera shakes or leans, and a lane is only
   * ever asked for while the ship is centred and the lock is about to hold
   * the frame still.
   */
  laneX(fraction: number): number {
    this.probe.fov = this.camera.fov;
    this.probe.aspect = this.camera.aspect;
    this.probe.updateProjectionMatrix();
    this.probe.position.set(0, CAMERA.offsetY, CAMERA.offsetZ);
    this.probe.lookAt(0, CAMERA.lookLift, -CAMERA.lookAheadZ);
    this.probe.updateMatrixWorld(true);

    scratchRay.set(fraction * 2 - 1, 0, 0.5).unproject(this.probe).sub(this.probe.position);
    // Walk the ray to the ship's Z plane. A near-horizontal ray would never
    // reach it, so guard the divide and fall back to dead centre.
    if (Math.abs(scratchRay.z) < 1e-4) return 0;
    const t = (SHIP.z - this.probe.position.z) / scratchRay.z;
    return this.probe.position.x + scratchRay.x * t;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Kick the camera. Called on near-miss or impact. */
  shake(intensity = 1): void {
    if (this.reducedMotion) return;
    this.shakeAmount = Math.min(
      this.shakeAmount + intensity * CAMERA.shakeMagnitude,
      CAMERA.shakeMagnitude * 2,
    );
  }

  /**
   * Shake the rig steadily for `seconds`, as if the ship is fighting to hold
   * its line. `roll` adds a slow wallow on top of the jitter.
   */
  rumble(seconds: number, magnitude: number, roll = 0): void {
    if (this.reducedMotion) return;
    this.rumbleLeft = seconds;
    this.rumbleSeconds = Math.max(seconds, 0.01);
    this.rumbleMagnitude = magnitude;
    this.rumbleRoll = roll;
  }

  /** A burst of acceleration: drop back and widen, then ease back in. */
  burst(pullback: number, fovKick: number): void {
    if (this.reducedMotion) return;
    this.pullback = Math.max(this.pullback, pullback);
    this.fovKick = Math.max(this.fovKick, fovKick);
  }

  /**
   * @param dt          clamped frame delta, seconds
   * @param ship        the ship to chase
   * @param speedRatio  0..1 across the visual speed band
   */
  update(dt: number, ship: Ship, speedRatio: number): void {
    const decay = Math.exp(-FX.pullbackDecay * dt);
    this.pullback *= decay;
    this.fovKick *= decay;
    if (this.laneLock > 0) this.laneLock -= dt;

    // Only partially follow the ship's X. At lateralFollow < 1 the ship slides
    // toward the edge of frame as it steers, which is what makes a hard turn
    // feel committed instead of the world merely sliding underneath.
    // A lane lock pins the rig to the centreline: position and aim both stop
    // tracking X, so the ship's screen position is purely its world X.
    const locked = this.laneLock > 0;
    const follow = locked ? 0 : CAMERA.lateralFollow;
    scratchTarget.set(
      ship.group.position.x * follow,
      ship.group.position.y * 0.55 + CAMERA.offsetY + this.pullback * 0.3,
      CAMERA.offsetZ + this.pullback,
    );

    // Framerate-independent damping. Same feel at 30fps and 120fps.
    const damping = 1 - Math.exp(-CAMERA.positionDamping * dt);
    this.camera.position.lerp(scratchTarget, damping);

    this.updateShake(dt);
    this.camera.position.x += this.shakeX;
    this.camera.position.y += this.shakeY;

    // Aim ahead, leaning into the turn, and above the ship so it flies in the
    // lower third of the frame with the question owning the top.
    scratchLook.set(
      locked ? 0 : ship.group.position.x + ship.velocityX * CAMERA.lookLateralLead,
      ship.group.position.y * 0.6 + CAMERA.lookLift,
      -CAMERA.lookAheadZ,
    );
    this.camera.lookAt(scratchLook);

    // Roll the camera slightly with the ship's bank. A little goes a long way;
    // matching it fully would make the horizon seasick.
    this.camera.rotation.z += ship.group.rotation.z * 0.18;
    // A rumble wallows the horizon as well as jittering it, which is what
    // separates "the hull is struggling" from "something went bang".
    if (this.rumbleRoll > 0) {
      this.camera.rotation.z +=
        Math.sin(this.rumbleLeft * 11) * this.rumbleRoll * this.rumbleLevel;
    }

    const fov =
      CAMERA.fov +
      (CAMERA.fovAtMaxSpeed - CAMERA.fov) * easeOut(speedRatio) +
      this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateShake(dt: number): void {
    const rumble = this.updateRumble(dt);

    if (this.shakeAmount <= 0.001 && rumble <= 0) {
      this.shakeAmount = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }

    const amount = this.shakeAmount + rumble;
    this.shakeX = (Math.random() - 0.5) * 2 * amount;
    this.shakeY = (Math.random() - 0.5) * 2 * amount;
    this.shakeAmount *= Math.exp(-CAMERA.shakeDecay * dt);
  }

  /** Current rumble magnitude, holding at full then easing out. */
  private updateRumble(dt: number): number {
    if (this.rumbleLeft <= 0) return 0;
    this.rumbleLeft -= dt;
    if (this.rumbleLeft <= 0) {
      this.rumbleLeft = 0;
      return 0;
    }
    const left = this.rumbleLeft / this.rumbleSeconds;
    const tail = FX.overdrive.hold;
    // Full strength through the hold, then a smooth ease to nothing.
    return this.rumbleMagnitude * (left >= 1 - tail ? 1 : left / (1 - tail));
  }

  /** How hard the rig is rumbling right now, 0..1 of its peak. */
  get rumbleLevel(): number {
    if (this.rumbleLeft <= 0 || this.rumbleMagnitude <= 0) return 0;
    const left = this.rumbleLeft / this.rumbleSeconds;
    const tail = FX.overdrive.hold;
    return left >= 1 - tail ? 1 : left / (1 - tail);
  }
}

/** Speed ratio for FOV. Eased so the push lands late, near top speed. */
function easeOut(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped * clamped;
}
