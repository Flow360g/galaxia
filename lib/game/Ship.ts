import * as THREE from "three";
import { Exhaust } from "./Exhaust";
import { loadLambertModel } from "./gltf";
import { ENCOUNTER, EXHAUST, FX, SHIP, TRAILS, WORLD } from "./Tuning";
import { DEFAULT_SHIP, type ShipSpec } from "./ships";
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

  /**
   * The wingtips, in the body's own space, measured off the loaded hull so
   * trails leave from the right place on every ship in the bay. Null until the
   * hull lands.
   */
  private tips: [THREE.Vector3, THREE.Vector3] | null = null;

  /**
   * The hull shaking itself apart on a boost: 0..1 at its peak, held and then
   * eased out like the camera's rumble. Written onto the body's X, Z and yaw,
   * which nothing else touches, so it never fights the bank, the bob or a
   * tumble, and never moves the ship off its lane.
   */
  private shudderLeft = 0;
  private shudderSeconds = 0;
  private shudderPeak = 0;

  /**
   * @param spec  which hull to fly. Cosmetic: every hull has the same flight
   *              model, and only the mesh, its scale and its nozzles differ.
   */
  constructor(
    private readonly reducedMotion: boolean,
    tier: QualityTier,
    random: () => number,
    private readonly spec: ShipSpec = DEFAULT_SHIP,
  ) {
    this.group.add(this.body);
    this.buildExhausts(tier, random);
    this.group.position.set(0, 0, SHIP.z);
    // Nothing to show until the hull arrives.
    this.body.visible = false;
  }

  private buildExhausts(tier: QualityTier, random: () => number): void {
    for (const nozzle of this.spec.nozzles) {
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
  async loadModel(url: string = this.spec.modelUrl): Promise<void> {
    const loaded = await loadLambertModel(
      url,
      this.spec.modelLength,
      this.spec.modelYaw,
      this.spec.modelTrim,
    );
    if (!loaded || this.disposed) return;
    const box = new THREE.Box3().setFromObject(loaded.group);
    const inset = 1 - TRAILS.inset;
    const y = (box.min.y + box.max.y) / 2;
    const z = (box.min.z + box.max.z) / 2;
    this.tips = [
      new THREE.Vector3(box.min.x * inset, y, z),
      new THREE.Vector3(box.max.x * inset, y, z),
    ];
    this.disposables = loaded.disposables;
    this.body.add(loaded.group);
    this.body.visible = true;
  }

  /** Where wingtip `i` (0 left, 1 right) is in the world. False before the hull lands. */
  wingtip(i: 0 | 1, out: THREE.Vector3): boolean {
    if (!this.tips || !this.body.visible) return false;
    this.body.updateWorldMatrix(true, false);
    out.copy(this.tips[i]).applyMatrix4(this.body.matrixWorld);
    return true;
  }

  /** Shake the hull for `seconds` at `amount` (0..1). Nothing under reduced motion. */
  shudder(amount: number, seconds: number): void {
    if (this.reducedMotion) return;
    this.shudderPeak = Math.max(amount, this.shudderLeft > 0 ? this.shudderPeak : 0);
    this.shudderSeconds = Math.max(seconds, 0.01);
    this.shudderLeft = seconds;
  }

  /** Spike the exhaust, e.g. on a correct-answer boost. */
  pulseExhaust(strength = 1): void {
    for (const exhaust of this.exhausts) exhaust.pulse(strength);
  }

  /**
   * Raw plasma in the burn, 0..1. Held by the engine for the length of a
   * MAXIMUM THRUST rather than decayed here, so the plume stays huge and
   * violet for as long as the moment lasts.
   */
  setOverdrive(amount: number): void {
    for (const exhaust of this.exhausts) exhaust.setOverdrive(amount);
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
      case "burn":
        // Already in a lane. Dip the nose and hold the line; the camera and
        // the exhaust do the rest.
        this.setSwerve(this.targetX, -0.6);
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

  /**
   * Cluster: steer into a lane and hold it until the next manoeuvre or a
   * recentre. The hold is open-ended; the swerve timer is left untouched so
   * the weave does not creep back while the player is still picking.
   */
  holdLane(x: number): void {
    this.weaving = false;
    this.swerveTimer = 0;
    this.targetX = x;
    this.targetY = 0;
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

    // The boost shudder: violent and high-frequency, all on the body.
    if (this.shudderLeft > 0) {
      this.shudderLeft = Math.max(this.shudderLeft - dt, 0);
      const left = this.shudderLeft / this.shudderSeconds;
      const k = this.shudderPeak * (left > 0.45 ? 1 : left / 0.45);
      this.body.position.x = (Math.random() * 2 - 1) * SHIP.shudderOffset * k;
      this.body.position.z = (Math.random() * 2 - 1) * SHIP.shudderOffset * 0.6 * k;
      this.body.rotation.y = (Math.random() * 2 - 1) * SHIP.shudderYaw * k;
    } else if (this.body.position.x !== 0 || this.body.rotation.y !== 0) {
      this.body.position.x = 0;
      this.body.position.z = 0;
      this.body.rotation.y = 0;
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
