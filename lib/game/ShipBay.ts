import * as THREE from "three";
import { loadLambertModel } from "./gltf";
import { dprForTier, detectTier, prefersReducedMotion } from "./quality";
import { DEFAULT_SHIP, type ShipSpec } from "./ships";
import { COLOR, HANGAR, PERF } from "./Tuning";

/**
 * The ship bay: one hull, turning on a lit deck.
 *
 * A second, much smaller imperative shell alongside `Engine`. It follows the
 * same rules (owns its canvas, creates it rather than being handed one, flat
 * Lambert materials, no shadows, DPR capped by tier, every number from
 * `HANGAR` in Tuning.ts) but there is no run, no treadmill and no game state:
 * a frame here is a rotation and a bob.
 *
 * Deliberately not part of `Engine`. Putting a showroom mode into the flight
 * engine would mean the flight engine growing a mode, and the hangar is the
 * one place in the game where the ship is a thing to look at rather than a
 * thing being flown.
 */
export class ShipBay {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();

  /** Turntable the hull is parented to, so the mesh itself stays untouched. */
  private readonly turntable = new THREE.Group();
  /** What the current hull owns, dropped whenever the hull changes. */
  private hull: THREE.Group | null = null;
  private hullDisposables: Array<{ dispose(): void }> = [];
  /** Bumped on every load so a slow fetch cannot install a stale hull. */
  private loadToken = 0;
  /**
   * Bounding-sphere radius of the hull on the turntable. What the camera is
   * framed against, measured rather than assumed: the catalogue normalises a
   * hull's LONGEST axis, which for a wide one is its wingspan, so two hulls
   * with the same `modelLength` can need very different distances.
   */
  private hullRadius = DEFAULT_SHIP.modelLength * 0.6;

  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly reducedMotion = prefersReducedMotion();

  private frameHandle: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private elapsed = 0;
  private width = 0;
  private height = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement) {
    const tier = detectTier();

    this.canvas = document.createElement("canvas");
    this.canvas.dataset.galaxiaBay = "true";
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: tier === 0,
      alpha: false,
      stencil: false,
      depth: true,
    });
    this.renderer.setClearColor(COLOR.space, 1);
    this.renderer.setPixelRatio(dprForTier(tier));

    this.scene.background = new THREE.Color(COLOR.space);

    this.camera = new THREE.PerspectiveCamera(HANGAR.fov, 1, 0.1, 160);

    this.turntable.position.y = HANGAR.hoverY;
    this.turntable.rotation.x = HANGAR.tilt;
    this.scene.add(this.turntable);

    this.buildBay();
    this.buildLights();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.resize();
  }

  /** Deck, grid, pad lights, gantries and the rear bulkhead. */
  private buildBay(): void {
    const deckY = -1.6;

    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(HANGAR.deckSize, HANGAR.deckSize),
      new THREE.MeshLambertMaterial({ color: COLOR.panel, flatShading: true }),
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = deckY;
    this.keep(deck);
    this.scene.add(deck);

    // One draw call for the whole floor, and the only lines in the scene.
    const grid = new THREE.GridHelper(
      HANGAR.deckSize,
      HANGAR.gridDivisions,
      COLOR.cyan,
      COLOR.accent,
    );
    grid.position.y = deckY + 0.01;
    (grid.material as THREE.Material).opacity = 0.22;
    (grid.material as THREE.Material).transparent = true;
    this.disposables.push(grid.geometry, grid.material as THREE.Material);
    this.scene.add(grid);

    // Pad lights let into the deck, in a ring under the hull. One instanced
    // mesh rather than ten meshes: the count is small, the saving is not, and
    // it is the pattern the rest of the scene code uses.
    const pads = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(HANGAR.padSize, HANGAR.padSize),
      new THREE.MeshBasicMaterial({ color: COLOR.cyan }),
      HANGAR.padCount,
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2, 0, 0),
    );
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < HANGAR.padCount; i += 1) {
      const angle = (i / HANGAR.padCount) * Math.PI * 2;
      matrix.compose(
        new THREE.Vector3(
          Math.cos(angle) * HANGAR.padRadius,
          deckY + 0.02,
          Math.sin(angle) * HANGAR.padRadius,
        ),
        quaternion,
        scale,
      );
      pads.setMatrixAt(i, matrix);
    }
    pads.instanceMatrix.needsUpdate = true;
    this.keep(pads);
    this.scene.add(pads);

    // Gantry pylons either side, each with a lit strip up its inner face.
    const pylonGeometry = new THREE.BoxGeometry(
      HANGAR.gantryDepth,
      HANGAR.gantryHeight,
      HANGAR.gantryDepth * 3,
    );
    const pylonMaterial = new THREE.MeshLambertMaterial({
      color: COLOR.panel,
      flatShading: true,
    });
    const stripGeometry = new THREE.PlaneGeometry(
      HANGAR.gantryDepth * 2.4,
      HANGAR.gantryHeight * 0.82,
    );
    const stripMaterial = new THREE.MeshBasicMaterial({ color: COLOR.cyan });
    this.disposables.push(
      pylonGeometry,
      pylonMaterial,
      stripGeometry,
      stripMaterial,
    );

    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(pylonGeometry, pylonMaterial);
      pylon.position.set(side * HANGAR.gantryX, deckY + HANGAR.gantryHeight / 2, -1.2);
      this.scene.add(pylon);

      const strip = new THREE.Mesh(stripGeometry, stripMaterial);
      strip.position.set(
        side * (HANGAR.gantryX - HANGAR.gantryDepth * 0.55),
        deckY + HANGAR.gantryHeight / 2,
        -1.2,
      );
      strip.rotation.y = side * -Math.PI / 2;
      this.scene.add(strip);
    }

    // Low enough that the bay still opens onto space above it, which is what
    // keeps this from reading as a room.
    const bulkhead = new THREE.Mesh(
      new THREE.PlaneGeometry(HANGAR.deckSize, HANGAR.bulkheadHeight),
      new THREE.MeshLambertMaterial({ color: COLOR.panel, flatShading: true }),
    );
    bulkhead.position.set(
      0,
      deckY + HANGAR.bulkheadHeight / 2,
      HANGAR.bulkheadZ,
    );
    this.keep(bulkhead);
    this.scene.add(bulkhead);

    // A lit rail along its top edge: the one horizon in the bay, and what
    // stops the bulkhead reading as an empty dark band.
    const lintel = new THREE.Mesh(
      new THREE.PlaneGeometry(HANGAR.deckSize, HANGAR.lintelHeight),
      new THREE.MeshBasicMaterial({ color: COLOR.cyan }),
    );
    lintel.position.set(0, deckY + HANGAR.bulkheadHeight, HANGAR.bulkheadZ + 0.02);
    this.keep(lintel);
    this.scene.add(lintel);
  }

  private buildLights(): void {
    const key = new THREE.DirectionalLight(COLOR.white, HANGAR.keyIntensity);
    key.position.set(-5, 8, 7);
    this.scene.add(key);

    // Rim from behind, in the cabinet cyan, so the silhouette separates from
    // the bulkhead without a second pass or a shadow.
    const rim = new THREE.DirectionalLight(COLOR.cyan, HANGAR.rimIntensity);
    rim.position.set(4, 2, -8);
    this.scene.add(rim);

    this.scene.add(
      new THREE.HemisphereLight(COLOR.white, COLOR.accent, HANGAR.fillIntensity),
    );
  }

  private keep(mesh: THREE.Mesh | THREE.InstancedMesh): void {
    this.disposables.push(mesh.geometry, mesh.material as THREE.Material);
  }

  /**
   * Swap the hull on the turntable. Resolves either way: a hull that fails to
   * load leaves the bay empty rather than the page broken.
   */
  async setShip(spec: ShipSpec): Promise<void> {
    const token = (this.loadToken += 1);
    const loaded = await loadLambertModel(
      spec.modelUrl,
      spec.modelLength,
      spec.modelYaw,
    );
    // Disposed, or the player has already flicked on to another hull.
    if (this.disposed || token !== this.loadToken) {
      loaded?.disposables.forEach((item) => item.dispose());
      return;
    }

    this.clearHull();
    if (!loaded) return;
    this.hull = loaded.group;
    this.hullDisposables = loaded.disposables;
    this.turntable.add(loaded.group);

    // Measure what actually arrived, then frame it.
    const sphere = new THREE.Box3()
      .setFromObject(loaded.group)
      .getBoundingSphere(new THREE.Sphere());
    this.hullRadius = Math.max(sphere.radius, 0.5);
    this.frame();
  }

  private clearHull(): void {
    if (this.hull) this.turntable.remove(this.hull);
    this.hull = null;
    this.hullDisposables.forEach((item) => item.dispose());
    this.hullDisposables = [];
  }

  start(): void {
    if (this.frameHandle !== null || this.disposed) return;
    this.clock.getDelta();
    this.frameHandle = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (this.frameHandle === null) return;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private loop = (): void => {
    this.frameHandle = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), PERF.maxDelta);
    this.elapsed += dt;

    // One full turn every `revolveSeconds`. Halved for a player who asked for
    // reduced motion, since the turn IS the content here and stopping it dead
    // would leave them looking at a still.
    const rate = this.reducedMotion ? 0.5 : 1;
    this.turntable.rotation.y =
      ((this.elapsed * rate) / HANGAR.revolveSeconds) * Math.PI * 2;

    this.turntable.position.y = this.reducedMotion
      ? HANGAR.hoverY
      : HANGAR.hoverY +
        Math.sin(this.elapsed * HANGAR.bobRate) * HANGAR.bobAmplitude;

    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.frame();
  }

  /**
   * Pull the camera back far enough to hold the hull's bounding sphere.
   *
   * The FOV is vertical, so on a tall narrow bay the horizontal one is the
   * binding constraint and framing on the vertical alone would hang the
   * wingtips off both sides of the screen. Fit against the smaller of the
   * two and both a phone in portrait and a desktop window frame the hull.
   */
  private frame(): void {
    const vertical = (this.camera.fov * Math.PI) / 180;
    const horizontal =
      2 * Math.atan(Math.tan(vertical / 2) * Math.max(this.camera.aspect, 0.01));
    const tightest = Math.min(vertical, horizontal);
    const distance =
      (this.hullRadius / Math.sin(tightest / 2)) * HANGAR.framePadding;

    this.camera.position.set(
      0,
      HANGAR.hoverY + distance * HANGAR.cameraLift,
      distance,
    );
    // Aim at the hull, not at the deck, so it sits centred however far back
    // the framing had to pull.
    this.camera.lookAt(0, HANGAR.hoverY + HANGAR.lookY, 0);
    this.camera.updateProjectionMatrix();
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) this.stop();
    else if (!this.disposed) this.start();
  };

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    this.clearHull();
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.scene.clear();

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
