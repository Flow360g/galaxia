import * as THREE from "three";
import { COLOR, FX } from "./Tuning";

/**
 * The salvage capsule: a glowing shard that flies from the shattered alien
 * to the ship after a direct hit. Arrival is reported once so the engine can
 * flash the shield and the HUD can show what was gained.
 */
export class Salvage {
  readonly mesh: THREE.Mesh;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private t = 0;
  private active = false;
  private arrived = false;

  constructor() {
    this.geometry = new THREE.OctahedronGeometry(0.9, 0);
    this.material = new THREE.MeshBasicMaterial({
      color: COLOR.cyan,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
  }

  launch(from: THREE.Vector3, to: THREE.Vector3): void {
    this.from.copy(from);
    this.to.copy(to);
    this.t = 0;
    this.active = true;
    this.arrived = false;
    this.mesh.visible = true;
    this.mesh.position.copy(from);
  }

  /** True on the one frame the capsule reaches the ship. */
  update(dt: number): boolean {
    if (!this.active) return false;
    this.t = Math.min(this.t + dt / FX.vector.salvageSeconds, 1);
    const e = this.t * this.t;
    this.mesh.position.lerpVectors(this.from, this.to, e);
    // A little arc so it is not a straight slide.
    this.mesh.position.y += Math.sin(this.t * Math.PI) * 3;
    this.mesh.rotation.y += dt * 9;
    this.mesh.rotation.x += dt * 5;
    if (this.t >= 1 && !this.arrived) {
      this.arrived = true;
      this.active = false;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
