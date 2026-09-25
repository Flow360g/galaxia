import * as THREE from "three";
import { Backdrop } from "./Backdrop";
import { Fleet, fleetFor } from "./Fleet";
import { loadLambertModel } from "./gltf";
import { dprForTier, detectTier, prefersReducedMotion } from "./quality";
import { COLOR, EARTH, ENDING, ORBIT, PERF, STATION } from "./Tuning";

/** Cubic in and out: the pull starts gently and settles. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const facing = new THREE.Vector3();

/**
 * The view from the station: WHERE ON EARTH, aboard.
 *
 * Wikiplanet Station in the foreground with its docking module aimed at
 * Earth, Earth big and sun-lit in the lower frame, both turning slowly. A
 * third small imperative shell alongside `Engine` and `ShipBay`, and built
 * to the same rules: owns its canvas, flat Lambert, no shadows, DPR by tier,
 * every number from `Tuning.ts`. There is no run here and no treadmill; a
 * frame is two rotations and a drift.
 *
 * Deliberately not a mode on `Engine`, for the reason the hangar is not: the
 * flight engine flies things, and this is a thing to look at. The engine
 * parks under it and never draws again.
 *
 * It also plays the run's ending (`reinforce`): the camera pulls back until
 * Earth fills the frame under the banner, Earth turns its most-land face to
 * the camera, and the fleet the run earned flies in (`Fleet.ts`).
 */
export class Orbit {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly backdrop = new Backdrop();

  /** Earth: the group is where it sits and how it leans; the body inside spins. */
  private readonly earth = new THREE.Group();
  private readonly earthBody = new THREE.Group();
  /**
   * The station, three groups deep. `pivot` is where it hangs and is aimed
   * with `lookAt`, which points a group's +Z at the target. `aim` turns the
   * model's -Y, the docking module, into that +Z. `roll` turns about the
   * docking axis, so the station reads as alive while it keeps pointing
   * exactly where it should.
   */
  private readonly pivot = new THREE.Group();
  private readonly aim = new THREE.Group();
  private readonly roll = new THREE.Group();
  private earthStandIn: THREE.Object3D | null = null;
  private stationStandIn: THREE.Object3D | null = null;

  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly reducedMotion = prefersReducedMotion();
  private readonly cameraBase = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3().fromArray(ORBIT.lookAt);

  /** The ending, once `reinforce` has been called; null until then. */
  private fleet: Fleet | null = null;
  private endingAt = -1;
  private readonly endCam = new THREE.Vector3();
  private readonly endLook = new THREE.Vector3().fromArray(ENDING.endLook);
  private readonly look = new THREE.Vector3();
  private yawFrom = 0;
  private yawTo = 0;

  private frameHandle: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private elapsed = 0;
  private width = 0;
  private height = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement) {
    const tier = detectTier();

    this.canvas = document.createElement("canvas");
    this.canvas.dataset.galaxiaOrbit = "true";
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

    this.camera = new THREE.PerspectiveCamera(ORBIT.fov, 1, ORBIT.near, ORBIT.far);
    this.scene.add(this.camera);
    // The same painted sky as the flight, parented to the camera the same way.
    this.camera.add(this.backdrop.mesh);
    this.backdrop.update(0, 0);
    void this.backdrop.load();

    this.buildEarth();
    this.buildStation();
    this.buildLights();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.resize();

    void this.loadModels();
  }

  /** Earth low in the frame, leaning, with two additive shells for an atmosphere. */
  private buildEarth(): void {
    this.earth.position.fromArray(EARTH.position);
    this.earth.rotation.z = EARTH.tilt;
    this.earth.add(this.earthBody);
    this.scene.add(this.earth);

    const radius = EARTH.diameter / 2;

    // A blue ball until the model lands, so the frame is never empty.
    const standIn = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 24),
      new THREE.MeshLambertMaterial({ color: 0x1f6fd6, flatShading: true }),
    );
    this.keep(standIn);
    this.earthBody.add(standIn);
    this.earthStandIn = standIn;

    // No shader: an inside-out shell just over the surface reads as the
    // atmosphere from the lit side, and a fainter outside one gives the limb
    // its glow against space. Both additive, neither writing depth.
    const shells: Array<[{ scale: number; opacity: number }, THREE.Side]> = [
      [EARTH.haloInner, THREE.BackSide],
      [EARTH.haloOuter, THREE.FrontSide],
    ];
    for (const [halo, side] of shells) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(radius * halo.scale, 32, 24),
        new THREE.MeshBasicMaterial({
          color: COLOR.shield,
          transparent: true,
          opacity: halo.opacity,
          side,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.keep(shell);
      this.earth.add(shell);
    }
  }

  /** The station on its pivot, aimed at Earth, with a stand-in until the model lands. */
  private buildStation(): void {
    this.pivot.position.fromArray(STATION.dockedPosition);
    this.aim.rotation.x = -Math.PI / 2;
    this.pivot.add(this.aim);
    this.aim.add(this.roll);
    this.scene.add(this.pivot);
    this.pivot.lookAt(this.earth.position);

    // The station's silhouette: a tube on the docking axis, wings one side,
    // a dish the other. Grey and flat, gone when the model arrives.
    const length = STATION.dockedLength;
    const material = new THREE.MeshLambertMaterial({ color: 0xb8bec9, flatShading: true });
    const standIn = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.BoxGeometry(length * 0.14, length * 0.6, length * 0.14), material);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(length * 0.03, length * 0.3, length * 0.45), material);
    wing.position.z = length * 0.27;
    const dish = new THREE.Mesh(new THREE.BoxGeometry(length * 0.1, length * 0.1, length * 0.12), material);
    dish.position.z = -length * 0.22;
    standIn.add(tube, wing, dish);
    this.disposables.push(tube.geometry, wing.geometry, dish.geometry, material);
    this.roll.add(standIn);
    this.stationStandIn = standIn;
  }

  private buildLights(): void {
    // One sun, warm and off to the side, so Earth has a terminator and the
    // station a lit face and a dark one. The fill keeps the dark side legible.
    const sun = new THREE.DirectionalLight(0xfff1d6, ORBIT.sunIntensity);
    sun.position.fromArray(ORBIT.sunPosition);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(COLOR.white, COLOR.accent, ORBIT.fillIntensity));
  }

  private keep(mesh: THREE.Mesh): void {
    this.disposables.push(mesh.geometry, mesh.material as THREE.Material);
  }

  /**
   * Both models, together. Either failing leaves its stand-in in place; the
   * scene is never a hole.
   */
  private async loadModels(): Promise<void> {
    const [earth, station] = await Promise.all([
      loadLambertModel(EARTH.modelUrl, EARTH.diameter),
      loadLambertModel(STATION.modelUrl, STATION.dockedLength),
    ]);
    if (this.disposed) {
      earth?.disposables.forEach((item) => item.dispose());
      station?.disposables.forEach((item) => item.dispose());
      return;
    }
    if (earth) {
      if (this.earthStandIn) this.earthBody.remove(this.earthStandIn);
      this.earthBody.add(earth.group);
      this.disposables.push(...earth.disposables);
    }
    if (station) {
      // The loader centres the model on its bounds, which the solar wings
      // drag off the tube. Slide it back so the docking axis is the roll axis.
      station.group.position.z = STATION.axisOffset * STATION.dockedLength;
      if (this.stationStandIn) this.roll.remove(this.stationStandIn);
      this.roll.add(station.group);
      this.disposables.push(...station.disposables);
    }
  }

  /**
   * The ending: pull back, turn Earth to land, send the fleet. Ours for a run
   * that named sites, theirs for one that named none. Safe to call once;
   * later calls are ignored.
   */
  reinforce(sitesNamed: number): void {
    if (this.endingAt >= 0 || this.disposed) return;
    this.endingAt = this.elapsed;

    // The short way round to the land face, from wherever the spin has left
    // it, so the turn during the pull is never more than half a revolution.
    this.yawFrom = this.earthBody.rotation.y;
    const turn = ENDING.earthYaw - this.yawFrom;
    const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.yawTo = this.yawFrom + wrapped;

    const { style, size } = fleetFor(sitesNamed);
    if (size === 0) return;
    this.fleet = new Fleet(
      style,
      this.reducedMotion ? Math.max(1, Math.round(size / 3)) : size,
      {
        centre: this.earth.position,
        radius: EARTH.diameter / 2,
        facing: () => facing.subVectors(this.endCam, this.earth.position).normalize(),
      },
      () => this.endCam,
      () => this.camera.position,
    );
    this.scene.add(this.fleet.group);
    void this.fleet.load();
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

    // Halved for reduced motion rather than stopped: the turn is what says
    // the scene is live, and a still would read as a hang.
    const rate = this.reducedMotion ? 0.5 : 1;
    this.earthBody.rotation.y += EARTH.spin * rate * dt;
    this.roll.rotation.y += STATION.dockedSpin * rate * dt;

    // The ending's pull: 0 on the station screen's own frame, 1 pulled back.
    // Reduced motion cuts straight to the end of it.
    let pull = 0;
    if (this.endingAt >= 0) {
      const since = this.elapsed - this.endingAt;
      const raw = this.reducedMotion
        ? 1
        : Math.min(Math.max((since - ENDING.holdSeconds) / ENDING.pullSeconds, 0), 1);
      pull = easeInOut(raw);
      // Turned by the pull and spun on top, so the spin never stops.
      this.yawFrom += EARTH.spin * rate * dt;
      this.yawTo += EARTH.spin * rate * dt;
      this.earthBody.rotation.y = this.yawFrom + (this.yawTo - this.yawFrom) * pull;
      this.fleet?.update(dt);
    }

    if (!this.reducedMotion || pull > 0) {
      const t = this.elapsed * ORBIT.driftRate;
      const drift = this.reducedMotion ? 0 : 1;
      this.camera.position.lerpVectors(this.cameraBase, this.endCam, pull);
      this.camera.position.x += Math.sin(t) * ORBIT.driftAmplitude * drift;
      this.camera.position.y += Math.cos(t * 0.7) * ORBIT.driftAmplitude * 0.6 * drift;
      this.look.lerpVectors(this.lookTarget, this.endLook, pull);
      this.camera.lookAt(this.look);
    }

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
    this.backdrop.setAspect(this.camera.aspect);
    this.frame();
  }

  /**
   * The composition is authored for a wide frame. In portrait the horizontal
   * field narrows and the station would hang off the side, so the camera
   * backs away along its own line until the frame is at least
   * `ORBIT.minHorizontalFov` wide.
   */
  private frame(): void {
    const vertical = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    const floor = THREE.MathUtils.degToRad(ORBIT.minHorizontalFov);
    const pull = horizontal < floor ? Math.tan(floor / 2) / Math.tan(horizontal / 2) : 1;

    this.cameraBase
      .fromArray(ORBIT.cameraPosition)
      .sub(this.lookTarget)
      .multiplyScalar(pull)
      .add(this.lookTarget);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateProjectionMatrix();

    // Where the ending pulls back to: further out along the same line, and up.
    this.endCam
      .copy(this.cameraBase)
      .sub(this.lookTarget)
      .multiplyScalar(ENDING.pullScale)
      .add(this.endLook);
    this.endCam.y += ENDING.pullRise;
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

    this.backdrop.dispose();
    this.fleet?.dispose();
    this.fleet = null;
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose?.();
    });
    this.scene.clear();

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
