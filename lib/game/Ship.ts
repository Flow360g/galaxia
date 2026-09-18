import * as THREE from "three";
import { COLOR, SHIP, WORLD } from "./Tuning";
import type { Input } from "./Input";

/**
 * The player ship: a procedural, flat-shaded delta with two nacelles.
 *
 * Built from a handful of primitives merged at construction so the whole hull
 * is one draw call. Deliberately hard-edged and near-monochrome, per the
 * design system: white facets, ink panel lines, accent only on the engines.
 *
 * The ship never moves on Z. It steers on X and Y inside the corridor while
 * the world is translated past it.
 */
export class Ship {
  readonly group = new THREE.Group();

  /** Lateral velocity, world units/sec. Drives bank and camera lead. */
  velocityX = 0;
  velocityY = 0;

  private hull!: THREE.Mesh;
  private readonly trails: THREE.Mesh[] = [];
  private trailMaterial!: THREE.MeshBasicMaterial;
  private roll = 0;
  private pitch = 0;
  private bobPhase = 0;
  private elapsed = 0;

  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(private readonly reducedMotion: boolean) {
    this.buildHull();
    this.buildTrail();
    this.group.position.set(0, 0, SHIP.z);
  }

  private buildHull(): void {
    const parts: THREE.BufferGeometry[] = [];

    // Delta body, built from an explicit triangle list rather than a lathed
    // primitive. A cone viewed from behind presents its flat base to the
    // camera and reads as a slab; an authored arrowhead keeps a sharp
    // silhouette from the one angle the player actually sees.
    parts.push(buildDelta());

    // Cockpit blister, proud of the spine.
    const cockpit = new THREE.OctahedronGeometry(0.42, 0);
    cockpit.scale(0.8, 0.5, 1.6);
    cockpit.translate(0, 0.38, -0.35);
    parts.push(cockpit);

    // Nacelles out on the wings. Boxes, not cylinders: flat facets catch the
    // directional light and hold the hard edges the rest of the ship has.
    for (const side of [-1, 1]) {
      const nacelle = new THREE.BoxGeometry(0.44, 0.4, 2.1);
      nacelle.translate(side * 1.62, -0.06, 0.45);
      parts.push(nacelle);

      const pylon = new THREE.BoxGeometry(1.0, 0.12, 0.7);
      pylon.translate(side * 1.12, -0.06, 0.6);
      parts.push(pylon);
    }

    const merged = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());

    // Flat shading is both the look and the cheap option: no normal
    // interpolation, and it owns the low polygon count rather than hiding it.
    const material = new THREE.MeshLambertMaterial({
      color: COLOR.white,
      flatShading: true,
    });

    this.hull = new THREE.Mesh(merged, material);
    this.group.add(this.hull);
    this.disposables.push(merged, material);

    // Hairline edge overlay in ink: the 3D read of a 1px rule.
    const edges = new THREE.EdgesGeometry(merged, 24);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: COLOR.ink,
      transparent: true,
      opacity: 0.6,
    });
    this.hull.add(new THREE.LineSegments(edges, edgeMaterial));
    this.disposables.push(edges, edgeMaterial);
  }

  private buildTrail(): void {
    // One additive quad per nacelle, lying in the XZ plane behind the
    // exhaust. Two small streaks read as engines; one big plane read as a
    // sheet of blue hanging off the back of the ship.
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: COLOR.accent,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.disposables.push(geometry, material);

    for (const side of [-1, 1]) {
      const trail = new THREE.Mesh(geometry, material);
      trail.rotation.x = -Math.PI / 2;
      trail.position.set(side * 1.62, -0.06, 1.6);
      this.group.add(trail);
      this.trails.push(trail);
    }

    this.trailMaterial = material;
  }

  /**
   * @param dt          clamped frame delta, seconds
   * @param input       steering axes
   * @param speedRatio  0..1 across the speed band, drives trail length
   */
  update(dt: number, input: Input, speedRatio: number): void {
    this.elapsed += dt;

    const targetVX = input.axis.x * SHIP.lateralSpeed;
    const targetVY = -input.axis.y * SHIP.verticalSpeed;

    // Exponential smoothing, framerate-independent. Using 1-exp(-k*dt) rather
    // than a raw lerp factor keeps the feel identical at 30fps and 120fps.
    const response = 1 - Math.exp(-SHIP.steerResponse * dt);
    this.velocityX += (targetVX - this.velocityX) * response;
    this.velocityY += (targetVY - this.velocityY) * response;

    this.group.position.x = clamp(
      this.group.position.x + this.velocityX * dt,
      -WORLD.corridorHalfWidth,
      WORLD.corridorHalfWidth,
    );
    this.group.position.y = clamp(
      this.group.position.y + this.velocityY * dt,
      -WORLD.corridorHalfHeight,
      WORLD.corridorHalfHeight,
    );

    // Stop dead at the corridor wall rather than grinding along it with
    // residual velocity still feeding the bank angle.
    if (Math.abs(this.group.position.x) >= WORLD.corridorHalfWidth) {
      this.velocityX *= 0.3;
    }
    if (Math.abs(this.group.position.y) >= WORLD.corridorHalfHeight) {
      this.velocityY *= 0.3;
    }

    // Bank into the turn. Roll is the single biggest contributor to the ship
    // feeling like a vehicle rather than a sprite.
    const rollResponse = 1 - Math.exp(-SHIP.rollResponse * dt);
    const targetRoll = -(this.velocityX / SHIP.lateralSpeed) * SHIP.maxRoll;
    const targetPitch = (this.velocityY / SHIP.verticalSpeed) * SHIP.maxPitch;
    this.roll += (targetRoll - this.roll) * rollResponse;
    this.pitch += (targetPitch - this.pitch) * rollResponse;

    this.group.rotation.z = this.roll;
    this.group.rotation.x = this.pitch;
    this.group.rotation.y = (this.velocityX / SHIP.lateralSpeed) * SHIP.maxYaw;

    // Idle bob, so a stationary ship still reads as flying. Suppressed for
    // players who asked for reduced motion.
    if (!this.reducedMotion) {
      this.bobPhase += dt * SHIP.bobRate;
      this.hull.position.y = Math.sin(this.bobPhase) * SHIP.bobAmplitude;
    }

    // Trails stretch with speed. This is most of what sells acceleration at
    // a glance, since the world itself is just moving faster.
    const trailLength = 1.2 + speedRatio * 3.2;
    for (const trail of this.trails) {
      trail.scale.set(0.34, trailLength, 1);
      trail.position.z = 1.5 + trailLength * 0.5;
    }
    this.trailMaterial.opacity = 0.4 + speedRatio * 0.45;
  }

  /** Continuous lane position, e.g. 2.4 = 40% from lane 2 toward lane 3. */
  get lanePosition(): number {
    const normalised =
      (this.group.position.x + WORLD.corridorHalfWidth) /
      (WORLD.corridorHalfWidth * 2);
    return normalised * (WORLD.laneCount - 1);
  }

  get currentLane(): number {
    return Math.round(this.lanePosition);
  }

  dispose(): void {
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.group.clear();
  }
}

/**
 * Minimal geometry merge. three's BufferGeometryUtils lives in the examples
 * bundle; we only ever merge non-indexed position/normal geometries, so this
 * avoids pulling that in.
 */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  for (const geometry of geometries) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute("position");
    const normal = source.getAttribute("normal");

    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      if (normal) {
        normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      }
    }

    // toNonIndexed() allocates a new geometry; free it, but never free the
    // caller's own geometry here (they dispose those themselves).
    if (source !== geometry) source.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  if (normals.length === positions.length) {
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  } else {
    merged.computeVertexNormals();
  }
  return merged;
}

/**
 * The hull proper: a six-triangle arrowhead with a raised spine and a keel.
 *
 * Winding is ordered so every face normal points outward, which flat shading
 * depends on entirely: a reversed triangle renders black and reads as a hole.
 */
function buildDelta(): THREE.BufferGeometry {
  // Nose points down -Z, the direction of travel.
  const nose: Vertex = [0, 0, -2.8];
  const wingLeft: Vertex = [-2.1, -0.1, 1.5];
  const wingRight: Vertex = [2.1, -0.1, 1.5];
  const spine: Vertex = [0, 0.55, 0.9];
  const keel: Vertex = [0, -0.45, 0.9];

  const faces: Vertex[][] = [
    [nose, wingLeft, spine],
    [nose, spine, wingRight],
    [nose, keel, wingLeft],
    [nose, wingRight, keel],
    [spine, wingLeft, keel],
    [spine, keel, wingRight],
  ];

  const positions: number[] = [];
  for (const face of faces) {
    for (const vertex of face) positions.push(vertex[0], vertex[1], vertex[2]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

type Vertex = [number, number, number];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
