import * as THREE from "three";
import { loadLambertModel } from "./gltf";
import { LANDMARK } from "./Tuning";

/**
 * The moon (or planet) that rises at a waypoint and hangs off one shoulder
 * through the next stage, then sinks away.
 *
 * A camera child like the backdrop, so it reads as impossibly distant while
 * costing one mesh. A GLB when one loads, otherwise a shaded sphere.
 */

type Mode = "hidden" | "rising" | "held" | "sinking";

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

  /** Rise into view over `LANDMARK.riseSeconds`. */
  rise(kind: "moon" | "planet", side: 1 | -1 = 1): void {
    void this.load(kind);
    this.side = side;
    this.mode = "rising";
    this.t = 0;
    this.group.visible = true;
    this.place(0);
  }

  sink(): void {
    if (this.mode === "hidden") return;
    this.mode = "sinking";
    this.t = 0;
  }

  /** 0 = fully below the frame, 1 = at rest. */
  private place(k: number): void {
    const y = LANDMARK.offsetY - (1 - k) * (LANDMARK.radius * 2 + LANDMARK.offsetY + 60);
    this.group.position.set(LANDMARK.offsetX * this.side, y, -LANDMARK.depth);
  }

  update(dt: number): void {
    if (this.mode === "hidden") return;
    this.body.rotation.y += LANDMARK.spin * dt;
    switch (this.mode) {
      case "rising": {
        this.t = Math.min(this.t + dt / LANDMARK.riseSeconds, 1);
        this.place(1 - Math.pow(1 - this.t, 3));
        if (this.t >= 1) this.mode = "held";
        break;
      }
      case "sinking": {
        this.t = Math.min(this.t + dt / LANDMARK.sinkSeconds, 1);
        this.place(1 - this.t * this.t);
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
