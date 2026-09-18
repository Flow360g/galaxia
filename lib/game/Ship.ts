import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Exhaust } from "./Exhaust";
import { ENCOUNTER, EXHAUST, FX, SHIP, WORLD } from "./Tuning";
import type { OutcomeKind, QualityTier } from "./types";

/**
 * The player ship, on autopilot.
 *
 * The player answers; the ship flies. It weaves gently while cruising, swerves
 * aside to thread a rock on a correct answer, skims it on a slingshot, and
 * tumbles when it hits one. All of that is a target X/Y the hull chases with
 * the same damped steering the old manual controls used, so bank, pitch and
 * yaw still fall out of lateral velocity and the ship still reads as flown.
 *
 * The ship never moves on Z. The world is translated past it.
 */
export class Ship {
  readonly group = new THREE.Group();

  /** Lateral velocity, world units/sec. Drives bank and camera lead. */
  velocityX = 0;
  velocityY = 0;

  /** Everything that bobs and tumbles: hull and exhausts together. */
  private readonly body = new THREE.Group();
  private readonly exhausts: Exhaust[] = [];
  private roll = 0;
  private pitch = 0;
  private bobPhase = 0;
  private elapsed = 0;
  private disposed = false;

  /** Autopilot target, and how long the current swerve holds. */
  private targetX = 0;
  private targetY = 0;
  private swerveTimer = 0;
  private weaving = true;

  /** Tumble state: extra roll applied on top of the bank. */
  private tumbleT = 0;
  private tumbleSeconds = 0;
  private tumbleRolls = 0;
  private tumbleSign = 1;

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
   * React to a locked answer. Correct outcomes swerve; wrong ones hold course
   * into the rock. The tumble itself is triggered on contact, see `impact`.
   */
  manoeuvre(kind: OutcomeKind, side: 1 | -1): void {
    this.weaving = false;
    switch (kind) {
      case "thread":
        this.setSwerve(side * ENCOUNTER.threadOffsetX, 1.2);
        break;
      case "slingshot":
        this.setSwerve(side * ENCOUNTER.skimOffsetX, -0.4);
        break;
      default:
        // Line up on the rock. The autopilot flies straight into it.
        this.setSwerve(0, 0);
        break;
    }
  }

  /** Contact with a rock. Roll the hull over, once or twice. */
  impact(kind: OutcomeKind, side: 1 | -1): void {
    if (this.reducedMotion) return;
    const spec = kind === "wreck" ? FX.tumble.wreck : FX.tumble.collision;
    this.tumbleT = 0;
    this.tumbleSeconds = spec.seconds;
    this.tumbleRolls = spec.rolls;
    this.tumbleSign = side;
    // Knocked sideways, then the autopilot recovers.
    this.setSwerve(-side * 4.5, 1.5);
  }

  /** Back to the lazy cruise weave. */
  recentre(): void {
    this.weaving = true;
    this.swerveTimer = 0;
  }

  private setSwerve(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
    this.swerveTimer = SHIP.swerveHoldSeconds;
  }

  /**
   * @param dt          clamped frame delta, seconds
   * @param speedRatio  0..1 across the visual speed band, drives exhaust
   * @param thrust      0..1 thrust remaining, shortens the flame as it drains
   */
  update(dt: number, speedRatio: number, thrust: number): void {
    this.elapsed += dt;

    if (this.swerveTimer > 0) {
      this.swerveTimer -= dt;
      if (this.swerveTimer <= 0) this.weaving = true;
    }
    if (this.weaving) {
      const phase = this.elapsed * SHIP.weaveRate * Math.PI * 2;
      this.targetX = Math.sin(phase) * SHIP.weaveAmplitudeX;
      this.targetY = Math.sin(phase * 0.7 + 1.3) * SHIP.weaveAmplitudeY;
    }

    // The autopilot asks for a lateral velocity proportional to the error,
    // capped at the ship's lateral speed; the hull then chases that velocity
    // with the same smoothing manual steering had, so nothing snaps.
    const targetVX = clamp(
      (this.targetX - this.group.position.x) * SHIP.autopilotResponse,
      -SHIP.lateralSpeed,
      SHIP.lateralSpeed,
    );
    const targetVY = clamp(
      (this.targetY - this.group.position.y) * SHIP.autopilotResponse,
      -SHIP.verticalSpeed,
      SHIP.verticalSpeed,
    );

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

    // Tumble: a full roll (or two) on top of the bank, eased so it starts
    // violently and settles.
    if (this.tumbleSeconds > 0) {
      this.tumbleT += dt / this.tumbleSeconds;
      if (this.tumbleT >= 1) {
        this.tumbleSeconds = 0;
        this.body.rotation.z = 0;
        this.body.rotation.x = 0;
      } else {
        const eased = 1 - Math.pow(1 - this.tumbleT, 3);
        this.body.rotation.z = this.tumbleSign * eased * Math.PI * 2 * this.tumbleRolls;
        this.body.rotation.x = Math.sin(this.tumbleT * Math.PI) * 0.35;
      }
    }

    // Idle bob, so a stationary ship still reads as flying. Suppressed for
    // players who asked for reduced motion.
    if (!this.reducedMotion) {
      this.bobPhase += dt * SHIP.bobRate;
      this.body.position.y = Math.sin(this.bobPhase) * SHIP.bobAmplitude;
    }

    // Thrust drains the flame: at a quarter thrust the plume is visibly
    // shorter, which is the timer made physical.
    const flame = speedRatio * (0.55 + 0.45 * thrust);
    for (const exhaust of this.exhausts) {
      exhaust.update(dt, this.elapsed, flame);
    }
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


function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
