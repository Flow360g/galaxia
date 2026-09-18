import * as THREE from "three";
import { COLOR, FX } from "./Tuning";

/**
 * The shield bubble. Invisible until something hits it, then an additive
 * flash that rings out over `FX.shieldSeconds`. A slingshot flashes it in
 * boost orange instead, the heat of skimming the rock.
 */
export class Shield {
  readonly mesh: THREE.Mesh;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private amount = 0;
  private peak = 1;

  constructor() {
    this.geometry = new THREE.IcosahedronGeometry(1, 2);
    this.material = new THREE.MeshBasicMaterial({
      color: COLOR.shield,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      wireframe: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.scale.set(4.4, 2.6, 5.2);
    this.mesh.visible = false;
  }

  flash(strength = 1, color: number = COLOR.shield): void {
    this.material.color.setHex(color);
    this.amount = 1;
    this.peak = strength;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.amount -= dt / FX.shieldSeconds;
    if (this.amount <= 0) {
      this.amount = 0;
      this.material.opacity = 0;
      this.mesh.visible = false;
      return;
    }
    // Rings out: bright and tight first, then swelling and fading.
    const ring = 1 + (1 - this.amount) * 0.35;
    this.mesh.scale.set(4.4 * ring, 2.6 * ring, 5.2 * ring);
    this.material.opacity = Math.min(1, this.amount * this.amount * 0.9 * this.peak);
    this.mesh.rotation.y += dt * 2;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
