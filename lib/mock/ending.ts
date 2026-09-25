import * as THREE from "three";
import { Backdrop } from "@/lib/game/Backdrop";
import { glowTexture, releaseGlow } from "@/lib/game/glow";
import { loadLambertModel } from "@/lib/game/gltf";
import { dprForTier, detectTier, prefersReducedMotion } from "@/lib/game/quality";
import { ALIEN, COLOR, EARTH, ORBIT, PERF, SHIPS, STATION } from "@/lib/game/Tuning";

/**
 * MOCK: the ending, where the reinforcements go in.
 *
 * A prototype surface, not part of the run, in the spirit of the satellite
 * mock. It starts on the frame the station screen already shows behind the
 * tally, pulls the camera back until Earth is a planet in a window, and sends
 * the fleet past the lens and down onto the two landing sites the player
 * named. The number of ships is the result: both sites named sends the
 * armada, one sends a wave. None named sends THEIR fleet instead: the alien
 * scouts pour in, and a few of them fire on the surface on the way down.
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
  /**
   * Where a ship's route ends: over its landing site, this far above the
   * surface as a share of Earth's radius. It never reaches the ground; it
   * dwindles away in the distance first, from `fadeFrom` of the way in.
   */
  stopAbove: 0.45,
  fadeFrom: 0.4,
  /**
   * Earth's turn when the scene opens, radians, chosen so land faces the
   * pulled-back camera while the fleet goes in. It keeps turning from there.
   */
  earthYaw: 2.99,
  /** How far apart the two sites sit on Earth's face, as a share of its radius. */
  siteSpread: 0.42,
  /** The first few ships launch from beside the lens so they tear past it. */
  heroShips: 8,
  /** Seconds into the pull the lead ships launch, one after another. */
  heroFrom: 1.1,
  heroEvery: 0.28,
  /**
   * The invasion, when no site was named: alien scouts, slower than our
   * ships and a size bigger, so the descent reads as heavy and unhurried.
   */
  invaders: 96,
  invaderLength: 1.5,
  invaderSeconds: 8.5,
  /** Their hulls glow faintly in the contact violet, so they read at a speck. */
  invaderGlow: 0.35,
  /** One invader in this many fires on the way down; the rest just fly. */
  shooterEvery: 4,
  /**
   * A shot: seconds on and seconds off. A scout fires only within this many
   * Earth radii of the centre: nearer the camera a beam is a bar across the
   * whole screen. Every beam lands on Earth's visible face.
   */
  shotSeconds: 0.8,
  shotGap: 0.6,
  shootWithin: 7,
  /**
   * Beam thickness and colour, and the flash where it lands. The HUD's damage
   * red rather than `COLOR.neg`, which is too dark to carry on an additive
   * blend at this distance.
   */
  beamRadius: 0.26,
  beamColor: 0xff6b5c,
  hitSize: 4.2,
  /** Scouts hold their size longer than our ships: they are coming down, not going away. */
  invaderFadeFrom: 0.72,
  invaderTrail: 1.6,
} as const;

/** What a fleet is made of and how it flies. */
interface FleetStyle {
  hulls: Array<{
    url: string;
    length: number;
    yaw: number;
    trim: { yaw: number; roll: number };
    share: number;
  }>;
  /** Engine glow and trail colour. */
  trail: number;
  /** Hull glow, for a fleet that has to read against the dark as a speck. */
  glow: { color: number; intensity: number } | null;
  seconds: number;
  /** Share of the trip after which the hull dwindles away, and trail length. */
  fadeFrom: number;
  trailLength: number;
  /** One in this many fires beams at the surface; 0 for none. */
  shooterEvery: number;
}

/** Ours: the three hulls from the bay, mostly standard issue. */
const OUR_FLEET: FleetStyle = {
  hulls: SHIPS.map((ship) => ({
    url: ship.modelUrl,
    length: ENDING.shipLength,
    yaw: ship.modelYaw,
    trim: ship.modelTrim,
    share: ENDING.hullMix[ship.id] ?? 0,
  })),
  trail: COLOR.plasma,
  glow: null,
  seconds: ENDING.flightSeconds,
  fadeFrom: ENDING.fadeFrom,
  trailLength: ENDING.trailLength,
  shooterEvery: 0,
};

/** Theirs: the scout from ALIEN CONTACT, by the dozen. */
const INVADERS: FleetStyle = {
  hulls: [
    {
      url: ALIEN.modelUrl,
      length: ENDING.invaderLength,
      yaw: Math.PI,
      trim: { yaw: 0, roll: 0 },
      share: 1,
    },
  ],
  trail: COLOR.contact,
  glow: { color: COLOR.contact, intensity: ENDING.invaderGlow },
  seconds: ENDING.invaderSeconds,
  fadeFrom: ENDING.invaderFadeFrom,
  trailLength: ENDING.invaderTrail,
  shooterEvery: ENDING.shooterEvery,
};

const facing = new THREE.Vector3();

const EASE = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const scratch = new THREE.Object3D();
const pos = new THREE.Vector3();
const ahead = new THREE.Vector3();
const dir = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const hit = new THREE.Vector3();
const RED = new THREE.Color(ENDING.beamColor);
const UP = new THREE.Vector3(0, 1, 0);
const side = new THREE.Vector3();
const up = new THREE.Vector3();

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
  /** Where on the surface it fires, for a fleet that shoots. */
  aim: THREE.Vector3;
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
  private readonly trailColours: Float32Array;
  private readonly glowColours: Float32Array;
  private readonly tint: THREE.Color;
  /** Beams and their hit flashes: only built for a fleet that shoots. */
  private beamOuter: THREE.InstancedMesh | null = null;
  private beamCore: THREE.InstancedMesh | null = null;
  private hits: THREE.Points | null = null;
  private hitPositions: Float32Array | null = null;
  private hitColours: Float32Array | null = null;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private disposed = false;

  constructor(
    private readonly style: FleetStyle,
    private readonly size: number,
    private readonly sites: THREE.Vector3[],
    private readonly planet: { centre: THREE.Vector3; radius: number; facing: () => THREE.Vector3 },
    private readonly launchFrom: () => THREE.Vector3,
    private readonly lens: () => THREE.Vector3,
  ) {
    const n = Math.max(size, 1);
    this.tint = new THREE.Color(style.trail);

    // Trails and glows carry their colour per vertex, so each one can fade
    // with its own ship; the far end of a trail is always black, which on an
    // additive blend is nothing.
    this.trailPositions = new Float32Array(n * 6);
    this.trailColours = new Float32Array(n * 6);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    trailGeometry.setAttribute("color", new THREE.BufferAttribute(this.trailColours, 3));
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
    this.glowColours = new Float32Array(n * 3);
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute("position", new THREE.BufferAttribute(this.glowPositions, 3));
    glowGeometry.setAttribute("color", new THREE.BufferAttribute(this.glowColours, 3));
    const glowMaterial = new THREE.PointsMaterial({
      map: glowTexture(),
      vertexColors: true,
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

    if (style.shooterEvery > 0) this.buildBeams(n);
  }

  /**
   * The beams, the way `Beam.ts` draws one: an open additive cylinder with a
   * white core inside it, here instanced so any number firing at once is two
   * draw calls. Laid along +Z from 0 to 1, so a beam is placed at the muzzle,
   * pointed at the ground and stretched to reach it.
   */
  private buildBeams(n: number): void {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, 0.5);
    const make = (color: number, opacity: number, blending: THREE.Blending) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending,
        depthWrite: false,
      });
    // The outer beam is laid over the scene rather than added to it, so it
    // stays red across green land instead of summing to yellow. The core is
    // added, which is what makes it read as light.
    const outerMaterial = make(ENDING.beamColor, 0.85, THREE.NormalBlending);
    const coreMaterial = make(COLOR.white, 0.6, THREE.AdditiveBlending);
    this.beamOuter = new THREE.InstancedMesh(geometry, outerMaterial, n);
    this.beamCore = new THREE.InstancedMesh(geometry, coreMaterial, n);
    for (const mesh of [this.beamOuter, this.beamCore]) {
      mesh.frustumCulled = false;
      for (let i = 0; i < n; i += 1) mesh.setMatrixAt(i, HIDDEN);
      this.group.add(mesh);
    }
    this.disposables.push(geometry, outerMaterial, coreMaterial);

    this.hitPositions = new Float32Array(n * 3);
    this.hitColours = new Float32Array(n * 3);
    const hitGeometry = new THREE.BufferGeometry();
    hitGeometry.setAttribute("position", new THREE.BufferAttribute(this.hitPositions, 3));
    hitGeometry.setAttribute("color", new THREE.BufferAttribute(this.hitColours, 3));
    const hitMaterial = new THREE.PointsMaterial({
      map: glowTexture(),
      vertexColors: true,
      size: ENDING.hitSize,
      sizeAttenuation: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // It sits exactly on the surface, so half of it would be inside Earth.
      depthTest: false,
    });
    this.hits = new THREE.Points(hitGeometry, hitMaterial);
    this.hits.frustumCulled = false;
    this.disposables.push(hitGeometry, hitMaterial, { dispose: releaseGlow });
    this.group.add(this.hits);

  }

  async load(): Promise<void> {
    if (this.size === 0) return;
    const mix = this.style.hulls.map((hull) => hull.share);
    const total = mix.reduce((a, b) => a + b, 0) || 1;
    const counts = mix.map((share) => Math.round((share / total) * this.size));
    counts[0] = (counts[0] ?? 0) + this.size - counts.reduce((a, b) => a + b, 0);

    const models = await Promise.all(
      this.style.hulls.map((hull) => loadLambertModel(hull.url, hull.length, hull.yaw, hull.trim)),
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
      const glow = this.style.glow;
      if (glow) {
        for (const material of model.materials) {
          material.emissive.setHex(glow.color);
          material.emissiveIntensity = glow.intensity;
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
        aim: new THREE.Vector3(),
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
    flight.duration = this.style.seconds + (rand() - 0.5) * 2 * ENDING.flightJitter;
    flight.duration *= hero ? 0.75 : 1;
    flight.scale = hero ? 1.3 : 0.8 + rand() * 0.6;
    flight.age = 0;

    // A shooter fires at a spot on the face of Earth the camera sees, not
    // the ground straight under it: from most of the fleet that points
    // almost at the lens, and a beam seen end on is a dot.
    if (this.style.shooterEvery > 0) {
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

      const tail = ENDING.shipLength * 0.5 * flight.scale;
      this.glowPositions[t3] = pos.x - dir.x * tail;
      this.glowPositions[t3 + 1] = pos.y - dir.y * tail;
      this.glowPositions[t3 + 2] = pos.z - dir.z * tail;
      const length = this.style.trailLength * flight.scale * land;
      this.trailPositions[t6] = this.glowPositions[t3]!;
      this.trailPositions[t6 + 1] = this.glowPositions[t3 + 1]!;
      this.trailPositions[t6 + 2] = this.glowPositions[t3 + 2]!;
      this.trailPositions[t6 + 3] = pos.x - dir.x * length;
      this.trailPositions[t6 + 4] = pos.y - dir.y * length;
      this.trailPositions[t6 + 5] = pos.z - dir.z * length;
      this.glowColours[t3] = this.tint.r * land;
      this.glowColours[t3 + 1] = this.tint.g * land;
      this.glowColours[t3 + 2] = this.tint.b * land;
      this.trailColours[t6] = this.tint.r * land;
      this.trailColours[t6 + 1] = this.tint.g * land;
      this.trailColours[t6 + 2] = this.tint.b * land;
      this.shoot(i, flight, land);

      if (u >= 1) {
        flight.hero = false;
        this.plan(flight, this.random);
        flight.wait = this.random() * 1.2;
      }
    }

    for (const hull of this.hulls) for (const part of hull.parts) part.instanceMatrix.needsUpdate = true;
    (this.trail.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.glow.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.trail.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (this.glow.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    if (this.beamOuter && this.beamCore && this.hits) {
      this.beamOuter.instanceMatrix.needsUpdate = true;
      this.beamCore.instanceMatrix.needsUpdate = true;
      (this.hits.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (this.hits.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /**
   * One invader in `shooterEvery` fires at its spot on the surface, in
   * bursts, once it is close to Earth and while it is still big enough to
   * see. Each shooter has its own phase so the fire rolls across the fleet
   * rather than strobing in time.
   */
  private shoot(i: number, flight: Flight, land: number): void {
    if (!this.beamOuter || !this.beamCore || !this.hitPositions || !this.hitColours) return;
    const t3 = i * 3;
    const every = this.style.shooterEvery;
    const cycle = ENDING.shotSeconds + ENDING.shotGap;
    const phase = (flight.age + i * 0.37) % cycle;
    const firing =
      i % every === 1 &&
      land > 0.2 &&
      pos.distanceTo(this.planet.centre) < this.planet.radius * ENDING.shootWithin &&
      phase < ENDING.shotSeconds;
    if (!firing) {
      this.beamOuter.setMatrixAt(i, HIDDEN);
      this.beamCore.setMatrixAt(i, HIDDEN);
      this.hitColours.fill(0, t3, t3 + 3);
      return;
    }

    hit.copy(flight.aim);
    const reach = pos.distanceTo(hit);
    // Swells in and out over the burst, with a flicker on top.
    const burst = Math.sin((phase / ENDING.shotSeconds) * Math.PI);
    const flicker = 0.8 + 0.2 * Math.sin(flight.age * 60);
    const radius = ENDING.beamRadius * flight.scale * burst * flicker * land;

    scratch.position.copy(pos);
    scratch.lookAt(hit);
    scratch.scale.set(radius, radius, reach);
    scratch.updateMatrix();
    this.beamOuter.setMatrixAt(i, scratch.matrix);
    scratch.scale.set(radius * 0.25, radius * 0.25, reach);
    scratch.updateMatrix();
    this.beamCore.setMatrixAt(i, scratch.matrix);

    this.hitPositions[t3] = hit.x;
    this.hitPositions[t3 + 1] = hit.y;
    this.hitPositions[t3 + 2] = hit.z;
    const heat = burst * flicker;
    this.hitColours[t3] = RED.r * heat;
    this.hitColours[t3 + 1] = RED.g * heat;
    this.hitColours[t3 + 2] = RED.b * heat;
  }

  private hide(hull: Hull, slot: number, t6: number, t3: number): void {
    for (const part of hull.parts) part.setMatrixAt(slot, HIDDEN);
    this.trailPositions.fill(0, t6, t6 + 6);
    this.trailColours.fill(0, t6, t6 + 6);
    this.glowColours.fill(0, t3, t3 + 3);
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
    this.earthBody.rotation.y = ENDING.earthYaw;
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

    // Nothing named: the invaders land where they meant to, both sites.
    const invaded = sitesNamed === 0;
    const sites = this.siteSpots(invaded ? 2 : sitesNamed);
    const size = invaded ? ENDING.invaders : ENDING.fleet[sitesNamed];
    this.fleet =
      size > 0
        ? new Fleet(
            invaded ? INVADERS : OUR_FLEET,
            this.reducedMotion ? Math.round(size / 3) : size,
            sites,
            {
              centre: this.earth.position,
              radius: EARTH.diameter / 2,
              facing: () => facing.subVectors(this.endCam, this.earth.position).normalize(),
            },
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
    const radius = (EARTH.diameter / 2) * (1 + ENDING.stopAbove);
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

    this.fleet?.update(dt);
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

  /** Turns Earth to `yaw` radians. For finding `ENDING.earthYaw`; mock only. */
  debugEarthYaw(yaw: number): void {
    this.earthBody.rotation.y = yaw;
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
