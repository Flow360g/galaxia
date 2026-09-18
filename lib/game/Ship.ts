import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Exhaust } from "./Exhaust";
import { EXHAUST, SHIP, WORLD } from "./Tuning";
import type { Input } from "./Input";
import type { QualityTier } from "./types";

/**
 * The player ship.
 *
 * The Quaternius GLB hull. The ship stays invisible until the model has
 * loaded rather than showing a stand-in: a hull that swaps shape half a
 * second into the run reads as a glitch. Two exhausts burn off the back and
 * stretch with speed.
 *
 * The ship never moves on Z. It steers on X and Y inside the corridor while
 * the world is translated past it.
 */
export class Ship {
  readonly group = new THREE.Group();

  /** Lateral velocity, world units/sec. Drives bank and camera lead. */
  velocityX = 0;
  velocityY = 0;

  /** Everything that bobs: hull and exhausts together. */
  private readonly body = new THREE.Group();
  private readonly exhausts: Exhaust[] = [];
  private roll = 0;
  private pitch = 0;
  private bobPhase = 0;
  private elapsed = 0;
  private disposed = false;

  private disposables: Array<{ dispose(): void }> = [];

  constructor(
    private readonly reducedMotion: boolean,
    tier: QualityTier,
    random: () => number,
  ) {
    this.group.add(this.body);
    this.buildExhausts(tier, random);
    this.group.position.set(0, 0, SHIP.z);
    // Nothing to show until the hull arrives.
    this.body.visible = false;
  }

  private buildExhausts(tier: QualityTier, random: () => number): void {
    for (const nozzle of SHIP.nozzles) {
      const exhaust = new Exhaust(tier, random);
      exhaust.group.position.set(nozzle.x, nozzle.y, nozzle.z);
      exhaust.group.rotation.x = EXHAUST.tilt;
      this.body.add(exhaust.group);
      this.exhausts.push(exhaust);
    }
  }

  /**
   * Load the GLB hull and reveal the ship. Resolves either way; a failed
   * fetch leaves the ship hidden, which is preferable to a stand-in shape.
   */
  async loadModel(url: string = SHIP.modelUrl): Promise<void> {
    let gltf: Awaited<ReturnType<GLTFLoader["loadAsync"]>>;
    try {
      gltf = await new GLTFLoader().loadAsync(url);
    } catch {
      return;
    }
    if (this.disposed) return;

    const model = gltf.scene;
    const next: Array<{ dispose(): void }> = [];

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      // The README bans PBR on mobile. Lambert with the same atlas keeps the
      // authored colours at a fraction of the shader cost.
      const source = object.material as THREE.MeshStandardMaterial;
      const material = new THREE.MeshLambertMaterial({
        map: source.map ?? null,
        color: source.color,
      });
      object.material = material;
      next.push(object.geometry, material);
      if (source.map) next.push(source.map);
      source.dispose();
    });

    // Normalise: centre on the bounding box, scale to a known length, and
    // turn the nose down -Z.
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z, 1e-6);
    const scale = SHIP.modelLength / longest;

    const wrapper = new THREE.Group();
    model.position.copy(centre).multiplyScalar(-1);
    wrapper.add(model);
    wrapper.scale.setScalar(scale);
    wrapper.rotation.y = SHIP.modelYaw;

    this.disposables = next;
    this.body.add(wrapper);
    this.body.visible = true;
  }

  /** Spike the exhaust, e.g. on a correct-answer boost. */
  pulseExhaust(strength = 1): void {
    for (const exhaust of this.exhausts) exhaust.pulse(strength);
  }

  /**
   * @param dt          clamped frame delta, seconds
   * @param input       steering axes
   * @param speedRatio  0..1 across the speed band, drives exhaust length
   */
  update(dt: number, input: Input, speedRatio: number): void {
    this.elapsed += dt;

    // Soft walls: as the ship nears the edge of the corridor, steering into
    // the wall is eased off over `SHIP.wallSoftZone` rather than clamped
    // dead at the boundary, so the edge feels like a cushion, not a kerb.
    const targetVX =
      input.axis.x *
      SHIP.lateralSpeed *
      wallEase(this.group.position.x, input.axis.x, WORLD.corridorHalfWidth);
    const targetVY =
      -input.axis.y *
      SHIP.verticalSpeed *
      wallEase(this.group.position.y, -input.axis.y, WORLD.corridorHalfHeight);

    // Exponential smoothing, framerate-independent. Using 1-exp(-k*dt) rather
    // than a raw lerp factor keeps the feel identical at 30fps and 120fps.
    const response = 1 - Math.exp(-SHIP.steerResponse * dt);
    this.velocityX += (targetVX - this.velocityX) * response;
    this.velocityY += (targetVY - this.velocityY) * response;

    this.group.position.x = clamp(
      this.group.position.x + this.velocityX * dt,
      -WORLD.corridorHalfWidth,
      WORLD.corridorHalfWidth,
    );
    this.group.position.y = clamp(
      this.group.position.y + this.velocityY * dt,
      -WORLD.corridorHalfHeight,
      WORLD.corridorHalfHeight,
    );

    // The clamp above is a backstop only; at the wall any residual push into
    // it is bled off gently so bank and yaw unwind instead of snapping.
    if (Math.abs(this.group.position.x) >= WORLD.corridorHalfWidth) {
      if (Math.sign(this.velocityX) === Math.sign(this.group.position.x)) {
        this.velocityX *= Math.exp(-SHIP.wallBleed * dt);
      }
    }
    if (Math.abs(this.group.position.y) >= WORLD.corridorHalfHeight) {
      if (Math.sign(this.velocityY) === Math.sign(this.group.position.y)) {
        this.velocityY *= Math.exp(-SHIP.wallBleed * dt);
      }
    }

    // Bank into the turn. Roll is the single biggest contributor to the ship
    // feeling like a vehicle rather than a sprite.
    const rollResponse = 1 - Math.exp(-SHIP.rollResponse * dt);
    const targetRoll = -(this.velocityX / SHIP.lateralSpeed) * SHIP.maxRoll;
    const targetPitch = (this.velocityY / SHIP.verticalSpeed) * SHIP.maxPitch;
    this.roll += (targetRoll - this.roll) * rollResponse;
    this.pitch += (targetPitch - this.pitch) * rollResponse;

    this.group.rotation.z = this.roll;
    this.group.rotation.x = this.pitch;
    this.group.rotation.y = (this.velocityX / SHIP.lateralSpeed) * SHIP.maxYaw;

    // Idle bob, so a stationary ship still reads as flying. Suppressed for
    // players who asked for reduced motion.
    if (!this.reducedMotion) {
      this.bobPhase += dt * SHIP.bobRate;
      this.body.position.y = Math.sin(this.bobPhase) * SHIP.bobAmplitude;
    }

    for (const exhaust of this.exhausts) {
      exhaust.update(dt, this.elapsed, speedRatio);
    }
  }

  /** Continuous lane position, e.g. 2.4 = 40% from lane 2 toward lane 3. */
  get lanePosition(): number {
    const normalised =
      (this.group.position.x + WORLD.corridorHalfWidth) /
      (WORLD.corridorHalfWidth * 2);
    return normalised * (WORLD.laneCount - 1);
  }

  get currentLane(): number {
    return Math.round(this.lanePosition);
  }

  dispose(): void {
    this.disposed = true;
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.exhausts.forEach((exhaust) => exhaust.dispose());
    this.exhausts.length = 0;
    this.body.clear();
    this.group.clear();
  }
}

/**
 * 1 in open corridor, easing to 0 at the wall, but only when steering toward
 * that wall. Steering away is never damped.
 */
function wallEase(position: number, axis: number, halfExtent: number): number {
  if (axis === 0 || Math.sign(axis) !== Math.sign(position)) return 1;
  const margin = halfExtent - Math.abs(position);
  const t = margin / SHIP.wallSoftZone;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  // Smoothstep, so the cushion builds gradually rather than kicking in.
  return clamped * clamped * (3 - 2 * clamped);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
