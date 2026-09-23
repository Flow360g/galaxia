import * as THREE from "three";
import { disposeGlow, glowMaterial, glowSprite } from "./glow";
import { FX } from "./Tuning";

/**
 * The shockwave on contact: a soft ring racing out from the impact, and a
 * white-hot flash at its heart that is gone before the ring is half grown.
 *
 * Debris says something broke; the ring says how hard. It is the difference
 * between a rock coming apart and a rock being hit. The ring is a quad with
 * a painted annulus on it, billboarded to the camera so it always reads as a
 * circle, and fed from a small pool so no contact ever allocates.
 */

const S = FX.shockwave;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

interface Ring {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  t: number;
  strength: number;
  live: boolean;
}

export class Shockwave {
  readonly group = new THREE.Group();

  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly texture: THREE.CanvasTexture;
  private readonly rings: Ring[] = [];
  private readonly flash: THREE.Sprite;
  private readonly flashMaterial: THREE.SpriteMaterial;
  private flashT = 1;
  private flashStrength = 1;
  private next = 0;

  constructor(private readonly reducedMotion: boolean) {
    this.texture = drawRing();
    for (let i = 0; i < S.pool; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push({ mesh, material, t: 1, strength: 1, live: false });
    }
    this.flashMaterial = glowMaterial(0xffffff, 0);
    this.flash = glowSprite(this.flashMaterial, S.flashSize);
    this.flash.visible = false;
    this.group.add(this.flash);
  }

  /** A contact at `at`, in `color`, at `strength` (1 = a boulder on the hull). */
  burst(at: THREE.Vector3, color: number, strength: number): void {
    const ring = this.rings[this.next]!;
    this.next = (this.next + 1) % this.rings.length;
    ring.mesh.position.copy(at);
    ring.material.color.setHex(color);
    ring.t = 0;
    ring.strength = strength;
    ring.live = true;
    ring.mesh.visible = true;

    // A flash is a bright frame on a phone held close to the face, so it is
    // left out for anyone who has asked for less motion.
    if (this.reducedMotion) return;
    this.flash.position.copy(at);
    this.flashT = 0;
    this.flashStrength = strength;
    this.flash.visible = true;
  }

  /** Step the pool and face every ring at `camera`. */
  update(dt: number, camera: THREE.Camera): void {
    for (const ring of this.rings) {
      if (!ring.live) continue;
      ring.t = Math.min(ring.t + dt / S.ringSeconds, 1);
      const size = (S.ringFrom + (S.ringTo - S.ringFrom) * easeOut(ring.t)) * ring.strength;
      ring.mesh.scale.set(size, size, 1);
      ring.mesh.quaternion.copy(camera.quaternion);
      ring.material.opacity = S.ringOpacity * (1 - ring.t) * (1 - ring.t);
      if (ring.t >= 1) {
        ring.live = false;
        ring.mesh.visible = false;
      }
    }

    if (this.flash.visible) {
      this.flashT = Math.min(this.flashT + dt / S.flashSeconds, 1);
      const k = 1 - this.flashT;
      this.flash.scale.setScalar(S.flashSize * this.flashStrength * (0.6 + 0.6 * this.flashT));
      this.flashMaterial.opacity = k * k;
      if (this.flashT >= 1) this.flash.visible = false;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.texture.dispose();
    for (const ring of this.rings) ring.material.dispose();
    disposeGlow(this.flashMaterial);
    this.group.clear();
  }
}

/**
 * The ring's texture: a bright band near the rim with a soft inner wash, so
 * it reads as a pressure front rather than a drawn circle.
 */
function drawRing(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.55, "rgba(255,255,255,0.08)");
    g.addColorStop(0.8, "rgba(255,255,255,0.55)");
    g.addColorStop(0.9, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
