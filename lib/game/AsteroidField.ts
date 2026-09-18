import * as THREE from "three";
import { COLOR, FIELD, WORLD } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Ambient debris: hundreds of tumbling rocks streaming past the ship.
 *
 * All of them are one InstancedMesh, so the entire field is a single draw
 * call regardless of count. Rocks spawn in an annulus around the flight axis
 * so they frame the corridor without ever blocking it, then recycle to the
 * back once they pass the camera.
 *
 * Nothing in here allocates after construction. Per-frame work is matrix
 * composition into a preallocated buffer.
 */

// Module-level scratch. Reused every frame by every instance; never allocate
// a Vector3 or Quaternion inside the loop.
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchEuler = new THREE.Euler();
const scratchMatrix = new THREE.Matrix4();

interface Instance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
}

export class AsteroidField {
  readonly mesh: THREE.InstancedMesh;

  private readonly instances: Instance[] = [];
  /** Fraction of instances drawn. The rest are scaled to nothing, no realloc. */
  private density = 1;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshLambertMaterial;

  constructor(tier: QualityTier, private readonly random: () => number) {
    const count = FIELD.instanceCount[tier] ?? FIELD.instanceCount[2]!;

    this.geometry = buildRockGeometry(random);
    this.material = new THREE.MeshLambertMaterial({
      color: COLOR.body,
      flatShading: true,
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The field spans the whole corridor and is always on screen; skipping
    // per-instance culling saves a bounding-sphere test per frame.
    this.mesh.frustumCulled = false;

    for (let i = 0; i < count; i += 1) {
      const instance = this.createInstance();
      // Spread the initial population across the full depth so the first
      // frame is already a full field rather than a wall approaching.
      instance.z = -this.random() * WORLD.spawnDistance;
      this.instances.push(instance);
    }

    this.writeMatrices();
  }

  private createInstance(): Instance {
    // Polar placement keeps the annulus honest: uniform angle, radius biased
    // outward so rocks cluster away from the flight path rather than on it.
    const angle = this.random() * Math.PI * 2;
    const radius =
      FIELD.innerRadius +
      Math.sqrt(this.random()) * (FIELD.outerRadius - FIELD.innerRadius);

    return {
      x: Math.cos(angle) * radius,
      // Flatten vertically so the field reads as a debris belt, not a sphere.
      y: Math.sin(angle) * radius * 0.55,
      z: -WORLD.spawnDistance,
      scale:
        FIELD.minScale + this.random() * (FIELD.maxScale - FIELD.minScale),
      rotX: this.random() * Math.PI * 2,
      rotY: this.random() * Math.PI * 2,
      rotZ: this.random() * Math.PI * 2,
      spinX: (this.random() - 0.5) * FIELD.maxSpin,
      spinY: (this.random() - 0.5) * FIELD.maxSpin,
      spinZ: (this.random() - 0.5) * FIELD.maxSpin,
    };
  }

  private recycle(instance: Instance): void {
    const angle = this.random() * Math.PI * 2;
    const radius =
      FIELD.innerRadius +
      Math.sqrt(this.random()) * (FIELD.outerRadius - FIELD.innerRadius);

    instance.x = Math.cos(angle) * radius;
    instance.y = Math.sin(angle) * radius * 0.55;
    instance.z -= WORLD.spawnDistance;
    instance.scale =
      FIELD.minScale + this.random() * (FIELD.maxScale - FIELD.minScale);
  }

  /**
   * @param dt     clamped frame delta, seconds
   * @param speed  world speed, world units/sec
   */
  update(dt: number, speed: number): void {
    const travel = speed * dt;

    for (const instance of this.instances) {
      instance.z += travel;
      if (instance.z > WORLD.recycleDistance) this.recycle(instance);

      instance.rotX += instance.spinX * dt;
      instance.rotY += instance.spinY * dt;
      instance.rotZ += instance.spinZ * dt;
    }

    this.writeMatrices();
  }

  /** Thin the belt: 0..1 of the population stays visible. */
  setDensity(density: number): void {
    this.density = density < 0 ? 0 : density > 1 ? 1 : density;
  }

  private writeMatrices(): void {
    const visible = Math.round(this.instances.length * this.density);
    for (let i = 0; i < this.instances.length; i += 1) {
      const instance = this.instances[i]!;
      scratchPosition.set(instance.x, instance.y, instance.z);
      scratchEuler.set(instance.rotX, instance.rotY, instance.rotZ);
      scratchQuaternion.setFromEuler(scratchEuler);
      scratchScale.setScalar(i < visible ? instance.scale : 0);
      scratchMatrix.compose(
        scratchPosition,
        scratchQuaternion,
        scratchScale,
      );
      this.mesh.setMatrixAt(i, scratchMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.instances.length = 0;
  }
}

/**
 * An icosahedron with its vertices pushed around, so it reads as rock rather
 * than as a ball. One geometry is shared by every instance; per-instance
 * scale and rotation supply the variety.
 */
export function buildRockGeometry(random: () => number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute("position");

  // IcosahedronGeometry is non-indexed, so each vertex appears once per face.
  // Displacing by position hash rather than by index keeps shared corners
  // welded, which is what stops the mesh tearing open.
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const hash = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const noise = hash - Math.floor(hash);
    const displacement = 0.72 + noise * 0.56;
    position.setXYZ(i, x * displacement, y * displacement, z * displacement);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  // `random` is threaded through for callers that want per-call variation;
  // the hash above keeps a single geometry deterministic and weld-safe.
  void random;
  return geometry;
}
