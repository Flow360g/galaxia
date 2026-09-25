import * as THREE from "three";
import { Backdrop } from "@/lib/game/Backdrop";
import { glowTexture, releaseGlow } from "@/lib/game/glow";
import { loadLambertModel } from "@/lib/game/gltf";
import { dprForTier, detectTier, prefersReducedMotion } from "@/lib/game/quality";
import { COLOR, EARTH, ORBIT, PERF, SHIPS, STATION } from "@/lib/game/Tuning";

/**
 * MOCK: the ending, where the reinforcements go in.
 *
 * A prototype surface, not part of the run, in the spirit of the satellite
 * mock. It starts on the frame the station screen already shows behind the
 * tally, pulls the camera back until Earth is a planet in a window, and sends
 * the fleet past the lens and down onto the two landing sites the player
 * named. The number of ships is the result: both sites named sends the
 * armada, one sends a wave, none sends nobody.
 *
 * Built to port straight into `Orbit.ts` if it is kept: the fleet is its own
 * class that only needs a scene, and the pull is two vectors and a curve.
 * Every figure lives in `ENDING` below for now and moves to `Tuning.ts` then.
 */

export const ENDING = {
  /** Ships in the air at once, by landing sites named. */
  fleet: [0, 36, 110] as const,
  /** Seconds from the scene opening to the pull starting, and how long it takes. */
  holdSeconds: 0.7,
  pullSeconds: 4.2,
  /** How far back along its own line the camera ends up, and how much it climbs. */
  pullScale: 1.5,
  pullRise: 3,
  /**
   * Where the camera looks once the pull has landed: above Earth's centre, so
   * the planet sits in the lower half of a portrait frame, under the banner.
   */
  endLook: [1.2, -4.6, -2] as [number, number, number],
  /** A ship's length in orbit units. Earth is 10 across; scale is fantasy. */
  shipLength: 1.0,
  /** Seconds a ship takes from spawn to touchdown, and the spread either side. */
  flightSeconds: 6.4,
  flightJitter: 1.6,
  /** Seconds between launches at the start, so the fleet arrives as a stream. */
  launchEvery: 0.045,
  /** Share of each hull in the fleet: mostly standard issue. */
  hullMix: { cinder: 0.7, flamingo: 0.2, seraph: 0.1 } as Record<string, number>,
  /** Engine glow and trail, in the game's own plasma colours. */
  glowSize: 1.8,
  trailLength: 5,
  /** Landing site beacons: yellow, the win colour. */
  beaconSize: 2.2,
  beaconPulse: 2.4,
  /** How far apart the two sites sit on Earth's face, as a share of its radius. */
  siteSpread: 0.42,
  /** The first few ships launch from beside the lens so they tear past it. */
  heroShips: 8,
  /** Seconds into the pull the lead ships launch, one after another. */
  heroFrom: 1.1,
  heroEvery: 0.28,
} as const;

const EASE = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const scratch = new THREE.Object3D();
const pos = new THREE.Vector3();
const ahead = new THREE.Vector3();
const dir = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

interface Flight {
  hull: number;
  slot: number;
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  site: number;
  /** Seconds until launch; negative once airborne. */
  wait: number;
  age: number;
  duration: number;
  scale: number;
  /** A lead ship: launched from beside the lens, so it tears past it. */
  hero: boolean;
  /** Its route is planned at launch, from wherever the lens is then. */
  planned: boolean;
}

/** One hull type as instanced parts: one InstancedMesh per mesh in the model. */
interface Hull {
  parts: THREE.InstancedMesh[];
  count: number;
}

/**
 * The reinforcements. Each hull is one InstancedMesh per part of its model,
 * so the whole fleet is a handful of draw calls; the trails are one line set
 * and the engine glows one point cloud.
 */
class Fleet {
  readonly group = new THREE.Group();
  private hulls: Hull[] = [];
  private flights: Flight[] = [];
  private readonly trail: THREE.LineSegments;
  private readonly trailPositions: Float32Array;
  private readonly glow: THREE.Points;
  private readonly glowPositions: Float32Array;
  private readonly beacons: THREE.Sprite[] = [];
  private readonly beaconFlash: number[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];
  private disposed = false;

  constructor(
    private readonly size: number,
    private readonly sites: THREE.Vector3[],
    private readonly launchFrom: () => THREE.Vector3,
    private readonly lens: () => THREE.Vector3,
  ) {
    const n = Math.max(size, 1);

    this.trailPositions = new Float32Array(n * 6);
    const trailColours = new Float32Array(n * 6);
    const hot = new THREE.Color(COLOR.plasma);
    const cold = new THREE.Color(COLOR.space);
    for (let i = 0; i < n; i += 1) {
      hot.toArray(trailColours, i * 6);
      cold.toArray(trailColours, i * 6 + 3);
    }
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    trailGeometry.setAttribute("color", new THREE.BufferAttribute(trailColours, 3));
    const trailMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.trail = new THREE.LineSegments(trailGeometry, trailMaterial);
    this.trail.frustumCulled = false;
    this.disposables.push(trailGeometry, trailMaterial);
    this.group.add(this.trail);

    this.glowPositions = new Float32Array(n * 3);
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute("position", new THREE.BufferAttribute(this.glowPositions, 3));
    const glowMaterial = new THREE.PointsMaterial({
      map: glowTexture(),
      color: COLOR.plasma,
      size: ENDING.glowSize,
      sizeAttenuation: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glow = new THREE.Points(glowGeometry, glowMaterial);
    this.glow.frustumCulled = false;
    this.disposables.push(glowGeometry, glowMaterial, { dispose: releaseGlow });
    this.group.add(this.glow);

    for (const site of sites) {
      const material = new THREE.SpriteMaterial({
        map: glowTexture(),
        color: COLOR.yellow,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.disposables.push(material, { dispose: releaseGlow });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(site);
      sprite.scale.setScalar(ENDING.beaconSize);
      this.beacons.push(sprite);
      this.beaconFlash.push(0);
      this.group.add(sprite);
    }
  }

  async load(): Promise<void> {
    if (this.size === 0) return;
    const mix = SHIPS.map((ship) => ENDING.hullMix[ship.id] ?? 0);
    const total = mix.reduce((a, b) => a + b, 0) || 1;
    const counts = mix.map((share) => Math.round((share / total) * this.size));
    counts[0] = (counts[0] ?? 0) + this.size - counts.reduce((a, b) => a + b, 0);

    const models = await Promise.all(
      SHIPS.map((ship) =>
        loadLambertModel(ship.modelUrl, ENDING.shipLength, ship.modelYaw, ship.modelTrim),
      ),
    );
    if (this.disposed) {
      models.forEach((model) => model?.disposables.forEach((item) => item.dispose()));
      return;
    }

    models.forEach((model, hullIndex) => {
      const count = counts[hullIndex] ?? 0;
      if (!model || count === 0) {
        this.hulls.push({ parts: [], count: 0 });
        return;
      }
      this.disposables.push(...model.disposables);
      model.group.updateMatrixWorld(true);
      const parts: THREE.InstancedMesh[] = [];
      model.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = (object.geometry as THREE.BufferGeometry).clone();
        geometry.applyMatrix4(object.matrixWorld);
        this.disposables.push(geometry);
        const mesh = new THREE.InstancedMesh(geometry, object.material, count);
        mesh.frustumCulled = false;
        for (let i = 0; i < count; i += 1) mesh.setMatrixAt(i, HIDDEN);
        parts.push(mesh);
        this.group.add(mesh);
      });
      this.hulls.push({ parts, count });
    });

    // Deal the slots out in launch order, interleaving the hulls so the
    // colours mix through the stream rather than arriving in blocks.
    const slots: Array<{ hull: number; slot: number }> = [];
    const used = this.hulls.map(() => 0);
    for (let i = 0; i < this.size; i += 1) {
      let best = -1;
      let lowest = Infinity;
      this.hulls.forEach((hull, h) => {
        if (used[h]! >= hull.count) return;
        const progress = used[h]! / hull.count;
        if (progress < lowest) {
          lowest = progress;
          best = h;
        }
      });
      if (best < 0) break;
      slots.push({ hull: best, slot: used[best]! });
      used[best]! += 1;
    }

    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    this.flights = slots.map(({ hull, slot }, i) => {
      const flight: Flight = {
        hull,
        slot,
        start: new THREE.Vector3(),
        control: new THREE.Vector3(),
        end: new THREE.Vector3(),
        site: 0,
        wait:
          i < ENDING.heroShips
            ? ENDING.heroFrom + i * ENDING.heroEvery
            : ENDING.heroFrom + i * ENDING.launchEvery + rand() * 0.2,
        hero: i < ENDING.heroShips,
        age: 0,
        duration: 0,
        scale: 1,
        planned: false,
      };
      return flight;
    });
    this.random = rand;
  }

  private random: () => number = Math.random;

  /** A fresh route: from behind the lens, arcing down onto a landing site. */
  private plan(flight: Flight, rand: () => number): void {
    const hero = flight.hero;
    flight.planned = true;
    const origin = this.launchFrom();
    const lens = this.lens();
    if (hero) {
      // Just beside and behind the lens as it is now, alternating sides, so
      // the lead ships tear past it and shrink away towards Earth.
      const side = rand() < 0.5 ? -1 : 1;
      flight.start.set(
        lens.x + side * (1.5 + rand() * 3),
        lens.y - 1.5 + rand() * 3,
        lens.z + 3 + rand() * 4,
      );
    } else {
      flight.start.set(
        origin.x + (rand() - 0.5) * 80,
        origin.y + (rand() - 0.55) * 50,
        origin.z + 10 + rand() * 50,
      );
    }
    flight.site = this.sites.length > 1 ? Math.floor(rand() * this.sites.length) : 0;
    const site = this.sites[flight.site]!;
    flight.end.set(
      site.x + (rand() - 0.5) * 0.6,
      site.y + (rand() - 0.5) * 0.6,
      site.z + (rand() - 0.5) * 0.6,
    );
    flight.control
      .copy(flight.start)
      .lerp(flight.end, 0.55)
      .add(pos.set((rand() - 0.5) * 12, 6 + rand() * 8, (rand() - 0.5) * 6));
    flight.duration = ENDING.flightSeconds + (rand() - 0.5) * 2 * ENDING.flightJitter;
    flight.duration *= hero ? 0.75 : 1;
    flight.scale = hero ? 1.3 : 0.8 + rand() * 0.6;
    flight.age = 0;
  }

  private at(flight: Flight, u: number, out: THREE.Vector3): THREE.Vector3 {
    const a = 1 - u;
    return out
      .copy(flight.start)
      .multiplyScalar(a * a)
      .addScaledVector(flight.control, 2 * a * u)
      .addScaledVector(flight.end, u * u);
  }

  update(dt: number, elapsed: number): void {
    for (let i = 0; i < this.flights.length; i += 1) {
      const flight = this.flights[i]!;
      const hull = this.hulls[flight.hull]!;
      const t6 = i * 6;
      const t3 = i * 3;

      if (flight.wait > 0) {
        flight.wait -= dt;
        this.hide(hull, flight.slot, t6, t3);
        continue;
      }
      if (!flight.planned) this.plan(flight, this.random);
      flight.age += dt;
      const u = Math.min(flight.age / flight.duration, 1);
      // Ease in hard: the ship launches slow and dives onto the site.
      const eased = u * u * (3 - 2 * u) * 0.35 + u * 0.65;

      this.at(flight, eased, pos);
      this.at(flight, Math.min(eased + 0.01, 1), ahead);
      dir.subVectors(ahead, pos);
      if (dir.lengthSq() < 1e-8) dir.subVectors(flight.end, flight.start);
      dir.normalize();

      // Shrinks to nothing over the last stretch: it has landed.
      const land = u > 0.9 ? 1 - (u - 0.9) / 0.1 : 1;
      scratch.position.copy(pos);
      scratch.lookAt(ahead.copy(pos).sub(dir));
      scratch.scale.setScalar(flight.scale * land);
      scratch.updateMatrix();
      for (const part of hull.parts) part.setMatrixAt(flight.slot, scratch.matrix);

      const tail = ENDING.shipLength * 0.5 * flight.scale;
      this.glowPositions[t3] = pos.x - dir.x * tail;
      this.glowPositions[t3 + 1] = pos.y - dir.y * tail;
      this.glowPositions[t3 + 2] = pos.z - dir.z * tail;
      const length = ENDING.trailLength * flight.scale * land;
      this.trailPositions[t6] = this.glowPositions[t3]!;
      this.trailPositions[t6 + 1] = this.glowPositions[t3 + 1]!;
      this.trailPositions[t6 + 2] = this.glowPositions[t3 + 2]!;
      this.trailPositions[t6 + 3] = pos.x - dir.x * length;
      this.trailPositions[t6 + 4] = pos.y - dir.y * length;
      this.trailPositions[t6 + 5] = pos.z - dir.z * length;

      if (u >= 1) {
        this.beaconFlash[flight.site] = 1;
        flight.hero = false;
        this.plan(flight, this.random);
        flight.wait = this.random() * 1.2;
      }
    }

    for (const hull of this.hulls) for (const part of hull.parts) part.instanceMatrix.needsUpdate = true;
    (this.trail.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.glow.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

    this.beacons.forEach((beacon, i) => {
      const flash = this.beaconFlash[i]!;
      this.beaconFlash[i] = Math.max(0, flash - dt * 3);
      const breathe = 1 + Math.sin(elapsed * ENDING.beaconPulse + i) * 0.12;
      beacon.scale.setScalar(ENDING.beaconSize * (breathe + flash * 0.5));
    });
  }

  private hide(hull: Hull, slot: number, t6: number, t3: number): void {
    for (const part of hull.parts) part.setMatrixAt(slot, HIDDEN);
    this.trailPositions.fill(0, t6, t6 + 6);
    this.glowPositions[t3] = 0;
    this.glowPositions[t3 + 1] = -1e5;
    this.glowPositions[t3 + 2] = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
  }
}

/** The mock scene: the station screen's frame, the pull, and the fleet. */
export class EndingScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly backdrop = new Backdrop();
  private readonly earth = new THREE.Group();
  private readonly earthBody = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly aim = new THREE.Group();
  private readonly roll = new THREE.Group();
  private readonly fleet: Fleet | null;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly reducedMotion = prefersReducedMotion();

  private readonly startCam = new THREE.Vector3();
  private readonly endCam = new THREE.Vector3();
  private readonly startLook = new THREE.Vector3().fromArray(ORBIT.lookAt);
  private readonly endLook = new THREE.Vector3().fromArray(ENDING.endLook);
  private readonly look = new THREE.Vector3();

  private frameHandle: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private elapsed = 0;
  private width = 0;
  private height = 0;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    sitesNamed: 0 | 1 | 2,
  ) {
    const tier = detectTier();
    this.canvas = document.createElement("canvas");
    container.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: tier === 0 });
    this.renderer.setClearColor(COLOR.space, 1);
    this.renderer.setPixelRatio(dprForTier(tier));
    this.scene.background = new THREE.Color(COLOR.space);

    this.camera = new THREE.PerspectiveCamera(ORBIT.fov, 1, ORBIT.near, ORBIT.far);
    this.scene.add(this.camera);
    this.camera.add(this.backdrop.mesh);
    this.backdrop.update(0, 0);
    void this.backdrop.load();

    this.earth.position.fromArray(EARTH.position);
    this.earth.rotation.z = EARTH.tilt;
    this.earth.add(this.earthBody);
    this.scene.add(this.earth);
    const radius = EARTH.diameter / 2;
    for (const [halo, side] of [
      [EARTH.haloInner, THREE.BackSide],
      [EARTH.haloOuter, THREE.FrontSide],
    ] as const) {
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
      this.disposables.push(shell.geometry, shell.material);
      this.earth.add(shell);
    }

    this.pivot.position.fromArray(STATION.dockedPosition);
    this.aim.rotation.x = -Math.PI / 2;
    this.pivot.add(this.aim);
    this.aim.add(this.roll);
    this.scene.add(this.pivot);
    this.pivot.lookAt(this.earth.position);

    const sun = new THREE.DirectionalLight(0xfff1d6, ORBIT.sunIntensity);
    sun.position.fromArray(ORBIT.sunPosition);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(COLOR.white, COLOR.accent, ORBIT.fillIntensity));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    const sites = this.siteSpots(sitesNamed);
    const size = ENDING.fleet[sitesNamed];
    this.fleet =
      size > 0
        ? new Fleet(
            this.reducedMotion ? Math.round(size / 3) : size,
            sites,
            () => this.endCam,
            () => this.camera.position,
          )
        : null;
    if (this.fleet) this.scene.add(this.fleet.group);

    void this.loadModels();
  }

  /**
   * The landing sites: on the face of Earth the pulled-back camera sees, one
   * either side of centre. Real latitudes come with integration; for the mock
   * they only have to be on the visible side.
   */
  private siteSpots(named: number): THREE.Vector3[] {
    const centre = this.earth.position;
    const radius = (EARTH.diameter / 2) * 1.02;
    const toCamera = new THREE.Vector3().subVectors(this.endCam, centre).normalize();
    const side = new THREE.Vector3().crossVectors(toCamera, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, toCamera).normalize();
    const spots = [
      [-ENDING.siteSpread, 0.18],
      [ENDING.siteSpread, -0.12],
    ].slice(0, Math.max(named, 0));
    return spots.map(([s, u]) =>
      new THREE.Vector3()
        .copy(toCamera)
        .addScaledVector(side, s!)
        .addScaledVector(up, u!)
        .normalize()
        .multiplyScalar(radius)
        .add(centre),
    );
  }

  private async loadModels(): Promise<void> {
    const [earth, station] = await Promise.all([
      loadLambertModel(EARTH.modelUrl, EARTH.diameter),
      loadLambertModel(STATION.modelUrl, STATION.dockedLength),
      this.fleet?.load(),
    ]);
    if (this.disposed) {
      earth?.disposables.forEach((item) => item.dispose());
      station?.disposables.forEach((item) => item.dispose());
      return;
    }
    if (earth) {
      this.earthBody.add(earth.group);
      this.disposables.push(...earth.disposables);
    }
    if (station) {
      station.group.position.z = STATION.axisOffset * STATION.dockedLength;
      this.roll.add(station.group);
      this.disposables.push(...station.disposables);
    }
  }

  start(): void {
    if (this.frameHandle !== null || this.disposed) return;
    this.clock.getDelta();
    this.frameHandle = requestAnimationFrame(this.loop);
  }

  private loop = (): void => {
    this.frameHandle = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), PERF.maxDelta);
    this.elapsed += dt;

    this.earthBody.rotation.y += EARTH.spin * dt;
    this.roll.rotation.y += STATION.dockedSpin * dt;

    const raw = this.reducedMotion
      ? 1
      : Math.min(Math.max((this.elapsed - ENDING.holdSeconds) / ENDING.pullSeconds, 0), 1);
    const t = EASE(raw);
    this.camera.position.lerpVectors(this.startCam, this.endCam, t);
    this.look.lerpVectors(this.startLook, this.endLook, t);
    if (!this.reducedMotion) {
      const drift = this.elapsed * ORBIT.driftRate;
      this.camera.position.x += Math.sin(drift) * ORBIT.driftAmplitude;
      this.camera.position.y += Math.cos(drift * 0.7) * ORBIT.driftAmplitude * 0.6;
    }
    this.camera.lookAt(this.look);

    this.fleet?.update(dt, this.elapsed);
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

    // The station screen's own portrait framing, then the pull from there.
    const vertical = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    const floor = THREE.MathUtils.degToRad(ORBIT.minHorizontalFov);
    const pull = horizontal < floor ? Math.tan(floor / 2) / Math.tan(horizontal / 2) : 1;
    this.startCam
      .fromArray(ORBIT.cameraPosition)
      .sub(this.startLook)
      .multiplyScalar(pull)
      .add(this.startLook);
    this.endCam
      .copy(this.startCam)
      .sub(this.startLook)
      .multiplyScalar(ENDING.pullScale)
      .add(this.endLook);
    this.endCam.y += ENDING.pullRise;
    this.camera.updateProjectionMatrix();
  }

  /** Where the camera and fleet are, for the mock's debug readout. */
  debugState(): { elapsed: number; drawCalls: number } {
    return { elapsed: this.elapsed, drawCalls: this.renderer.info.render.calls };
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.resizeObserver?.disconnect();
    this.fleet?.dispose();
    this.backdrop.dispose();
    this.disposables.forEach((item) => item.dispose());
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
