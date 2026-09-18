import * as THREE from "three";
import { COLOR, SPEED, STARS, WORLD } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Three parallax layers of stars plus a speed-streak layer.
 *
 * Depth cues are what make a treadmill read as travel. Near stars sweep past,
 * far stars barely move, and above a speed threshold the streak layer fades in
 * to sell the push. Stars are untextured additive points: a texture here would
 * cost a fetch and a sampler for something that is two pixels wide.
 *
 * Each layer writes directly into its position buffer, so no allocation per
 * frame and no per-star object overhead.
 */
export class Starfield {
  readonly group = new THREE.Group();

  private readonly layers: Array<{
    points: THREE.Points;
    positions: Float32Array;
    parallax: number;
    depth: number;
  }> = [];

  private streaks: THREE.LineSegments | null = null;
  private streakPositions: Float32Array | null = null;
  private streakMaterial: THREE.LineBasicMaterial | null = null;

  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(tier: QualityTier, private readonly random: () => number) {
    this.buildLayers(tier);
    this.buildStreaks(tier);
  }

  private buildLayers(tier: QualityTier): void {
    for (let layer = 0; layer < STARS.layerDepth.length; layer += 1) {
      const count = STARS.layerCounts[layer]?.[tier] ?? 100;
      const depth = STARS.layerDepth[layer]!;
      const positions = new Float32Array(count * 3);

      for (let i = 0; i < count; i += 1) {
        positions[i * 3] = (this.random() - 0.5) * 2 * STARS.spreadRadius;
        positions[i * 3 + 1] = (this.random() - 0.5) * 2 * STARS.spreadRadius;
        positions[i * 3 + 2] = -this.random() * depth;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );

      const material = new THREE.PointsMaterial({
        color: COLOR.white,
        size: STARS.layerSize[layer]!,
        sizeAttenuation: false,
        transparent: true,
        // Far layers sit dimmer, which does the depth work that a fog pass
        // cannot do for points.
        opacity: 0.9 - layer * 0.22,
        depthWrite: false,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;

      this.group.add(points);
      this.layers.push({
        points,
        positions,
        parallax: STARS.layerParallax[layer]!,
        depth,
      });
      this.disposables.push(geometry, material);
    }
  }

  private buildStreaks(tier: QualityTier): void {
    const count = STARS.streakCount[tier] ?? 0;
    if (count === 0) return;

    // Two vertices per streak: a line segment stretched along Z.
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i += 1) {
      const x = (this.random() - 0.5) * 2 * (STARS.spreadRadius * 0.5);
      const y = (this.random() - 0.5) * 2 * (STARS.spreadRadius * 0.4);
      const z = -this.random() * STARS.layerDepth[0]!;
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = z + STARS.streakLength;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: COLOR.white,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.streaks = new THREE.LineSegments(geometry, material);
    this.streaks.frustumCulled = false;
    this.streakPositions = positions;
    this.streakMaterial = material;

    this.group.add(this.streaks);
    this.disposables.push(geometry, material);
  }

  update(dt: number, speed: number): void {
    for (const layer of this.layers) {
      const travel = speed * layer.parallax * dt;
      const positions = layer.positions;

      for (let i = 2; i < positions.length; i += 3) {
        let z = positions[i]! + travel;
        // Wrap rather than recycle: stars have no identity worth preserving,
        // so a modulo back to the far plane is both correct and free.
        if (z > WORLD.recycleDistance) z -= layer.depth;
        positions[i] = z;
      }

      layer.points.geometry.getAttribute("position").needsUpdate = true;
    }

    this.updateStreaks(dt, speed);
  }

  private updateStreaks(dt: number, speed: number): void {
    if (!this.streaks || !this.streakPositions || !this.streakMaterial) return;

    // Fade in across the band above the threshold rather than snapping on.
    const range = Math.max(SPEED.max - SPEED.streakThreshold, 1);
    const intensity = clamp01((speed - SPEED.streakThreshold) / range);
    this.streakMaterial.opacity = intensity * 0.55;
    this.streaks.visible = intensity > 0.01;
    if (!this.streaks.visible) return;

    const travel = speed * dt * 1.35;
    const positions = this.streakPositions;
    const depth = STARS.layerDepth[0]!;

    // Streaks stretch with speed, so the segment length is recomputed rather
    // than fixed: at max speed they are nearly four times their base length.
    const length = STARS.streakLength * (0.6 + intensity * 2.4);

    for (let i = 0; i < positions.length; i += 6) {
      let z = positions[i + 2]! + travel;
      if (z > WORLD.recycleDistance) z -= depth;
      positions[i + 2] = z;
      positions[i + 5] = z + length;
    }

    this.streaks.geometry.getAttribute("position").needsUpdate = true;
  }

  dispose(): void {
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.layers.length = 0;
    this.group.clear();
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
