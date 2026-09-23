import * as THREE from "three";
import { COLOR, FX } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Explosions: fire, embers, and light thrown onto the scene.
 *
 * Every puff of fireball and every ember of every blast lives in one particle
 * cloud with its own small shader (per-particle size, colour, alpha and spin),
 * so a kill with three chained secondaries is still one draw call. A puff is
 * born white-hot and cools through orange to deep red as it swells and fades;
 * an ember is a spark flung out fast and dragged back by the stream.
 *
 * The flash is a real light. One `PointLight` is created with the scene at
 * zero intensity, so no material ever recompiles mid-run when it fires, and
 * each blast drops it at its heart and lets it decay: the rocks and the hull
 * catch the fire for a quarter of a second.
 */

const E = FX.explosion;

export type BlastPalette = "fire" | "contact" | "damage";

/** Hot, mid and cold colours per palette: what a puff cools through. */
const RAMPS: Record<BlastPalette, readonly [THREE.Color, THREE.Color, THREE.Color]> = {
  fire: [new THREE.Color(0xffc978), new THREE.Color(0xff6a12), new THREE.Color(0x6a0f04)],
  contact: [
    new THREE.Color(0xd8c4ff),
    new THREE.Color(COLOR.contact),
    new THREE.Color(0x3a1470),
  ],
  damage: [new THREE.Color(0xffb09e), new THREE.Color(COLOR.neg), new THREE.Color(0x5c0a06)],
};
const PALETTES: BlastPalette[] = ["fire", "contact", "damage"];
const scratch = new THREE.Color();

const vertexShader = /* glsl */ `
  attribute float size;
  attribute float spin;
  attribute vec4 tint;
  uniform float scale;
  varying vec4 vTint;
  varying float vSpin;
  void main() {
    vTint = tint;
    vSpin = spin;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  varying vec4 vTint;
  varying float vSpin;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vSpin);
    float s = sin(vSpin);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    vec4 texel = texture2D(map, p);
    gl_FragColor = vec4(vTint.rgb * texel.rgb, vTint.a * texel.a);
    #include <colorspace_fragment>
  }
`;

interface Pending {
  delay: number;
  x: number;
  y: number;
  z: number;
  strength: number;
  palette: number;
}

export class Explosion {
  readonly points: THREE.Points;
  readonly light: THREE.PointLight;

  private readonly count: number;
  private readonly puffsPerBlast: number;
  private readonly embersPerBlast: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly texture: THREE.CanvasTexture;

  private readonly position: Float32Array;
  private readonly tint: Float32Array;
  private readonly size: Float32Array;
  private readonly spin: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly from: Float32Array;
  private readonly to: Float32Array;
  private readonly spinRate: Float32Array;
  /** 0 = puff, 1 = ember. */
  private readonly ember: Uint8Array;
  private readonly palette: Uint8Array;
  private next = 0;
  private live = 0;

  private lightLeft = 0;
  private lightPeak = 0;
  private readonly pending: Pending[] = [];

  constructor(tier: QualityTier, private readonly random: () => number) {
    this.puffsPerBlast = E.puffs[tier] ?? 4;
    this.embersPerBlast = E.embers[tier] ?? 20;
    this.count = E.pool * (this.puffsPerBlast + this.embersPerBlast);
    const n = this.count;

    this.position = new Float32Array(n * 3);
    this.tint = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.age = new Float32Array(n).fill(1);
    this.life = new Float32Array(n).fill(1);
    this.from = new Float32Array(n);
    this.to = new Float32Array(n);
    this.spinRate = new Float32Array(n);
    this.ember = new Uint8Array(n);
    this.palette = new Uint8Array(n);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3));
    this.geometry.setAttribute("tint", new THREE.BufferAttribute(this.tint, 4));
    this.geometry.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    this.geometry.setAttribute("spin", new THREE.BufferAttribute(this.spin, 1));

    this.texture = drawFire(random);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.texture }, scale: { value: 400 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;

    this.light = new THREE.PointLight(E.lightColor, 0, E.lightDistance, 2);
  }

  /** Half the drawing buffer's height in pixels: how big a world unit is on screen. */
  setScale(pixelsHalfHeight: number): void {
    this.material.uniforms.scale!.value = pixelsHalfHeight;
  }

  /** A blast at `at`, at `strength` (1 = a boulder on the hull). */
  blast(at: THREE.Vector3, strength: number, palette: BlastPalette = "fire"): void {
    this.spawn(at.x, at.y, at.z, strength, PALETTES.indexOf(palette));
  }

  /**
   * A chain of blasts across something coming apart: `count` secondaries,
   * `gap` seconds apart, scattered within `spread` of `at`.
   */
  chain(
    at: THREE.Vector3,
    count: number,
    gap: number,
    spread: number,
    strength: number,
    palette: BlastPalette,
  ): void {
    for (let i = 0; i < count; i += 1) {
      this.pending.push({
        delay: gap * (i + 1),
        x: at.x + (this.random() * 2 - 1) * spread,
        y: at.y + (this.random() * 2 - 1) * spread * 0.5,
        z: at.z + (this.random() * 2 - 1) * spread * 0.6,
        strength: strength * (0.8 + 0.4 * this.random()),
        palette: PALETTES.indexOf(palette),
      });
    }
  }

  private spawn(x: number, y: number, z: number, strength: number, palette: number): void {
    const r = this.random;
    for (let i = 0; i < this.puffsPerBlast + this.embersPerBlast; i += 1) {
      const k = this.next;
      this.next = (this.next + 1) % this.count;
      const isEmber = i >= this.puffsPerBlast;
      this.ember[k] = isEmber ? 1 : 0;
      this.palette[k] = palette;

      // A random direction, flattened a little so the blast reads wide.
      const theta = r() * Math.PI * 2;
      const phi = Math.acos(r() * 2 - 1);
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.sin(phi) * Math.sin(theta) * 0.8;
      const dz = Math.cos(phi);

      const j = k * 3;
      if (isEmber) {
        const speed = E.emberSpeed * strength * (0.4 + 0.8 * r());
        this.position[j] = x;
        this.position[j + 1] = y;
        this.position[j + 2] = z;
        this.vx[k] = dx * speed;
        this.vy[k] = dy * speed;
        this.vz[k] = dz * speed;
        this.life[k] = E.emberSeconds * (0.5 + 0.7 * r());
        this.from[k] = E.emberSize * (0.7 + 0.6 * r());
        this.to[k] = 0;
      } else {
        const off = E.puffSpread * strength * r();
        this.position[j] = x + dx * off;
        this.position[j + 1] = y + dy * off;
        this.position[j + 2] = z + dz * off;
        this.vx[k] = dx * off * 1.4;
        this.vy[k] = dy * off * 1.4 + 1.5;
        this.vz[k] = dz * off * 1.4;
        // The first puff is the core: biggest, hottest, quickest to go.
        const core = i === 0;
        this.life[k] = E.seconds * (core ? 0.55 : 0.7 + 0.5 * r());
        this.from[k] = E.puffFrom * strength * (core ? 1.6 : 0.7 + 0.6 * r());
        this.to[k] = E.puffTo * strength * (core ? 1.3 : 0.7 + 0.6 * r());
      }
      this.age[k] = 0;
      this.spin[k] = r() * Math.PI * 2;
      this.spinRate[k] = (r() * 2 - 1) * 2.5;
    }
    this.live = this.count;
    this.points.visible = true;

    // The light jumps to the newest blast and flares with it.
    this.light.position.set(x, y, z);
    this.lightPeak = E.lightIntensity * strength;
    this.lightLeft = E.lightSeconds;
    this.light.intensity = this.lightPeak;
  }

  /**
   * @param dt          visual frame delta (slowed by hit-stop and bullet time)
   * @param worldSpeed  the stream, so what burns is left behind
   */
  update(dt: number, worldSpeed: number): void {
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      const p = this.pending[i]!;
      p.delay -= dt;
      if (p.delay <= 0) {
        this.spawn(p.x, p.y, p.z, p.strength, p.palette);
        this.pending.splice(i, 1);
      }
    }

    if (this.lightLeft > 0) {
      this.lightLeft = Math.max(this.lightLeft - dt, 0);
      const k = this.lightLeft / E.lightSeconds;
      this.light.intensity = this.lightPeak * k * k;
    }

    if (this.live <= 0) return;
    let alive = 0;
    const drag = Math.exp(-E.emberDrag * dt);
    // Left behind by the stream, but slowly: a fireball swept out of frame
    // in a fifth of a second is a fireball nobody saw.
    const stream = worldSpeed * E.stream * dt;

    for (let k = 0; k < this.count; k += 1) {
      const j = k * 3;
      const c = k * 4;
      if (this.age[k]! >= this.life[k]!) {
        this.tint[c + 3] = 0;
        this.size[k] = 0;
        continue;
      }
      alive += 1;
      this.age[k]! += dt;
      const t = Math.min(this.age[k]! / this.life[k]!, 1);

      if (this.ember[k]) {
        this.vx[k]! *= drag;
        this.vy[k]! *= drag;
        this.vz[k]! *= drag;
      } else {
        this.vx[k]! *= 0.96;
        this.vy[k]! *= 0.96;
        this.vz[k]! *= 0.96;
      }
      this.position[j]! += this.vx[k]! * dt;
      this.position[j + 1]! += this.vy[k]! * dt;
      this.position[j + 2]! += this.vz[k]! * dt + stream;
      this.spin[k]! += this.spinRate[k]! * dt;

      const ramp = RAMPS[PALETTES[this.palette[k]!]!];
      let alpha: number;
      if (this.ember[k]) {
        // Sparks stay hot and wink out.
        scratch.copy(ramp[0]).lerp(ramp[1], t);
        alpha = 1 - t;
        this.size[k] = this.from[k]! * (1 - t * 0.6);
      } else {
        // White-hot, then the palette's colour, then embers-red to nothing.
        if (t < 0.25) scratch.copy(ramp[0]).lerp(ramp[1], t / 0.25);
        else scratch.copy(ramp[1]).lerp(ramp[2], (t - 0.25) / 0.75);
        // Puffs overlap and add, so each is held well short of opaque or the
        // heart of the blast burns out to plain white.
        alpha = 0.55 * (t < 0.08 ? t / 0.08 : Math.pow(1 - (t - 0.08) / 0.92, 1.6));
        const grow = 1 - Math.pow(1 - t, 3);
        this.size[k] = this.from[k]! + (this.to[k]! - this.from[k]!) * grow;
      }
      this.tint[c] = scratch.r;
      this.tint[c + 1] = scratch.g;
      this.tint[c + 2] = scratch.b;
      this.tint[c + 3] = alpha;
    }

    this.live = alive;
    if (alive === 0) this.points.visible = false;
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("tint").needsUpdate = true;
    this.geometry.getAttribute("size").needsUpdate = true;
    this.geometry.getAttribute("spin").needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.light.dispose();
    this.pending.length = 0;
  }
}

/**
 * A billow of fire: a soft core broken up by overlapping blobs, so a puff
 * reads as turbulent flame rather than a disc. Drawn once, rotated per puff.
 */
function drawFire(random: () => number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const r = size / 2;
    const base = ctx.createRadialGradient(r, r, 0, r, r, r);
    base.addColorStop(0, "rgba(255,255,255,0.9)");
    base.addColorStop(0.4, "rgba(255,255,255,0.45)");
    base.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14; i += 1) {
      const a = random() * Math.PI * 2;
      const d = random() * r * 0.45;
      const x = r + Math.cos(a) * d;
      const y = r + Math.sin(a) * d;
      const br = r * (0.2 + random() * 0.3);
      const blob = ctx.createRadialGradient(x, y, 0, x, y, br);
      blob.addColorStop(0, `rgba(255,255,255,${0.25 + random() * 0.3})`);
      blob.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = blob;
      ctx.fillRect(0, 0, size, size);
    }
    // Fade the square's corners out so no puff ever shows an edge.
    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
    mask.addColorStop(0, "rgba(255,255,255,1)");
    mask.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
