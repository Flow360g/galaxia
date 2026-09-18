import * as THREE from "three";
import { COLOR } from "./Tuning";

/**
 * A beam: one additive cylinder stretched between two points, scaled in
 * over `seconds` then faded. Used for our shot (cyan) and the alien's return
 * fire (red). A second, fainter instance doubles as the aim line while the
 * player drags the vector slider.
 */

const scratchFrom = new THREE.Vector3();
const scratchTo = new THREE.Vector3();
const scratchMid = new THREE.Vector3();

export class Beam {
  readonly group = new THREE.Group();

  private readonly outer: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly outerMaterial: THREE.MeshBasicMaterial;
  private readonly coreMaterial: THREE.MeshBasicMaterial;
  private readonly geometry: THREE.CylinderGeometry;

  private t = 0;
  private seconds = 0.3;
  private length = 1;
  private fade = 0;
  private active = false;
  private peak = 1;

  constructor(radius = 0.35) {
    // Authored along +Y; rotated so +Y becomes -Z (forward) in the group.
    this.geometry = new THREE.CylinderGeometry(radius, radius, 1, 8, 1, true);
    this.geometry.rotateX(Math.PI / 2);
    this.outerMaterial = new THREE.MeshBasicMaterial({
      color: COLOR.cyan,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: COLOR.white,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.outer = new THREE.Mesh(this.geometry, this.outerMaterial);
    this.core = new THREE.Mesh(this.geometry, this.coreMaterial);
    this.core.scale.set(0.4, 0.4, 1);
    this.group.add(this.outer, this.core);
    this.group.visible = false;
  }

  /** Fire from `from` to `to`, growing over `seconds`, at `peak` opacity. */
  fire(from: THREE.Vector3, to: THREE.Vector3, color: number, seconds: number, peak = 0.9): void {
    scratchFrom.copy(from);
    scratchTo.copy(to);
    this.length = Math.max(scratchFrom.distanceTo(scratchTo), 0.1);
    scratchMid.copy(scratchFrom);
    this.group.position.copy(scratchFrom);
    this.group.lookAt(scratchTo);
    this.outerMaterial.color.setHex(color);
    this.t = 0;
    this.fade = 0;
    this.seconds = Math.max(seconds, 0.05);
    this.peak = peak;
    this.active = true;
    this.group.visible = true;
  }

  /** Hold a steady faint line from `from` toward `to` (the aim line). */
  hold(from: THREE.Vector3, to: THREE.Vector3, color: number, opacity: number): void {
    this.group.position.copy(from);
    this.group.lookAt(to);
    this.length = Math.max(from.distanceTo(to), 0.1);
    this.outerMaterial.color.setHex(color);
    this.outerMaterial.opacity = opacity;
    this.coreMaterial.opacity = opacity * 0.5;
    this.outer.scale.set(1, 1, this.length);
    this.outer.position.z = -this.length / 2;
    this.core.scale.set(0.4, 0.4, this.length);
    this.core.position.z = -this.length / 2;
    this.active = false;
    this.group.visible = opacity > 0.005;
  }

  hide(): void {
    this.active = false;
    this.group.visible = false;
  }

  update(dt: number): void {
    if (!this.active) return;
    if (this.t < 1) {
      this.t = Math.min(this.t + dt / this.seconds, 1);
      const grown = this.length * this.t;
      this.outer.scale.set(1, 1, grown);
      this.outer.position.z = -grown / 2;
      this.core.scale.set(0.4, 0.4, grown);
      this.core.position.z = -grown / 2;
      this.outerMaterial.opacity = this.peak;
      this.coreMaterial.opacity = this.peak;
      return;
    }
    this.fade += dt / 0.3;
    const k = 1 - Math.min(this.fade, 1);
    this.outerMaterial.opacity = this.peak * k;
    this.coreMaterial.opacity = this.peak * k;
    if (this.fade >= 1) this.hide();
  }

  dispose(): void {
    this.geometry.dispose();
    this.outerMaterial.dispose();
    this.coreMaterial.dispose();
    this.group.clear();
  }
}
