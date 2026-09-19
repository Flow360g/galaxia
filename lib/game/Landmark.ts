import * as THREE from "three";
import { loadLambertModel } from "./gltf";
import { LANDMARK } from "./Tuning";

/**
 * The moon (or planet) the ship closes on at a waypoint. It comes up out of
 * the distance, holds off one shoulder through the next stage, then swells
 * and slides off the corner as the ship goes past it.
 *
 * A camera child like the backdrop, so it reads as impossibly distant while
 * costing one mesh. A GLB when one loads, otherwise a shaded sphere.
 *
 * The approach is projected rather than flown. Perspective depends on nothing
 * but X/Z, Y/Z and an angular size of r/|Z|, so a body travelling from
 * `farDepth` to `depth` is exactly the same picture as one held at `depth`
 * whose offsets and scale are multiplied by `depth / z`. Doing it that way
 * keeps the disc inside `CAMERA.far` at every point of the approach, and
 * leaves the depth buffer alone.
 */

type Mode = "hidden" | "approaching" | "held" | "passing";

export class Landmark {
  readonly group = new THREE.Group();

  private readonly body = new THREE.Group();
  private disposables: Array<{ dispose(): void }> = [];
  private loadedKind: "moon" | "planet" | null = null;
  private disposed = false;

  private mode: Mode = "hidden";
  private t = 0;
  private side: 1 | -1 = 1;

  constructor() {
    this.group.add(this.body);
    this.group.visible = false;
    this.buildFallback();
  }

  private buildFallback(): void {
    const geometry = new THREE.SphereGeometry(1, 28, 20);
    const material = new THREE.MeshLambertMaterial({
      color: 0x8b8f99,
      emissive: 0x1a2238,
      emissiveIntensity: 0.6,
      fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(LANDMARK.radius);
    this.body.add(mesh);
    this.disposables = [geometry, material];
  }

  private async load(kind: "moon" | "planet"): Promise<void> {
    if (this.loadedKind === kind) return;
    const url = kind === "moon" ? LANDMARK.moonUrl : LANDMARK.planetUrl;
    const loaded = await loadLambertModel(url, LANDMARK.radius * 2);
    if (!loaded || this.disposed) return;
    for (const material of loaded.materials) material.fog = false;
    this.body.clear();
    this.disposables.forEach((item) => item.dispose());
    this.body.add(loaded.group);
    this.disposables = loaded.disposables;
    this.loadedKind = kind;
  }

  /** Come in from the distance over `LANDMARK.approachSeconds`. */
  approach(kind: "moon" | "planet", side: 1 | -1 = 1): void {
    void this.load(kind);
    this.side = side;
    this.mode = "approaching";
    this.t = 0;
    this.group.visible = true;
    this.place(0);
  }

  /** Fly past it: it swells and leaves by the corner. */
  pass(): void {
    if (this.mode === "hidden") return;
    this.mode = "passing";
    this.t = 0;
  }

  /** 0 = far off and small, 1 = at rest on the shoulder, 2 = gone past. */
  private place(k: number): void {
    const z =
      k <= 1
        ? THREE.MathUtils.lerp(LANDMARK.farDepth, LANDMARK.depth, k)
        : THREE.MathUtils.lerp(LANDMARK.depth, LANDMARK.passDepth, k - 1);
    const near = LANDMARK.depth / z;
    this.group.position.set(LANDMARK.offsetX * this.side * near, LANDMARK.offsetY * near, -LANDMARK.depth);
    this.group.scale.setScalar(near);
  }

  update(dt: number): void {
    if (this.mode === "hidden") return;
    this.body.rotation.y += LANDMARK.spin * dt;
    switch (this.mode) {
      case "approaching": {
        // Ease the distance, not the picture. Closing at a steady speed is
        // linear in z, and that is what gives the slow-then-rush swell of
        // something actually being approached; the exponent only softens the
        // last of it so the disc settles rather than stopping dead.
        this.t = Math.min(this.t + dt / LANDMARK.approachSeconds, 1);
        this.place(1 - Math.pow(1 - this.t, 1.6));
        if (this.t >= 1) this.mode = "held";
        break;
      }
      case "passing": {
        this.t = Math.min(this.t + dt / LANDMARK.passSeconds, 1);
        this.place(1 + this.t * this.t);
        if (this.t >= 1) {
          this.mode = "hidden";
          this.group.visible = false;
        }
        break;
      }
      case "held":
        break;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.body.clear();
    this.group.clear();
  }
}
