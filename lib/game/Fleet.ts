import * as THREE from "three";
import { glowTexture, releaseGlow } from "./glow";
import { loadLambertModel } from "./gltf";
import { ALIEN, COLOR, ENDING, SHIPS } from "./Tuning";

/**
 * The fleet at the end of a run: ours going in when the landing sites were
 * named, theirs when they were not. Flown by `Orbit.reinforce`.
 *
 * A fleet is one style (what it is made of and how it flies) and one routine:
 * every ship launches from behind the lens, arcs down towards a landing site
 * on Earth's visible face and dwindles away before it reaches the ground, and
 * is sent round again from the back. The first few launch right beside the
 * lens, so they tear past it as the camera pulls back.
 *
 * Built for the draw budget: each hull is one InstancedMesh per part of its
 * model, the trails are one line set, the engines one point cloud, the running
 * lights one more, and the beams two instanced cylinders with one cloud for
 * where they land. The armada is about a dozen draw calls.
 */

/** What a fleet is made of and how it flies. */
export interface FleetStyle {
  hulls: Array<{
    url: string;
    length: number;
    yaw: number;
    trim: { yaw: number; roll: number };
    share: number;
  }>;
  /** Seconds from launch to vanishing, and the share of it after which it dwindles. */
  seconds: number;
  fadeFrom: number;
  /** How far towards Earth a relaunched ship starts, as a share of the way. */
  closeIn: number;
  /** Engine glow and trail. Ours burn plasma; theirs do not show one. */
  engine: { color: number; glowSize: number; trailLength: number } | null;
  /** Paint every hull this colour, dropping the model's own. */
  paint: number | null;
  /** Running lights round the rim, blinking. */
  lights: { count: number; color: number; size: number; rim: number; blinkHz: number } | null;
  /** One in `every` fires beams at the surface on the way down. */
  guns: {
    every: number;
    on: number;
    off: number;
    within: number;
    radius: number;
    color: number;
    hitSize: number;
  } | null;
}

/** Ours: the three hulls from the bay, mostly standard issue. */
const OURS: FleetStyle = {
  hulls: SHIPS.map((ship) => ({
    url: ship.modelUrl,
    length: ENDING.ours.length,
    yaw: ship.modelYaw,
    trim: ship.modelTrim,
    share: ENDING.ours.mix[ship.id] ?? 0,
  })),
  seconds: ENDING.ours.seconds,
  fadeFrom: ENDING.ours.fadeFrom,
  closeIn: 0,
  engine: {
    color: COLOR.plasma,
    glowSize: ENDING.ours.glowSize,
    trailLength: ENDING.ours.trailLength,
  },
  paint: null,
  lights: null,
  guns: null,
};

/** Theirs: the ALIEN CONTACT scout, in the dark, with a ring of violet lights. */
const THEIRS: FleetStyle = {
  hulls: [
    { url: ALIEN.modelUrl, length: ENDING.invaders.length, yaw: Math.PI, trim: { yaw: 0, roll: 0 }, share: 1 },
  ],
  seconds: ENDING.invaders.seconds,
  fadeFrom: ENDING.invaders.fadeFrom,
  closeIn: ENDING.invaders.closeIn,
  engine: null,
  paint: ENDING.invaders.hull,
  lights: {
    count: ENDING.invaders.lights,
    color: COLOR.contact,
    size: ENDING.invaders.lightSize,
    rim: ENDING.invaders.lightRim,
    blinkHz: ENDING.invaders.blinkHz,
  },
  guns: {
    every: ENDING.invaders.shooterEvery,
    on: ENDING.invaders.shotSeconds,
    off: ENDING.invaders.shotGap,
    within: ENDING.invaders.shootWithin,
    radius: ENDING.invaders.beamRadius,
    color: ENDING.invaders.beamColor,
    hitSize: ENDING.invaders.hitSize,
  },
};

/** The fleet a run earned, by how many landing sites it named. */
export function fleetFor(sitesNamed: number): { style: FleetStyle; size: number } {
  if (sitesNamed <= 0) return { style: THEIRS, size: ENDING.invaders.count };
  const size = ENDING.fleet[Math.min(sitesNamed, ENDING.fleet.length - 1)] ?? 0;
  return { style: OURS, size };
}

const scratch = new THREE.Object3D();
const pos = new THREE.Vector3();
const ahead = new THREE.Vector3();
const dir = new THREE.Vector3();
const hit = new THREE.Vector3();
const light = new THREE.Vector3();
const side = new THREE.Vector3();
const up = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

interface Flight {
  hull: number;
  slot: number;
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  /** Where on the surface it fires, for a fleet that shoots. */
  aim: THREE.Vector3;
  /** Seconds until launch. */
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

/** Earth, as the fleet needs it: where it is, how big, and which side the camera sees. */
export interface Planet {
  centre: THREE.Vector3;
  radius: number;
  /** Unit vector from Earth's centre towards where the camera ends up. */
  facing: () => THREE.Vector3;
}

export class Fleet {
  readonly group = new THREE.Group();

  private hulls: Hull[] = [];
  private flights: Flight[] = [];
  private readonly sites: THREE.Vector3[];
  private readonly engineColour: THREE.Color;
  private readonly lightColour: THREE.Color;
  private readonly beamColour: THREE.Color;
  private elapsed = 0;
  private seed = 7;

  private trailPositions: Float32Array | null = null;
  private trailColours: Float32Array | null = null;
  private trail: THREE.LineSegments | null = null;
  private glowPositions: Float32Array | null = null;
  private glowColours: Float32Array | null = null;
  private glow: THREE.Points | null = null;
  private lightPositions: Float32Array | null = null;
  private lightColours: Float32Array | null = null;
  private lights: THREE.Points | null = null;
  private beamOuter: THREE.InstancedMesh | null = null;
  private beamCore: THREE.InstancedMesh | null = null;
  private hitPositions: Float32Array | null = null;
  private hitColours: Float32Array | null = null;
  private hits: THREE.Points | null = null;

  private readonly disposables: Array<{ dispose(): void }> = [];
  private disposed = false;

  constructor(
    private readonly style: FleetStyle,
    private readonly size: number,
    private readonly planet: Planet,
    private readonly launchFrom: () => THREE.Vector3,
    private readonly lens: () => THREE.Vector3,
  ) {
    this.sites = this.siteSpots();
    this.engineColour = new THREE.Color(style.engine?.color ?? COLOR.white);
    this.lightColour = new THREE.Color(style.lights?.color ?? COLOR.white);
    this.beamColour = new THREE.Color(style.guns?.color ?? COLOR.white);
    const n = Math.max(size, 1);
    if (style.engine) this.buildEngines(n, style.engine.glowSize);
    if (style.lights) this.buildLights(n * style.lights.count, style.lights.size);
    if (style.guns) this.buildGuns(n, style.guns);
  }

  /**
   * The two landing sites: on the face of Earth the pulled-back camera sees,
   * one either side of centre, lifted off the surface to where a route ends.
   */
  private siteSpots(): THREE.Vector3[] {
    const facing = this.planet.facing();
    side.crossVectors(facing, UP).normalize();
    up.crossVectors(side, facing).normalize();
    const radius = this.planet.radius * (1 + ENDING.stopAbove);
    return [
      [-ENDING.siteSpread, 0.18],
      [ENDING.siteSpread, -0.12],
    ].map(([s, u]) =>
      new THREE.Vector3()
        .copy(facing)
        .addScaledVector(side, s!)
        .addScaledVector(up, u!)
        .normalize()
        .multiplyScalar(radius)
        .add(this.planet.centre),
    );
  }

  private points(n: number, size: number, color: number | null): {
    positions: Float32Array;
    colours: Float32Array;
    points: THREE.Points;
  } {
    const positions = new Float32Array(n * 3);
    const colours = new Float32Array(n * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    const material = new THREE.PointsMaterial({
      map: glowTexture(),
      vertexColors: true,
      size,
      sizeAttenuation: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // A flash sits exactly on the surface, and half of it would be inside Earth.
      depthTest: color === null,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.disposables.push(geometry, material, { dispose: releaseGlow });
    this.group.add(points);
    return { positions, colours, points };
  }

  /**
   * Trails and glows carry their colour per vertex, so each fades with its own
   * ship; the far end of a trail is always black, which added is nothing.
   */
  private buildEngines(n: number, glowSize: number): void {
    this.trailPositions = new Float32Array(n * 6);
    this.trailColours = new Float32Array(n * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.trailColours, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.trail = new THREE.LineSegments(geometry, material);
    this.trail.frustumCulled = false;
    this.disposables.push(geometry, material);
    this.group.add(this.trail);

    const glow = this.points(n, glowSize, null);
    this.glowPositions = glow.positions;
    this.glowColours = glow.colours;
    this.glow = glow.points;
  }

  private buildLights(n: number, size: number): void {
    const lights = this.points(n, size, null);
    this.lightPositions = lights.positions;
    this.lightColours = lights.colours;
    this.lights = lights.points;
  }

  /**
   * The beams, the way `Beam.ts` draws one: an open cylinder with a white core
   * inside it, instanced so any number firing at once is two draw calls. Laid
   * along +Z from 0 to 1, so a beam is placed at the gun, pointed at the ground
   * and stretched to reach it. The outer is laid over the scene rather than
   * added to it, so it stays red across green land instead of summing to
   * yellow; the core is added, which is what makes it read as light.
   */
  private buildGuns(n: number, guns: NonNullable<FleetStyle["guns"]>): void {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, 0.5);
    const make = (color: number, opacity: number, blending: THREE.Blending) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending, depthWrite: false });
    const outer = make(guns.color, 0.85, THREE.NormalBlending);
    const core = make(COLOR.white, 0.6, THREE.AdditiveBlending);
    this.beamOuter = new THREE.InstancedMesh(geometry, outer, n);
    this.beamCore = new THREE.InstancedMesh(geometry, core, n);
    for (const mesh of [this.beamOuter, this.beamCore]) {
      mesh.frustumCulled = false;
      for (let i = 0; i < n; i += 1) mesh.setMatrixAt(i, HIDDEN);
      this.group.add(mesh);
    }
    this.disposables.push(geometry, outer, core);

    const hits = this.points(n, guns.hitSize, guns.color);
    this.hitPositions = hits.positions;
    this.hitColours = hits.colours;
    this.hits = hits.points;
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Loads the hulls and deals out the launch order. Nothing flies until it resolves. */
  async load(): Promise<void> {
    if (this.size === 0) return;
    const shares = this.style.hulls.map((hull) => hull.share);
    const total = shares.reduce((a, b) => a + b, 0) || 1;
    const counts = shares.map((share) => Math.round((share / total) * this.size));
    counts[0] = (counts[0] ?? 0) + this.size - counts.reduce((a, b) => a + b, 0);

    const models = await Promise.all(
      this.style.hulls.map((hull) => loadLambertModel(hull.url, hull.length, hull.yaw, hull.trim)),
    );
    if (this.disposed) {
      models.forEach((model) => model?.disposables.forEach((item) => item.dispose()));
      return;
    }

    models.forEach((model, index) => {
      const count = counts[index] ?? 0;
      if (!model || count === 0) {
        model?.disposables.forEach((item) => item.dispose());
        this.hulls.push({ parts: [], count: 0 });
        return;
      }
      this.disposables.push(...model.disposables);
      if (this.style.paint !== null) {
        // Dropping the model's own colour, baked or mapped, for one flat paint.
        for (const material of model.materials) {
          material.vertexColors = false;
          material.map = null;
          material.color.setHex(this.style.paint);
          material.needsUpdate = true;
        }
      }
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
      const hero = i < ENDING.heroShips;
      this.flights.push({
        hull: best,
        slot: used[best]!,
        start: new THREE.Vector3(),
        control: new THREE.Vector3(),
        end: new THREE.Vector3(),
        aim: new THREE.Vector3(),
        wait: hero
          ? ENDING.heroFrom + i * ENDING.heroEvery
          : ENDING.heroFrom + i * ENDING.launchEvery + this.random() * 0.2,
        age: 0,
        duration: 0,
        scale: 1,
        hero,
        planned: false,
      });
      used[best]! += 1;
    }
  }

  /** A fresh route: from behind the lens, arcing down onto a landing site. */
  private plan(flight: Flight, relaunch = false): void {
    const rand = () => this.random();
    flight.planned = true;
    const origin = this.launchFrom();
    const lens = this.lens();
    if (flight.hero) {
      // Just beside and behind the lens as it is now, so the lead ships tear
      // past it and shrink away towards Earth.
      const sideways = rand() < 0.5 ? -1 : 1;
      flight.start.set(
        lens.x + sideways * (1.5 + rand() * 3),
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
    if (relaunch && this.style.closeIn > 0) {
      flight.start.lerp(this.planet.centre, this.style.closeIn);
    }
    const site = this.sites[Math.floor(rand() * this.sites.length)] ?? this.sites[0]!;
    flight.end.set(
      site.x + (rand() - 0.5) * 0.6,
      site.y + (rand() - 0.5) * 0.6,
      site.z + (rand() - 0.5) * 0.6,
    );
    flight.control
      .copy(flight.start)
      .lerp(flight.end, 0.55)
      .add(pos.set((rand() - 0.5) * 12, 6 + rand() * 8, (rand() - 0.5) * 6));
    flight.duration = this.style.seconds + (rand() - 0.5) * 2 * ENDING.flightJitter;
    flight.duration *= flight.hero ? 0.75 : 1;
    flight.scale = flight.hero ? 1.3 : 0.8 + rand() * 0.6;
    flight.age = 0;

    // A gun fires at a spot on the face the camera sees, not the ground
    // straight under it: from most of the route that points almost at the
    // lens, and a beam seen end on is a dot.
    if (this.style.guns) {
      const facing = this.planet.facing();
      side.crossVectors(facing, UP).normalize();
      up.crossVectors(side, facing).normalize();
      flight.aim
        .copy(facing)
        .addScaledVector(side, (rand() - 0.5) * 1.3)
        .addScaledVector(up, (rand() - 0.5) * 1.1)
        .normalize()
        .multiplyScalar(this.planet.radius)
        .add(this.planet.centre);
    }
  }

  private at(flight: Flight, u: number, out: THREE.Vector3): THREE.Vector3 {
    const a = 1 - u;
    return out
      .copy(flight.start)
      .multiplyScalar(a * a)
      .addScaledVector(flight.control, 2 * a * u)
      .addScaledVector(flight.end, u * u);
  }

  update(dt: number): void {
    this.elapsed += dt;
    for (let i = 0; i < this.flights.length; i += 1) {
      const flight = this.flights[i]!;
      const hull = this.hulls[flight.hull]!;

      if (flight.wait > 0) {
        flight.wait -= dt;
        this.hide(i, hull, flight.slot);
        continue;
      }
      if (!flight.planned) this.plan(flight);
      flight.age += dt;
      const u = Math.min(flight.age / flight.duration, 1);
      // Launches slow and dives: a little ease on top of a steady run in.
      const eased = u * u * (3 - 2 * u) * 0.35 + u * 0.65;

      this.at(flight, eased, pos);
      this.at(flight, Math.min(eased + 0.01, 1), ahead);
      dir.subVectors(ahead, pos);
      if (dir.lengthSq() < 1e-8) dir.subVectors(flight.end, flight.start);
      dir.normalize();

      // Dwindles away over the back of the route, on top of the shrink the
      // distance already gives it, so it is gone before it reaches the ground.
      const from = this.style.fadeFrom;
      const f = Math.min(Math.max((u - from) / (1 - from), 0), 1);
      const land = 1 - f * f * (3 - 2 * f);

      scratch.position.copy(pos);
      scratch.lookAt(ahead.copy(pos).sub(dir));
      scratch.scale.setScalar(flight.scale * land);
      scratch.updateMatrix();
      for (const part of hull.parts) part.setMatrixAt(flight.slot, scratch.matrix);

      this.engine(i, flight, land);
      this.runningLights(i, flight, land);
      this.shoot(i, flight, land);

      if (u >= 1) {
        flight.hero = false;
        this.plan(flight, true);
        flight.wait = this.random() * 1.2;
      }
    }

    for (const hull of this.hulls) {
      for (const part of hull.parts) part.instanceMatrix.needsUpdate = true;
    }
    for (const object of [this.trail, this.glow, this.lights, this.hits]) {
      if (!object) continue;
      (object.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (object.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.beamOuter && this.beamCore) {
      this.beamOuter.instanceMatrix.needsUpdate = true;
      this.beamCore.instanceMatrix.needsUpdate = true;
    }
  }

  private engine(i: number, flight: Flight, land: number): void {
    const engine = this.style.engine;
    const glow = this.glowPositions;
    const trail = this.trailPositions;
    if (!engine || !glow || !trail || !this.glowColours || !this.trailColours) return;
    const t3 = i * 3;
    const t6 = i * 6;
    const tail = this.style.hulls[0]!.length * 0.5 * flight.scale;
    glow[t3] = pos.x - dir.x * tail;
    glow[t3 + 1] = pos.y - dir.y * tail;
    glow[t3 + 2] = pos.z - dir.z * tail;
    const length = engine.trailLength * flight.scale * land;
    trail[t6] = glow[t3]!;
    trail[t6 + 1] = glow[t3 + 1]!;
    trail[t6 + 2] = glow[t3 + 2]!;
    trail[t6 + 3] = pos.x - dir.x * length;
    trail[t6 + 4] = pos.y - dir.y * length;
    trail[t6 + 5] = pos.z - dir.z * length;
    const { r, g, b } = this.engineColour;
    this.glowColours[t3] = this.trailColours[t6] = r * land;
    this.glowColours[t3 + 1] = this.trailColours[t6 + 1] = g * land;
    this.glowColours[t3 + 2] = this.trailColours[t6 + 2] = b * land;
  }

  /**
   * A ring of small lights on the rim, in the ship's own frame (`scratch` still
   * holds its matrix), blinking round the ring so the hull reads as a shape
   * turning rather than a blob.
   */
  private runningLights(i: number, flight: Flight, land: number): void {
    const lights = this.style.lights;
    const positions = this.lightPositions;
    const colours = this.lightColours;
    if (!lights || !positions || !colours) return;
    const rim = lights.rim * this.style.hulls[0]!.length;
    const tint = this.lightColour;
    for (let k = 0; k < lights.count; k += 1) {
      const angle = (k / lights.count) * Math.PI * 2;
      light.set(Math.cos(angle) * rim, 0, Math.sin(angle) * rim).applyMatrix4(scratch.matrix);
      const at = (i * lights.count + k) * 3;
      positions[at] = light.x;
      positions[at + 1] = light.y;
      positions[at + 2] = light.z;
      const phase = this.elapsed * lights.blinkHz + k / lights.count + i * 0.13;
      const on = (phase % 1) < 0.5 ? 1 : 0.35;
      colours[at] = tint.r * on * land;
      colours[at + 1] = tint.g * on * land;
      colours[at + 2] = tint.b * on * land;
    }
  }

  /**
   * One ship in `guns.every` fires at its spot on the surface, in bursts, once
   * it is near Earth and while it is still big enough to see. Each has its own
   * phase, so the fire rolls across the fleet rather than strobing in time.
   */
  private shoot(i: number, flight: Flight, land: number): void {
    const guns = this.style.guns;
    const hits = this.hitPositions;
    const heat = this.hitColours;
    if (!guns || !this.beamOuter || !this.beamCore || !hits || !heat) return;
    const t3 = i * 3;
    const phase = (flight.age + i * 0.37) % (guns.on + guns.off);
    const firing =
      i % guns.every === 1 &&
      land > 0.2 &&
      pos.distanceTo(this.planet.centre) < this.planet.radius * guns.within &&
      phase < guns.on;
    if (!firing) {
      this.beamOuter.setMatrixAt(i, HIDDEN);
      this.beamCore.setMatrixAt(i, HIDDEN);
      heat.fill(0, t3, t3 + 3);
      return;
    }

    hit.copy(flight.aim);
    const reach = pos.distanceTo(hit);
    // Swells in and out over the burst, with a flicker on top.
    const burst = Math.sin((phase / guns.on) * Math.PI);
    const flicker = 0.8 + 0.2 * Math.sin(flight.age * 60);
    const radius = guns.radius * flight.scale * burst * flicker * land;

    scratch.position.copy(pos);
    scratch.lookAt(hit);
    scratch.scale.set(radius, radius, reach);
    scratch.updateMatrix();
    this.beamOuter.setMatrixAt(i, scratch.matrix);
    scratch.scale.set(radius * 0.25, radius * 0.25, reach);
    scratch.updateMatrix();
    this.beamCore.setMatrixAt(i, scratch.matrix);

    hits[t3] = hit.x;
    hits[t3 + 1] = hit.y;
    hits[t3 + 2] = hit.z;
    const red = this.beamColour;
    const glow = burst * flicker;
    heat[t3] = red.r * glow;
    heat[t3 + 1] = red.g * glow;
    heat[t3 + 2] = red.b * glow;
  }

  private hide(i: number, hull: Hull, slot: number): void {
    for (const part of hull.parts) part.setMatrixAt(slot, HIDDEN);
    this.trailColours?.fill(0, i * 6, i * 6 + 6);
    this.glowColours?.fill(0, i * 3, i * 3 + 3);
    const lights = this.style.lights;
    if (lights && this.lightColours) {
      this.lightColours.fill(0, i * lights.count * 3, (i + 1) * lights.count * 3);
    }
    this.beamOuter?.setMatrixAt(i, HIDDEN);
    this.beamCore?.setMatrixAt(i, HIDDEN);
    this.hitColours?.fill(0, i * 3, i * 3 + 3);
  }

  dispose(): void {
    this.disposed = true;
    this.group.removeFromParent();
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
  }
}
