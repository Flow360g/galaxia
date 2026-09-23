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
