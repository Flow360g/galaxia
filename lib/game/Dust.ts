import * as THREE from "three";
import { disposeGlow, glowTexture } from "./glow";
import { AMBIENCE, CAMERA } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Fine dust streaming past close to the camera.
 *
 * The stars sell distance; the dust sells speed. It lives in a box around the
 * ship, rushes past a little faster than the world does (it is nearer than
 * anything else) and wraps to the back when it passes the lens. It is faint
 * at cruise and brightens up the speed band, so a burst of plasma reads as
 * the ship tearing through something rather than the numbers going up.
 *
 * One `Points`, one buffer write a frame, no allocation.
 */

const D = AMBIENCE.dust;

export class Dust {
  readonly points: THREE.Points | null = null;

  private readonly positions: Float32Array | null = null;
  private readonly material: THREE.PointsMaterial | null = null;
  private readonly geometry: THREE.BufferGeometry | null = null;

  constructor(tier: QualityTier, reducedMotion: boolean, random: () => number) {
    const count = reducedMotion ? 0 : (D.count[tier] ?? 0);
    if (count <= 0) return;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (random() * 2 - 1) * D.halfWidth;
      positions[i * 3 + 1] = (random() * 2 - 1) * D.halfHeight;
      positions[i * 3 + 2] = CAMERA.offsetZ - random() * D.depth;
    }
    this.positions = positions;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.material = new THREE.PointsMaterial({
      map: glowTexture(),
      color: D.color,
      size: D.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: D.opacityMin,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /**
   * @param speed  world units per second
   * @param ratio  0..1 across the speed band, plus any surge
   */
  update(dt: number, speed: number, ratio: number): void {
    if (!this.positions || !this.material || !this.geometry) return;
    const k = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
    this.material.opacity = D.opacityMin + (D.opacityMax - D.opacityMin) * k;

    const travel = speed * D.parallax * dt;
    const back = CAMERA.offsetZ;
    const positions = this.positions;
    for (let i = 2; i < positions.length; i += 3) {
      let z = positions[i]! + travel;
      if (z > back) z -= D.depth;
      positions[i] = z;
    }
    this.geometry.getAttribute("position").needsUpdate = true;
  }

  dispose(): void {
    this.geometry?.dispose();
    if (this.material) disposeGlow(this.material);
  }
}
