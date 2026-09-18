import * as THREE from "three";
import { buildRockGeometry } from "./AsteroidField";
import { COLOR, ENCOUNTER, SHIP, WORLD } from "./Tuning";

/**
 * The one big rock each question rides in on.
 *
 * It does not fly at world speed while the answer is open. It hangs ahead of
 * the ship and creeps closer as thrust drains, so the timer is a thing you
 * can see looming rather than a bar. When the answer locks it strikes: a
 * fast, accelerating run at the ship. A threaded rock then streams past the
 * camera; a hit one shatters.
 *
 * The anomaly is the same mesh in violet with a slow pulse, so it reads as
 * something other than rock before a word of the prompt is read.
 */

type Mode = "idle" | "hold" | "strike" | "pass" | "shatter";

export class EncounterAsteroid {
  readonly group = new THREE.Group();

  active = false;
  anomaly = false;

  private mode: Mode = "idle";
  private readonly mesh: THREE.Mesh;
  private readonly wireframe: THREE.LineSegments;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly wireMaterial: THREE.LineBasicMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly wireGeometry: THREE.BufferGeometry;

  private spin = { x: 0.12, y: 0.18, z: 0.07 };
  private holdTarget: number = ENCOUNTER.holdFar;
  private strikeFrom = 0;
  private strikeT = 0;
  private strikeSeconds = 1;
  private shatterT = 0;
  private elapsed = 0;

  constructor(random: () => number) {
    this.geometry = buildRockGeometry(random);

    this.material = new THREE.MeshLambertMaterial({
      color: COLOR.panelLabel,
      flatShading: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.group.add(this.mesh);

    this.wireGeometry = new THREE.EdgesGeometry(this.geometry, 18);
    this.wireMaterial = new THREE.LineBasicMaterial({
      color: COLOR.accent,
      transparent: true,
      opacity: 0.9,
    });
    this.wireframe = new THREE.LineSegments(this.wireGeometry, this.wireMaterial);
    this.group.add(this.wireframe);

    this.spin = {
      x: (random() - 0.5) * 0.3,
      y: (random() - 0.5) * 0.3,
      z: (random() - 0.5) * 0.3,
    };

    this.group.visible = false;
  }

  /** Call the rock in at the far hold. */
  spawn(anomaly: boolean): void {
    this.active = true;
    this.anomaly = anomaly;
    this.mode = "hold";
    this.holdTarget = ENCOUNTER.holdFar;
    this.shatterT = 0;
    this.group.visible = true;

    const radius = anomaly ? ENCOUNTER.anomalyRadius : ENCOUNTER.radius;
    this.mesh.scale.setScalar(radius);
    this.wireframe.scale.setScalar(radius * 1.02);
    this.group.scale.setScalar(1);
    this.group.position.set(0, ENCOUNTER.offsetY, ENCOUNTER.holdFar);

    if (anomaly) {
      this.material.color.setHex(0x2a1b4a);
      this.material.emissive.setHex(COLOR.anomaly);
      this.material.emissiveIntensity = 0.55;
      this.wireMaterial.color.setHex(COLOR.anomaly);
      this.wireMaterial.opacity = 1;
    } else {
      this.material.color.setHex(COLOR.panelLabel);
      this.material.emissive.setHex(0x000000);
      this.material.emissiveIntensity = 0;
      this.wireMaterial.color.setHex(COLOR.accent);
      this.wireMaterial.opacity = 0.9;
    }
  }

  /** 0 = full thrust (far), 1 = empty (close). */
  setLoom(progress: number): void {
    const t = progress < 0 ? 0 : progress > 1 ? 1 : progress;
    this.holdTarget = ENCOUNTER.holdFar + (ENCOUNTER.holdNear - ENCOUNTER.holdFar) * t;
  }

  /** The answer locked. Run at the ship over `seconds`. */
  strike(seconds: number, correct: boolean): void {
    if (!this.active) return;
    this.mode = "strike";
    this.strikeFrom = this.group.position.z;
    this.strikeT = 0;
    this.strikeSeconds = Math.max(seconds, 0.05);

    // The tint is the verdict, shown before contact so the eye is already on
    // the rock when the consequence lands.
    const hex = correct ? COLOR.pos : COLOR.neg;
    if (!this.anomaly) this.material.color.setHex(hex);
    this.wireMaterial.color.setHex(correct ? COLOR.cyan : COLOR.neg);
    this.wireMaterial.opacity = 1;
  }

  /** Contact. A hit rock collapses; a threaded one keeps flying past. */
  contact(hit: boolean): void {
    if (!this.active) return;
    if (hit) {
      this.mode = "shatter";
      this.shatterT = 0;
    } else {
      this.mode = "pass";
    }
  }

  retire(): void {
    this.active = false;
    this.mode = "idle";
    this.group.visible = false;
  }

  update(dt: number, worldSpeed: number): void {
    if (!this.active) return;
    this.elapsed += dt;

    this.group.rotation.x += this.spin.x * dt;
    this.group.rotation.y += this.spin.y * dt;
    this.group.rotation.z += this.spin.z * dt;

    if (this.anomaly && this.mode !== "shatter") {
      const pulse = 1 + Math.sin(this.elapsed * 3.1) * 0.05;
      this.group.scale.setScalar(pulse);
      this.material.emissiveIntensity = 0.45 + (Math.sin(this.elapsed * 2.3) + 1) * 0.2;
    }

    switch (this.mode) {
      case "hold": {
        // Ease toward the hold, and drift with the world a little so it never
        // looks pinned to the glass.
        const k = 1 - Math.exp(-1.8 * dt);
        this.group.position.z += (this.holdTarget - this.group.position.z) * k;
        this.group.position.x = Math.sin(this.elapsed * 0.7) * 0.6;
        break;
      }
      case "strike": {
        this.strikeT = Math.min(this.strikeT + dt / this.strikeSeconds, 1);
        // Ease in: it looks slow to start and then arrives all at once.
        const eased = this.strikeT * this.strikeT;
        const contactZ = SHIP.z + 1.5;
        this.group.position.z = this.strikeFrom + (contactZ - this.strikeFrom) * eased;
        this.group.position.x *= 1 - Math.min(dt * 4, 1);
        break;
      }
      case "pass":
        this.group.position.z += Math.max(worldSpeed, 60) * 1.6 * dt;
        if (this.group.position.z > WORLD.recycleDistance) this.retire();
        break;
      case "shatter": {
        this.shatterT += dt / 0.32;
        if (this.shatterT >= 1) {
          this.retire();
          return;
        }
        const s = 1 - this.shatterT * this.shatterT;
        this.group.scale.setScalar(s);
        this.group.rotation.y += dt * 9;
        this.group.position.z += worldSpeed * dt;
        break;
      }
      case "idle":
        break;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.wireGeometry.dispose();
    this.material.dispose();
    this.wireMaterial.dispose();
    this.group.clear();
  }
}
