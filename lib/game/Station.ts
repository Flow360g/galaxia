import * as THREE from "three";
import { loadLambertModel } from "./gltf";
import { STATION } from "./Tuning";

/**
 * The relay station, on the flight: WHERE ON EARTH opens on it coming up
 * out of the distance dead ahead, and the ship throttles back to come
 * alongside.
 *
 * A camera child like the landmark, and placed the same way: the approach is
 * projected rather than flown (see `Landmark` for why), so the station stays
 * at `STATION.depth` and its offsets and scale carry the distance. That keeps
 * a body reading as kilometres away inside `CAMERA.far`, and leaves the depth
 * buffer alone.
 *
 * Arrival is a timer, never an asset. The GLB is preloaded when the run
 * starts, but if it has not landed by the last encounter the approach flies
 * on a stand-in, and ENTER SPACE STATION arms on the same beat either way.
 */

type Mode = "hidden" | "approaching" | "held";

export class Station {
  readonly group = new THREE.Group();

  /** Spins about the docking axis; the model or the stand-in sits inside it. */
  private readonly body = new THREE.Group();
  private disposables: Array<{ dispose(): void }> = [];
  private loading: Promise<void> | null = null;
  private disposed = false;

  private mode: Mode = "hidden";
  private t = 0;

  constructor() {
    this.group.add(this.body);
    this.group.visible = false;
    this.buildFallback();
  }

  /**
   * A stand-in with the station's silhouette: a tube on the docking axis,
   * solar wings out one side, a dish out the other. Grey, flat, and gone the
   * moment the model lands.
   */
  private buildFallback(): void {
    const length = STATION.length;
    const material = new THREE.MeshLambertMaterial({
      color: 0xb8bec9,
      emissive: 0x1a2238,
      emissiveIntensity: 0.4,
      flatShading: true,
      fog: false,
    });
    const tube = new THREE.BoxGeometry(length * 0.14, length * 0.6, length * 0.14);
    const wing = new THREE.BoxGeometry(length * 0.03, length * 0.3, length * 0.45);
    const dish = new THREE.BoxGeometry(length * 0.1, length * 0.1, length * 0.12);

    const wingMesh = new THREE.Mesh(wing, material);
    wingMesh.position.z = length * 0.27;
    const dishMesh = new THREE.Mesh(dish, material);
    dishMesh.position.z = -length * 0.22;

    this.body.add(new THREE.Mesh(tube, material), wingMesh, dishMesh);
    this.body.rotation.y = STATION.yaw;
    this.disposables = [tube, wing, dish, material];
  }

  /**
   * Fetch the model. Idempotent: the engine calls it at construction so the
   * bytes are in by the last encounter, and `approach` calls it again in
   * case they are not.
   */
  load(): Promise<void> {
    if (!this.loading) this.loading = this.install();
    return this.loading;
  }

  private async install(): Promise<void> {
    const loaded = await loadLambertModel(STATION.modelUrl, STATION.length, STATION.yaw);
    if (!loaded) {
      // Let a later call try again rather than pinning the stand-in for good.
      this.loading = null;
      return;
    }
    if (this.disposed) {
      loaded.disposables.forEach((item) => item.dispose());
      return;
    }
    for (const material of loaded.materials) material.fog = false;
    this.body.clear();
    this.body.rotation.y = 0;
    this.disposables.forEach((item) => item.dispose());
    this.body.add(loaded.group);
    this.disposables = loaded.disposables;
  }

  /** Come up out of the distance, dead ahead, over `STATION.approachSeconds`. */
  approach(): void {
    void this.load();
    this.mode = "approaching";
    this.t = 0;
    this.group.visible = true;
    this.place(0);
  }

  /** 0 = far off and small, 1 = alongside. */
  private place(k: number): void {
    const z = THREE.MathUtils.lerp(STATION.farDepth, STATION.depth, k);
    const near = STATION.depth / z;
    this.group.position.set(STATION.offsetX * near, STATION.offsetY * near, -STATION.depth);
    this.group.scale.setScalar(near);
  }

  /**
   * Step the approach. Returns true on the one frame it completes, which is
   * the engine's cue to tell the run the ship is alongside.
   */
  update(dt: number): boolean {
    if (this.mode === "hidden") return false;
    this.body.rotation.y += STATION.spin * dt;
    if (this.mode !== "approaching") return false;

    // Ease the distance, not the picture: closing at a steady speed is
    // linear in z, and the exponent only softens the last of it so the
    // station settles alongside rather than stopping dead.
    this.t = Math.min(this.t + dt / STATION.approachSeconds, 1);
    this.place(1 - Math.pow(1 - this.t, 1.6));
    if (this.t < 1) return false;
    this.mode = "held";
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.body.clear();
    this.group.clear();
  }
}
