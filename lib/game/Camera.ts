import * as THREE from "three";
import { CAMERA, SPEED } from "./Tuning";
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

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;

  private shakeAmount = 0;
  private shakeX = 0;
  private shakeY = 0;

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
    this.camera.lookAt(0, 0, -CAMERA.lookAheadZ);
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
   * @param dt          clamped frame delta, seconds
   * @param ship        the ship to chase
   * @param speedRatio  0..1 across the speed band
   */
  update(dt: number, ship: Ship, speedRatio: number): void {
    // Only partially follow the ship's X. At lateralFollow < 1 the ship slides
    // toward the edge of frame as it steers, which is what makes a hard turn
    // feel committed instead of the world merely sliding underneath.
    scratchTarget.set(
      ship.group.position.x * CAMERA.lateralFollow,
      ship.group.position.y * 0.55 + CAMERA.offsetY,
      CAMERA.offsetZ,
    );

    // Framerate-independent damping. Same feel at 30fps and 120fps.
    const damping = 1 - Math.exp(-CAMERA.positionDamping * dt);
    this.camera.position.lerp(scratchTarget, damping);

    this.updateShake(dt);
    this.camera.position.x += this.shakeX;
    this.camera.position.y += this.shakeY;

    // Aim ahead, leaning into the turn.
    scratchLook.set(
      ship.group.position.x + ship.velocityX * CAMERA.lookLateralLead,
      ship.group.position.y * 0.6,
      -CAMERA.lookAheadZ,
    );
    this.camera.lookAt(scratchLook);

    // Roll the camera slightly with the ship's bank. A little goes a long way;
    // matching it fully would make the horizon seasick.
    this.camera.rotation.z += ship.group.rotation.z * 0.18;

    const fov =
      CAMERA.fov + (CAMERA.fovAtMaxSpeed - CAMERA.fov) * easeOut(speedRatio);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateShake(dt: number): void {
    if (this.shakeAmount <= 0.001) {
      this.shakeAmount = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }

    this.shakeX = (Math.random() - 0.5) * 2 * this.shakeAmount;
    this.shakeY = (Math.random() - 0.5) * 2 * this.shakeAmount;
    this.shakeAmount *= Math.exp(-CAMERA.shakeDecay * dt);
  }
}

/** Speed ratio for FOV. Eased so the push lands late, near top speed. */
function easeOut(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped * clamped;
}

/** Map an absolute speed onto 0..1 across the playable band. */
export function speedRatio(speed: number): number {
  const range = Math.max(SPEED.max - SPEED.base, 1);
  const ratio = (speed - SPEED.base) / range;
  return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
}
