import * as THREE from "three";
import type { Ship } from "./Ship";
import { TRAILS } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Light trails off the wingtips.
 *
 * Each trail is a flat ribbon streaming aft from a wingtip. The world moves
 * and the ship does not, so a trail is laid out along +Z at a fixed length and
 * its shape is the tip's recent path: every sample chases the one ahead of it
 * at a rate set by the speed, a delay line, so a swerve bends the ribbon and
 * straightens out behind the ship. It shows above cruise and flares on a
 * burst, and is nothing at a crawl.
 *
 * Two meshes, additive, vertex colours faded down their length.
 */

const color = new THREE.Color(TRAILS.color);
const tip = new THREE.Vector3();

interface Ribbon {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  position: Float32Array;
  colors: Float32Array;
  x: Float32Array;
  y: Float32Array;
  primed: boolean;
}

export class Trails {
  readonly group = new THREE.Group();

  private readonly ribbons: Ribbon[] = [];
  private readonly material: THREE.MeshBasicMaterial;
  private readonly count: number;
  private flare = 0;

  constructor(tier: QualityTier) {
    this.count = TRAILS.points[tier] ?? 0;
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    if (this.count < 2) return;

    for (let r = 0; r < 2; r += 1) {
      const n = this.count;
      const position = new Float32Array(n * 2 * 3);
      const colors = new Float32Array(n * 2 * 3);
      const index: number[] = [];
      for (let i = 0; i < n - 1; i += 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setIndex(index);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.ribbons.push({
        mesh,
        geometry,
        position,
        colors,
        x: new Float32Array(n),
        y: new Float32Array(n),
        primed: false,
      });
    }
  }

  /** Flare the trails on a burst, 0..1 and more. */
  pulse(amount: number): void {
    this.flare = Math.max(this.flare, amount);
  }

  /**
   * @param ratio       0..1 across the speed band
   * @param worldSpeed  world units per second
   */
  update(dt: number, ship: Ship, ratio: number, worldSpeed: number): void {
    this.flare *= Math.exp(-2.2 * dt);
    const span = 1 - TRAILS.minRatio;
    const speedVis = Math.min(Math.max((ratio - TRAILS.minRatio) / span, 0), 1);
    const visibility = Math.min(speedVis + this.flare, 1.4);

    const n = this.count;
    const seg = TRAILS.length / Math.max(n - 1, 1);
    // A sample catches up with the one ahead at the rate the world covers a
    // segment: faster flight, straighter trail.
    const follow = 1 - Math.exp(-(Math.max(worldSpeed, 30) / seg) * dt);
    const width = TRAILS.width * (1 + this.flare * 0.8);

    for (let side = 0; side < this.ribbons.length; side += 1) {
      const ribbon = this.ribbons[side]!;
      if (!ship.wingtip(side as 0 | 1, tip) || visibility <= 0.01) {
        ribbon.mesh.visible = false;
        ribbon.primed = false;
        continue;
      }
      ribbon.mesh.visible = true;
      const { x, y, position, colors } = ribbon;
      if (!ribbon.primed) {
        x.fill(tip.x);
        y.fill(tip.y);
        ribbon.primed = true;
      }
      x[0] = tip.x;
      y[0] = tip.y;
      for (let i = 1; i < n; i += 1) {
        x[i]! += (x[i - 1]! - x[i]!) * follow;
        y[i]! += (y[i - 1]! - y[i]!) * follow;
      }
      for (let i = 0; i < n; i += 1) {
        const z = tip.z + i * seg;
        const t = i / (n - 1);
        const w = width * (1 - t);
        const j = i * 6;
        position[j] = x[i]! - w;
        position[j + 1] = y[i]!;
        position[j + 2] = z;
        position[j + 3] = x[i]! + w;
        position[j + 4] = y[i]!;
        position[j + 5] = z;
        const a = TRAILS.opacity * visibility * (1 - t) * (1 - t);
        colors[j] = colors[j + 3] = color.r * a;
        colors[j + 1] = colors[j + 4] = color.g * a;
        colors[j + 2] = colors[j + 5] = color.b * a;
      }
      ribbon.geometry.getAttribute("position").needsUpdate = true;
      ribbon.geometry.getAttribute("color").needsUpdate = true;
    }
  }

  dispose(): void {
    this.ribbons.forEach((r) => r.geometry.dispose());
    this.material.dispose();
    this.group.clear();
  }
}
