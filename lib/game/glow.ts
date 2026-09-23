import * as THREE from "three";
import { GLOW } from "./Tuning";

/**
 * Faked bloom. The game has no post-processing, so anything that should glow
 * carries its own halo: a soft radial gradient on an additive sprite, drawn
 * once into a canvas and shared by every halo, flare, beacon and comet head
 * in the scene. One texture, one sampler, and a halo costs a single quad.
 *
 * The gradient falls off on a curve rather than linearly: a hot centre and a
 * long faint skirt is what reads as light bleeding through a lens, where a
 * linear ramp reads as a flat disc with a fuzzy edge.
 */

let shared: THREE.CanvasTexture | null = null;
let users = 0;

function draw(): THREE.CanvasTexture {
  const size = GLOW.textureSize;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const r = size / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    for (const [stop, alpha] of GLOW.falloff) {
      gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The shared halo texture. Every call must be matched by `releaseGlow()` on
 * dispose; the texture is freed when the last user lets go, so a remount
 * draws a fresh one against the new context.
 */
export function glowTexture(): THREE.CanvasTexture {
  if (!shared) shared = draw();
  users += 1;
  return shared;
}

export function releaseGlow(): void {
  users = Math.max(users - 1, 0);
  if (users === 0 && shared) {
    shared.dispose();
    shared = null;
  }
}

/** An additive halo material in `color`. The caller owns and disposes it. */
export function glowMaterial(color: number, opacity = 1): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
}

/** A halo sprite, `scale` world units across. */
export function glowSprite(material: THREE.SpriteMaterial, scale: number): THREE.Sprite {
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(scale);
  return sprite;
}

/** Dispose a material made by `glowMaterial` and let go of the texture. */
export function disposeGlow(material: THREE.SpriteMaterial | THREE.PointsMaterial): void {
  material.dispose();
  releaseGlow();
}

/**
 * The anamorphic flare: a thin horizontal line of light with a hot core,
 * fading out to both ends. Stretched wide across a nozzle or a pod, it is the
 * lens streak of every big-budget space film, for the price of one quad.
 */
let flare: THREE.CanvasTexture | null = null;
let flareUsers = 0;

function drawFlare(): THREE.CanvasTexture {
  const w = GLOW.flareTextureWidth;
  const h = GLOW.flareTextureHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const along = ctx.createLinearGradient(0, 0, w, 0);
    along.addColorStop(0, "rgba(255,255,255,0)");
    along.addColorStop(0.3, "rgba(255,255,255,0.18)");
    along.addColorStop(0.46, "rgba(255,255,255,0.7)");
    along.addColorStop(0.5, "rgba(255,255,255,1)");
    along.addColorStop(0.54, "rgba(255,255,255,0.7)");
    along.addColorStop(0.7, "rgba(255,255,255,0.18)");
    along.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = along;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-in";
    const across = ctx.createLinearGradient(0, 0, 0, h);
    across.addColorStop(0, "rgba(255,255,255,0)");
    across.addColorStop(0.5, "rgba(255,255,255,1)");
    across.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, w, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** An additive anamorphic flare material. Dispose with `disposeFlare`. */
export function flareMaterial(color: number, opacity = 1): THREE.SpriteMaterial {
  if (!flare) flare = drawFlare();
  flareUsers += 1;
  return new THREE.SpriteMaterial({
    map: flare,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
}

export function disposeFlare(material: THREE.SpriteMaterial): void {
  material.dispose();
  flareUsers = Math.max(flareUsers - 1, 0);
  if (flareUsers === 0 && flare) {
    flare.dispose();
    flare = null;
  }
}
