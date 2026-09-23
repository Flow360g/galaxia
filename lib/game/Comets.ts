import * as THREE from "three";
import { disposeGlow, glowMaterial, glowSprite } from "./glow";
import { AMBIENCE } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Shooting stars, and now and then a comet, far out beyond the field.
 *
 * Pure set dressing, and held to the rule the whole scene is: nothing moves
 * in the sky while a question is open. A crossing only starts between
 * questions, and one caught in flight when a question opens is faded out in a
 * blink. The launch timing and every crossing's shape come off a seeded
 * stream, so two players on the same day are shown the same sky in the same
 * order.
 *
 * Each is a glow sprite for the head and a stretched quad for the tail, both
 * additive, both beyond the fog, and each hidden when not flying: an idle
 * pool costs nothing.
 */

const C = AMBIENCE.comets;
const scratch = new THREE.Vector3();

interface Streak {
  group: THREE.Group;
  head: THREE.Sprite;
  headMaterial: THREE.SpriteMaterial;
  tail: THREE.Mesh;
  tailMaterial: THREE.MeshBasicMaterial;
  live: boolean;
  t: number;
  seconds: number;
  /** Fade multiplier; drops to 0 over `abortSeconds` if a question opens. */
  fade: number;
  aborting: boolean;
  vx: number;
  vy: number;
  headSize: number;
}

export class Comets {
  readonly group = new THREE.Group();

  private readonly streaks: Streak[] = [];
  private readonly tailGeometry: THREE.PlaneGeometry;
  private readonly tailTexture: THREE.CanvasTexture | null = null;
  private wait: number;
  private launches = 0;

  constructor(
    tier: QualityTier,
    reducedMotion: boolean,
    private readonly random: () => number,
  ) {
    const count = reducedMotion ? 0 : (C.count[tier] ?? 0);
    this.tailGeometry = new THREE.PlaneGeometry(1, 1);
    // Head at the origin, tail trailing out along -X.
    this.tailGeometry.translate(-0.5, 0, 0);
    if (count > 0) this.tailTexture = drawTail();

    for (let i = 0; i < count; i += 1) {
      const group = new THREE.Group();
      const headMaterial = glowMaterial(C.starColor, 1);
      const head = glowSprite(headMaterial, C.starHead);
      const tailMaterial = new THREE.MeshBasicMaterial({
        map: this.tailTexture,
        color: C.starColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });
      const tail = new THREE.Mesh(this.tailGeometry, tailMaterial);
      tail.frustumCulled = false;
      group.add(tail, head);
      group.visible = false;
      this.group.add(group);
      this.streaks.push({
        group,
        head,
        headMaterial,
        tail,
        tailMaterial,
        live: false,
        t: 0,
        seconds: 1,
        fade: 1,
        aborting: false,
        vx: 0,
        vy: 0,
        headSize: C.starHead,
      });
    }
    this.wait = this.nextInterval();
  }

  private nextInterval(): number {
    return C.intervalMin + (C.intervalMax - C.intervalMin) * this.random();
  }

  /**
   * @param open    the sky is not calm (a question is up, or its verdict is
   *                landing); nothing may start, and anything in flight is
   *                faded out
   * @param camera  the chase camera, so crossings are framed on screen
   */
  update(dt: number, open: boolean, camera: THREE.PerspectiveCamera): void {
    if (this.streaks.length === 0) return;

    if (!open) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = this.nextInterval();
        this.launch(camera);
      }
    }

    for (const s of this.streaks) {
      if (!s.live) continue;
      if (open && !s.aborting) s.aborting = true;
      if (s.aborting) s.fade = Math.max(s.fade - dt / C.abortSeconds, 0);

      s.t = Math.min(s.t + dt / s.seconds, 1);
      s.group.position.x += s.vx * dt;
      s.group.position.y += s.vy * dt;

      // In, bright through the middle, out: a crossing that eases on and off
      // rather than popping at the frame edge.
      const life = Math.sin(s.t * Math.PI) * s.fade;
      s.headMaterial.opacity = life;
      s.tailMaterial.opacity = life * 0.85;
      s.head.scale.setScalar(s.headSize * (0.75 + 0.25 * life));

      if (s.t >= 1 || s.fade <= 0) {
        s.live = false;
        s.group.visible = false;
      }
    }
  }

  private launch(camera: THREE.PerspectiveCamera): void {
    const s = this.streaks.find((streak) => !streak.live);
    if (!s) return;
    this.launches += 1;
    const comet = this.launches % C.cometEvery === 0;
    const r = this.random;

    const depth = C.depthMin + (C.depthMax - C.depthMin) * r();
    const halfH = depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const halfW = halfH * camera.aspect;

    // Start above and to one side, cross down and over. Shooting stars fall
    // steeply; a comet sails flatter and slower.
    const fromLeft = r() < 0.5;
    const dir = fromLeft ? 1 : -1;
    const slope = comet ? 0.25 + 0.2 * r() : 0.45 + 0.5 * r();
    const angle = Math.atan2(-slope, dir);
    const travel = C.travel * (comet ? 0.8 : 1);
    const seconds = comet ? C.cometSeconds : C.starSeconds;

    camera.getWorldPosition(scratch);
    const startX = scratch.x - dir * halfW * (0.3 + 0.6 * r());
    // The camera aims up and the top band covers the upper third, so the
    // open sky starts about level with the lens: cross there, not behind the HUD.
    const startY = scratch.y + halfH * (C.skyFrom + (C.skyTo - C.skyFrom) * r());

    s.group.position.set(startX, startY, scratch.z - depth);
    s.vx = (Math.cos(angle) * travel) / seconds;
    s.vy = (Math.sin(angle) * travel) / seconds;
    s.tail.rotation.z = angle;
    const length = comet ? C.cometTail : C.starTail;
    const width = comet ? C.cometWidth : C.starWidth;
    s.tail.scale.set(length, width, 1);
    s.headSize = comet ? C.cometHead : C.starHead;
    const color = comet ? C.cometColor : C.starColor;
    s.headMaterial.color.setHex(color);
    s.tailMaterial.color.setHex(color);
    s.seconds = seconds;
    s.t = 0;
    s.fade = 1;
    s.aborting = false;
    s.live = true;
    s.group.visible = true;
  }

  /** Test hook: how many crossings are in the sky right now. */
  get flying(): number {
    let n = 0;
    for (const s of this.streaks) if (s.live && s.fade > 0) n += 1;
    return n;
  }

  dispose(): void {
    this.tailGeometry.dispose();
    this.tailTexture?.dispose();
    for (const s of this.streaks) {
      disposeGlow(s.headMaterial);
      s.tailMaterial.dispose();
    }
    this.streaks.length = 0;
    this.group.clear();
  }
}

/**
 * The tail: bright at the head (u = 1), thinning to nothing along its length,
 * and soft across its width so it reads as light, not a drawn bar.
 */
function drawTail(): THREE.CanvasTexture {
  const w = 256;
  const h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const along = ctx.createLinearGradient(0, 0, w, 0);
    along.addColorStop(0, "rgba(255,255,255,0)");
    along.addColorStop(0.7, "rgba(255,255,255,0.35)");
    along.addColorStop(1, "rgba(255,255,255,1)");
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
