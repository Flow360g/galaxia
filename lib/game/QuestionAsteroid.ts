import * as THREE from "three";
import { COLOR, QUESTION, WORLD } from "./Tuning";
import { buildRockGeometry } from "./AsteroidField";

/**
 * The large, labelled asteroids that carry answers.
 *
 * These are individual meshes rather than instances: there are only ever a
 * handful live, and each needs its own material state (accent wireframe when
 * active, resolved colour after commit) plus a DOM label projected over it.
 *
 * Labels are DOM, not canvas text or sprites. At this count the projection
 * cost is nil, and DOM gives sharp type at any DPR, the design system's
 * mono/sans split for free, and text that a screen reader can reach.
 */

const scratchVector = new THREE.Vector3();

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export class QuestionAsteroid {
  readonly group = new THREE.Group();

  lane = 0;
  label = "";
  active = false;
  /** Set once the ship has flown into this rock; it collapses and retires. */
  shattering = false;

  private readonly mesh: THREE.Mesh;
  private readonly wireframe: THREE.LineSegments;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly wireMaterial: THREE.LineBasicMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly wireGeometry: THREE.BufferGeometry;

  private spin = { x: 0.12, y: 0.18, z: 0.07 };
  private shatterT = 0;

  constructor(random: () => number) {
    this.geometry = buildRockGeometry(random);

    this.material = new THREE.MeshLambertMaterial({
      color: COLOR.panelLabel,
      flatShading: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.scale.setScalar(QUESTION.radius);
    this.group.add(this.mesh);

    // Accent hairline over the rock. This is the 3D read of "active state":
    // colour as signal, applied to structure, never as a fill.
    this.wireGeometry = new THREE.EdgesGeometry(this.geometry, 18);
    this.wireMaterial = new THREE.LineBasicMaterial({
      color: COLOR.accent,
      transparent: true,
      opacity: 0.9,
    });
    this.wireframe = new THREE.LineSegments(this.wireGeometry, this.wireMaterial);
    this.wireframe.scale.setScalar(QUESTION.radius * 1.02);
    this.group.add(this.wireframe);

    this.spin = {
      x: (random() - 0.5) * 0.3,
      y: (random() - 0.5) * 0.3,
      z: (random() - 0.5) * 0.3,
    };

    this.group.visible = false;
  }

  /** Place this asteroid in a lane at the spawn plane and show it. */
  spawn(lane: number, label: string): void {
    this.lane = lane;
    this.label = label;
    this.active = true;
    this.shattering = false;
    this.shatterT = 0;
    this.group.visible = true;
    this.group.scale.setScalar(1);

    this.group.position.set(
      laneToX(lane),
      lane % 2 === 0 ? QUESTION.laneOffsetY : -QUESTION.laneOffsetY,
      -WORLD.spawnDistance - lane * QUESTION.laneStaggerZ,
    );
    this.setResolved(null);
  }

  retire(): void {
    this.active = false;
    this.shattering = false;
    this.group.visible = false;
  }

  /** Begin the collapse. The rock keeps flying while it shrinks. */
  shatter(): void {
    if (!this.active || this.shattering) return;
    this.shattering = true;
    this.shatterT = 0;
  }

  /**
   * Tint after an answer resolves. `null` restores the neutral pending state.
   * `chosen` is the rock in the lane the ship committed to.
   */
  setResolved(accuracy: number | null, chosen = false): void {
    if (accuracy === null) {
      this.material.color.setHex(COLOR.panelLabel);
      this.wireMaterial.color.setHex(COLOR.accent);
      this.wireMaterial.opacity = 0.9;
      return;
    }

    if (!chosen) {
      // The rocks not taken dim out of the way.
      this.material.color.setHex(COLOR.body);
      this.wireMaterial.color.setHex(COLOR.body);
      this.wireMaterial.opacity = 0.4;
      return;
    }

    // Semantic colour only where meaning demands it.
    if (accuracy >= 0.65) {
      this.material.color.setHex(COLOR.pos);
      this.wireMaterial.color.setHex(COLOR.pos);
    } else if (accuracy >= 0.35) {
      this.material.color.setHex(COLOR.panelLabel);
      this.wireMaterial.color.setHex(COLOR.white);
    } else {
      this.material.color.setHex(COLOR.neg);
      this.wireMaterial.color.setHex(COLOR.neg);
    }
    this.wireMaterial.opacity = 0.9;
  }

  update(dt: number, speed: number): void {
    if (!this.active) return;

    this.group.position.z += speed * dt;
    this.group.rotation.x += this.spin.x * dt;
    this.group.rotation.y += this.spin.y * dt;
    this.group.rotation.z += this.spin.z * dt;

    if (this.shattering) {
      this.shatterT += dt / QUESTION.shatterSeconds;
      if (this.shatterT >= 1) {
        this.retire();
        return;
      }
      // Ease out: a fast initial collapse, then the last shards blink away.
      const s = 1 - this.shatterT * this.shatterT;
      this.group.scale.setScalar(s);
      this.group.rotation.y += dt * 9;
    }

    if (this.group.position.z > WORLD.recycleDistance) this.retire();
  }

  /**
   * Project this asteroid's label anchor (just above the rock) to normalised
   * screen space for the DOM label. Returns null when it is behind the camera
   * or off screen.
   */
  projectToScreen(
    camera: THREE.Camera,
    width: number,
    height: number,
  ): { x: number; y: number; scale: number; opacity: number } | null {
    if (!this.active || this.shattering) return null;

    // At the spawn plane perspective squeezes all four lanes into a few
    // pixels, so their labels pile into one unreadable blob. Hold them back
    // until the set has spread out, then fade them in.
    const depth = -this.group.position.z;
    if (depth > QUESTION.labelFadeFar) return null;

    scratchVector.copy(this.group.position);
    scratchVector.y += QUESTION.radius * QUESTION.labelLift;
    scratchVector.project(camera);

    // z > 1 means behind the near plane; the projection wraps and the label
    // would appear mirrored at the wrong end of the screen.
    if (scratchVector.z > 1) return null;

    const x = (scratchVector.x * 0.5 + 0.5) * width;
    const y = (-scratchVector.y * 0.5 + 0.5) * height;

    if (x < -200 || x > width + 200 || y < -200 || y > height + 200) {
      return null;
    }

    // Labels shrink with distance, but only to a floor, so a far question is
    // still readable on a phone.
    const scale = Math.max(0.62, Math.min(1, 90 / Math.max(depth, 1)));
    const opacity = clamp01(
      (QUESTION.labelFadeFar - depth) /
        (QUESTION.labelFadeFar - QUESTION.labelFadeNear),
    );

    return { x, y, scale, opacity };
  }

  dispose(): void {
    this.geometry.dispose();
    this.wireGeometry.dispose();
    this.material.dispose();
    this.wireMaterial.dispose();
    this.group.clear();
  }
}

/** Lane index to world X. Lane 0 is the left wall, laneCount-1 the right. */
export function laneToX(lane: number): number {
  const normalised = lane / Math.max(WORLD.laneCount - 1, 1);
  return normalised * WORLD.corridorHalfWidth * 2 - WORLD.corridorHalfWidth;
}
