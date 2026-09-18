import * as THREE from "three";
import { EXHAUST } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Fire out of one nozzle.
 *
 * Three cheap layers: a wide red-orange cone, a hot core cone inside it, and a
 * stream of additive points that peel off the back and cool from yellow to
 * red as they go. Everything is preallocated; per-frame work is scale writes
 * and one buffer update.
 */

const coreColor = new THREE.Color(EXHAUST.core);
const midColor = new THREE.Color(EXHAUST.mid);
const outerColor = new THREE.Color(EXHAUST.outer);
const scratchColor = new THREE.Color();

export class Exhaust {
  readonly group = new THREE.Group();

  private readonly outer: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private points: THREE.Points | null = null;
  private positions: Float32Array | null = null;
  private colors: Float32Array | null = null;
  /** Per-particle 0..1 progress along the stream. */
  private progress: Float32Array | null = null;
  private jitterX: Float32Array | null = null;
  private jitterY: Float32Array | null = null;

  private phase: number;
  private pulseAmount = 0;

  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(tier: QualityTier, random: () => number) {
    this.phase = random() * Math.PI * 2;

    // Cones point up +Y by default. Rotate so the tip points to +Z (rear)
    // and shift so the wide base sits on the nozzle and the tip trails.
    const cone = new THREE.ConeGeometry(1, 1, 10, 1, true);
    cone.rotateX(Math.PI / 2);
    cone.translate(0, 0, 0.5);
    this.disposables.push(cone);

    const outerMaterial = flameMaterial(EXHAUST.outer, 0.55);
    const coreMaterial = flameMaterial(EXHAUST.core, 0.9);
    this.disposables.push(outerMaterial, coreMaterial);

    this.outer = new THREE.Mesh(cone, outerMaterial);
    this.core = new THREE.Mesh(cone, coreMaterial);
    this.group.add(this.outer, this.core);

    this.buildParticles(tier, random);
  }

  private buildParticles(tier: QualityTier, random: () => number): void {
    const count: number = EXHAUST.particleCount[tier] ?? 0;
    if (count <= 0) return;

    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.progress = new Float32Array(count);
    this.jitterX = new Float32Array(count);
    this.jitterY = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      this.progress[i] = random();
      this.jitterX[i] = (random() - 0.5) * 2;
      this.jitterY[i] = (random() - 0.5) * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.disposables.push(geometry, material);
  }

  /** Spike the flame briefly, e.g. on a correct-answer boost. */
  pulse(strength = 1): void {
    this.pulseAmount = Math.min(this.pulseAmount + strength, 2);
  }

  /**
   * @param dt          clamped frame delta, seconds
   * @param elapsed     running time, drives flicker
   * @param speedRatio  0..1 across the speed band
   */
  update(dt: number, elapsed: number, speedRatio: number): void {
    this.pulseAmount *= Math.exp(-EXHAUST.pulseDecay * dt);

    const boost = 1 + this.pulseAmount * 0.6;
    const flicker =
      1 +
      (Math.sin(elapsed * 31 + this.phase) * 0.6 +
        Math.sin(elapsed * 57 + this.phase * 2) * 0.4) *
        EXHAUST.flicker;

    const length =
      (EXHAUST.baseLength + EXHAUST.speedLength * speedRatio) * boost * flicker;
    const radius = EXHAUST.radius * (1 + this.pulseAmount * 0.25);

    this.outer.scale.set(radius, radius, length);
    this.core.scale.set(radius * 0.48, radius * 0.48, length * 0.72);

    this.updateParticles(dt, speedRatio, boost);
  }

  private updateParticles(dt: number, speedRatio: number, boost: number): void {
    if (!this.points || !this.positions || !this.colors || !this.progress) return;
    const jitterX = this.jitterX!;
    const jitterY = this.jitterY!;

    const speed =
      (EXHAUST.particleSpeed + EXHAUST.particleSpeedBoost * speedRatio) * boost;
    const step = (speed * dt) / EXHAUST.particleTravel;
    const spread = EXHAUST.radius * 0.7;

    for (let i = 0; i < this.progress.length; i += 1) {
      let t = this.progress[i]! + step;
      if (t > 1) t -= 1;
      this.progress[i] = t;

      // Widen as they travel, so the stream reads as a plume not a rod.
      const flare = 0.4 + t * 1.4;
      const base = i * 3;
      this.positions[base] = jitterX[i]! * spread * flare;
      this.positions[base + 1] = jitterY[i]! * spread * flare;
      this.positions[base + 2] = t * EXHAUST.particleTravel * boost;

      // Yellow near the nozzle, orange in the middle, red and fading out.
      if (t < 0.35) {
        scratchColor.copy(coreColor).lerp(midColor, t / 0.35);
      } else {
        scratchColor.copy(midColor).lerp(outerColor, (t - 0.35) / 0.65);
      }
      const fade = 1 - t * t;
      this.colors[base] = scratchColor.r * fade;
      this.colors[base + 1] = scratchColor.g * fade;
      this.colors[base + 2] = scratchColor.b * fade;
    }

    const geometry = this.points.geometry;
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
  }

  dispose(): void {
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.group.clear();
  }
}

function flameMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}
