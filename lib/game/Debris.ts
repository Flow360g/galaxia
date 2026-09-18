import * as THREE from "three";
import { buildRockGeometry } from "./AsteroidField";
import { COLOR, FX, WORLD } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Fragments thrown off a shattered rock.
 *
 * One InstancedMesh, one draw call, preallocated. A burst hands every
 * fragment a direction and a life; dead fragments are scaled to zero rather
 * than removed. Everything drifts past with the world so the cloud reads as
 * left behind, not stuck to the ship.
 */

const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchEuler = new THREE.Euler();
const scratchMatrix = new THREE.Matrix4();

export class Debris {
  readonly mesh: THREE.InstancedMesh;

  private readonly count: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly spin: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshLambertMaterial;
  private live = 0;

  constructor(tier: QualityTier, private readonly random: () => number) {
    this.count = FX.debrisCount[tier] ?? 20;
    this.geometry = buildRockGeometry(random);
    this.material = new THREE.MeshLambertMaterial({
      color: COLOR.panelLabel,
      flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.z = new Float32Array(this.count);
    this.vx = new Float32Array(this.count);
    this.vy = new Float32Array(this.count);
    this.vz = new Float32Array(this.count);
    this.life = new Float32Array(this.count);
    this.size = new Float32Array(this.count);
    this.spin = new Float32Array(this.count);
    this.write();
  }

  /** Throw every fragment out from a point. `strength` scales speed and size. */
  burst(origin: THREE.Vector3, strength = 1, color: number = COLOR.panelLabel): void {
    this.material.color.setHex(color);
    for (let i = 0; i < this.count; i += 1) {
      const theta = this.random() * Math.PI * 2;
      const phi = Math.acos(2 * this.random() - 1);
      const speed = FX.debrisSpeed * (0.35 + this.random() * 0.65) * strength;
      this.x[i] = origin.x;
      this.y[i] = origin.y;
      this.z[i] = origin.z;
      this.vx[i] = Math.sin(phi) * Math.cos(theta) * speed;
      this.vy[i] = Math.sin(phi) * Math.sin(theta) * speed;
      // Bias backward: fragments the ship ploughs through fly past the camera.
      this.vz[i] = Math.cos(phi) * speed + speed * 0.8;
      this.life[i] = 1;
      this.size[i] = (0.25 + this.random() * 0.6) * strength;
      this.spin[i] = (this.random() - 0.5) * 12;
    }
    this.live = this.count;
  }

  update(dt: number, worldSpeed: number): void {
    if (this.live === 0) return;
    const decay = dt / FX.debrisSeconds;
    let live = 0;
    for (let i = 0; i < this.count; i += 1) {
      if (this.life[i]! <= 0) continue;
      this.life[i] = this.life[i]! - decay;
      this.x[i] = this.x[i]! + this.vx[i]! * dt;
      this.y[i] = this.y[i]! + this.vy[i]! * dt;
      this.z[i] = this.z[i]! + (this.vz[i]! + worldSpeed) * dt;
      if (this.z[i]! > WORLD.recycleDistance) this.life[i] = 0;
      if (this.life[i]! > 0) live += 1;
    }
    this.live = live;
    this.write();
  }

  private write(): void {
    for (let i = 0; i < this.count; i += 1) {
      const life = this.life[i]!;
      if (life <= 0) {
        scratchScale.setScalar(0);
        scratchPosition.set(0, 0, 100);
        scratchQuaternion.identity();
      } else {
        const s = this.size[i]! * Math.min(1, life * 2.5);
        scratchScale.setScalar(s);
        scratchPosition.set(this.x[i]!, this.y[i]!, this.z[i]!);
        const angle = (1 - life) * this.spin[i]!;
        scratchEuler.set(angle, angle * 0.7, angle * 1.3);
        scratchQuaternion.setFromEuler(scratchEuler);
      }
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      this.mesh.setMatrixAt(i, scratchMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
