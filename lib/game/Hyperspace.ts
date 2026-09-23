import * as THREE from "three";
import { COLOR, HYPER } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Hyperspace: what a boost looks like from the cockpit.
 *
 * Two layers, both parented to the camera so they wrap the view whatever the
 * rig is doing. A tube of light streaks around the lens axis rushes past and
 * stretches as the burn opens; and a streaked rim darkens the centre of
 * nothing and lights the edges of the frame, flickering like the lens is
 * struggling to hold the image. A partial burn opens it part way; MAXIMUM
 * THRUST opens it all the way and holds it.
 *
 * One `LineSegments` and one quad, additive, and both hidden at rest.
 */

const coreColor = new THREE.Color(HYPER.core);
const edgeColor = new THREE.Color(HYPER.edge);
const plasmaColor = new THREE.Color(COLOR.plasma);
const scratch = new THREE.Color();

export class Hyperspace {
  readonly group = new THREE.Group();

  private readonly lines: THREE.LineSegments | null = null;
  private readonly lineGeometry: THREE.BufferGeometry | null = null;
  private readonly lineMaterial: THREE.LineBasicMaterial | null = null;
  private readonly positions: Float32Array | null = null;
  private readonly colors: Float32Array | null = null;
  private readonly base: Float32Array | null = null;

  private readonly edge: THREE.Mesh | null = null;
  private readonly edgeGeometry: THREE.PlaneGeometry | null = null;
  private readonly edgeMaterial: THREE.MeshBasicMaterial | null = null;
  private readonly edgeTexture: THREE.CanvasTexture | null = null;

  private intensity = 0;
  private target = 0;
  private holdLeft = 0;
  /** 0..1 of raw plasma in the burn: tints the tunnel pink. */
  private plasma = 0;

  constructor(
    tier: QualityTier,
    private readonly reducedMotion: boolean,
    random: () => number,
  ) {
    const count = HYPER.streaks[tier] ?? 0;
    if (count > 0) {
      this.positions = new Float32Array(count * 6);
      this.colors = new Float32Array(count * 6);
      this.base = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2;
        const radius = HYPER.radiusMin + (HYPER.radiusMax - HYPER.radiusMin) * Math.sqrt(random());
        this.base[i * 3] = Math.cos(angle) * radius;
        this.base[i * 3 + 1] = Math.sin(angle) * radius;
        this.base[i * 3 + 2] = -random() * HYPER.depth;
      }
      this.lineGeometry = new THREE.BufferGeometry();
      this.lineGeometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
      this.lineGeometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
      this.lineMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
      this.lines.frustumCulled = false;
      this.lines.visible = false;
      this.lines.renderOrder = 10;
      this.group.add(this.lines);
    }

    if (!reducedMotion) {
      this.edgeTexture = drawEdge(random);
      this.edgeGeometry = new THREE.PlaneGeometry(1, 1);
      this.edgeMaterial = new THREE.MeshBasicMaterial({
        map: this.edgeTexture,
        color: HYPER.edge,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
      });
      this.edge = new THREE.Mesh(this.edgeGeometry, this.edgeMaterial);
      this.edge.position.z = -1;
      this.edge.frustumCulled = false;
      this.edge.visible = false;
      this.edge.renderOrder = 11;
      this.group.add(this.edge);
    }
  }

  /**
   * Open the tunnel to `level` (0..1) for `hold` seconds, then let it close.
   * `plasma` is how much raw plasma is in the burn, 0..1.
   */
  burn(level: number, hold: number, plasma = 0): void {
    const scale = this.reducedMotion ? HYPER.reducedScale : 1;
    this.target = Math.max(this.target, level * scale);
    this.holdLeft = Math.max(this.holdLeft, hold);
    this.plasma = Math.max(this.plasma, plasma);
  }

  /** How open the tunnel is right now, 0..1. */
  get level(): number {
    return this.intensity;
  }

  /**
   * @param dt          visual frame delta
   * @param worldSpeed  world units per second
   * @param camera      the chase camera, for the frame's size
   */
  update(dt: number, worldSpeed: number, camera: THREE.PerspectiveCamera): void {
    if (this.holdLeft > 0) this.holdLeft -= dt;
    else {
      this.target = 0;
      this.plasma *= Math.exp(-HYPER.fall * dt);
    }
    const rate = this.target > this.intensity ? HYPER.rise : HYPER.fall;
    this.intensity += (this.target - this.intensity) * (1 - Math.exp(-rate * dt));
    if (this.intensity < 0.002 && this.target === 0) this.intensity = 0;

    const k = this.intensity;
    this.updateLines(dt, worldSpeed, k);

    if (this.edge && this.edgeMaterial && this.edgeTexture) {
      this.edge.visible = k > 0.01;
      if (this.edge.visible) {
        const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        this.edge.scale.set(h * camera.aspect * 1.05, h * 1.05, 1);
        this.edgeMaterial.opacity = HYPER.edgeOpacity * k;
        scratch.copy(edgeColor).lerp(plasmaColor, this.plasma * 0.8);
        this.edgeMaterial.color.copy(scratch);
        // A flicker of the streaks: the lens fighting to hold the picture.
        this.edgeTexture.rotation = Math.random() * Math.PI * 2;
      }
    }
  }

  private updateLines(dt: number, worldSpeed: number, k: number): void {
    if (!this.lines || !this.positions || !this.colors || !this.base || !this.lineMaterial) return;
    this.lines.visible = k > 0.01;
    if (!this.lines.visible) return;

    this.lineMaterial.opacity = Math.min(k * 1.2, 1);
    const travel = (Math.max(worldSpeed, 60) * HYPER.speed * (0.4 + k)) * dt;
    const length = HYPER.length * k;
    const count = this.base.length / 3;
    for (let i = 0; i < count; i += 1) {
      let z = this.base[i * 3 + 2]! + travel;
      if (z > -1) z -= HYPER.depth;
      this.base[i * 3 + 2] = z;
      const x = this.base[i * 3]!;
      const y = this.base[i * 3 + 1]!;
      const j = i * 6;
      this.positions[j] = x;
      this.positions[j + 1] = y;
      this.positions[j + 2] = z;
      this.positions[j + 3] = x;
      this.positions[j + 4] = y;
      this.positions[j + 5] = Math.min(z + length, -0.7);

      // Bright at the near end, dark at the far: a streak, not a rod. Nearer
      // the axis runs white; the outer tube takes the burn's colour.
      const outer = (Math.hypot(x, y) - HYPER.radiusMin) / (HYPER.radiusMax - HYPER.radiusMin);
      scratch.copy(coreColor).lerp(edgeColor, outer).lerp(plasmaColor, this.plasma * outer);
      const fade = 1 - Math.min(-z / HYPER.depth, 1);
      this.colors[j] = 0;
      this.colors[j + 1] = 0;
      this.colors[j + 2] = 0;
      this.colors[j + 3] = scratch.r * fade;
      this.colors[j + 4] = scratch.g * fade;
      this.colors[j + 5] = scratch.b * fade;
    }
    this.lineGeometry!.getAttribute("position").needsUpdate = true;
    this.lineGeometry!.getAttribute("color").needsUpdate = true;
  }

  dispose(): void {
    this.lineGeometry?.dispose();
    this.lineMaterial?.dispose();
    this.edgeGeometry?.dispose();
    this.edgeMaterial?.dispose();
    this.edgeTexture?.dispose();
    this.group.clear();
  }
}

/**
 * The streaked rim: radial lines of light that are nothing at the centre and
 * everything at the edge, so the ship and the lanes stay clear.
 */
function drawEdge(random: () => number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const r = size / 2;
    ctx.translate(r, r);
    for (let i = 0; i < 90; i += 1) {
      const a = random() * Math.PI * 2;
      const inner = r * (0.45 + random() * 0.35);
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + random() * 0.6})`;
      ctx.lineWidth = 0.6 + random() * 2.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5);
      ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createRadialGradient(r, r, r * 0.35, r, r, r * 1.2);
    mask.addColorStop(0, "rgba(255,255,255,0)");
    mask.addColorStop(0.5, "rgba(255,255,255,0.5)");
    mask.addColorStop(1, "rgba(255,255,255,1)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.center.set(0.5, 0.5);
  return texture;
}
