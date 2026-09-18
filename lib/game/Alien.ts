import * as THREE from "three";
import { loadLambertModel } from "./gltf";
import { ALIEN, COLOR, ENCOUNTER, VECTOR } from "./Tuning";

/**
 * The alien scout of Stage 2.
 *
 * Warps in at the waypoint, takes station ahead of the ship and cloaks to a
 * shimmer, drifting so its rest position never gives the answer away. On a
 * vector lock it decloaks at the truth. A direct hit shatters it; a glancing
 * hit sends it spinning off; a miss and it returns fire. Between vectors it
 * re-stations closer. After the last one it warps out.
 *
 * A GLB if `ALIEN.modelUrl` loads, otherwise a flat-shaded octahedron hull.
 */

type Mode = "idle" | "warpIn" | "station" | "decloak" | "destroyed" | "glanced" | "warpOut";

export class Alien {
  readonly group = new THREE.Group();
  /** True from warp-in until warp-out, whatever the alien has been through. */
  present = false;

  private readonly body = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private materials: THREE.MeshLambertMaterial[] = [];
  private disposables: Array<{ dispose(): void }> = [];
  private disposed = false;

  private mode: Mode = "idle";
  private t = 0;
  private seconds = 1;
  private elapsed = 0;
  private holdZ: number = VECTOR.holdFar[0];
  private fromX = 0;
  private toX = 0;
  private cloaked = false;
  private driftPhase = 0;

  constructor(random: () => number) {
    this.group.add(this.body);
    this.driftPhase = random() * Math.PI * 2;

    // The fallback hull lives until the GLB replaces it; a run that starts
    // before the fetch lands still has something to shoot at.
    const geometry = new THREE.OctahedronGeometry(1, 0);
    const material = new THREE.MeshLambertMaterial({
      color: 0x3a2a5a,
      emissive: COLOR.anomaly,
      emissiveIntensity: 0.35,
      flatShading: true,
      transparent: true,
    });
    const hull = new THREE.Mesh(geometry, material);
    hull.scale.set(2.2, 0.9, 3.2);
    this.body.add(hull);
    this.materials = [material];
    this.disposables = [geometry, material];

    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: COLOR.anomaly,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
      fog: false,
    });
    this.ring = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), this.ringMaterial);
    this.ring.scale.set(3.6, 2.2, 4.4);
    this.group.add(this.ring);
    this.disposables.push(this.ring.geometry, this.ringMaterial);

    this.group.visible = false;
    void this.loadModel();
  }

  private async loadModel(): Promise<void> {
    const loaded = await loadLambertModel(ALIEN.modelUrl, ALIEN.modelLength, Math.PI);
    if (!loaded || this.disposed) return;
    for (const material of loaded.materials) material.transparent = true;
    this.body.clear();
    this.disposables.forEach((item) => item.dispose());
    this.body.add(loaded.group);
    this.materials = loaded.materials;
    this.disposables = [...loaded.disposables, this.ring.geometry, this.ringMaterial];
    this.setOpacity(this.cloaked ? ALIEN.cloakOpacity : 1);
  }

  private setOpacity(opacity: number): void {
    for (const material of this.materials) material.opacity = opacity;
  }

  /** Warp in from the far distance and take station at `holdZ`, then cloak. */
  warpIn(holdZ: number): void {
    this.present = true;
    this.holdZ = holdZ;
    this.mode = "warpIn";
    this.t = 0;
    this.seconds = ALIEN.warpSeconds;
    this.cloaked = false;
    this.setOpacity(1);
    this.group.visible = true;
    this.group.position.set(-18, ENCOUNTER.offsetY + 6, ALIEN.warpFromZ);
    this.group.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
    this.ringMaterial.opacity = 0.9;
  }

  /** Re-station at a new hold (the second vector comes in closer). */
  station(holdZ: number): void {
    if (!this.present) {
      this.warpIn(holdZ);
      return;
    }
    this.holdZ = holdZ;
    this.mode = "station";
    this.cloaked = true;
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
    this.group.visible = true;
  }

  /** The player locked. Slide to the truth and drop the cloak. */
  decloak(x: number): void {
    if (!this.present) return;
    this.mode = "decloak";
    this.t = 0;
    this.seconds = ALIEN.decloakSeconds;
    this.fromX = this.group.position.x;
    this.toX = x;
    this.cloaked = false;
  }

  /** Beam contact. */
  hit(kind: "direct" | "glance"): void {
    if (!this.present) return;
    this.mode = kind === "direct" ? "destroyed" : "glanced";
    this.t = 0;
    this.seconds = kind === "direct" ? 0.55 : 1.3;
    this.ringMaterial.opacity = 1;
    this.setOpacity(1);
  }

  /** A miss: a recoil kick as it fires back. */
  returnFire(): void {
    if (!this.present) return;
    this.group.position.z -= 2.5;
    this.ringMaterial.opacity = 0.7;
  }

  warpOut(): void {
    if (!this.present) return;
    this.mode = "warpOut";
    this.t = 0;
    this.seconds = ALIEN.warpOutSeconds;
    this.cloaked = false;
  }

  /** Where the beam should aim: the hull centre. */
  target(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.group.position);
  }

  update(dt: number): void {
    if (!this.present) return;
    this.elapsed += dt;
    const g = this.group;
    const drift =
      Math.sin(this.elapsed * VECTOR.driftRate * Math.PI * 2 + this.driftPhase) *
      VECTOR.driftAmplitude;

    // The ring is the cloak field: it breathes while cloaked, fades otherwise.
    if (this.mode === "station") {
      this.ringMaterial.opacity = 0.12 + (Math.sin(this.elapsed * 3) + 1) * 0.08;
    } else if (this.mode !== "destroyed") {
      this.ringMaterial.opacity *= Math.exp(-3 * dt);
    }

    switch (this.mode) {
      case "warpIn": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        // Overshoot past the hold, then bank back: an arrival, not a slide.
        const e = 1 - Math.pow(1 - this.t, 3);
        const overshoot = Math.sin(this.t * Math.PI) * 30;
        g.position.z = ALIEN.warpFromZ + (this.holdZ - ALIEN.warpFromZ) * e + overshoot;
        g.position.x = -18 + (drift + 18) * e;
        g.position.y = ENCOUNTER.offsetY + 6 * (1 - e);
        this.body.rotation.z = Math.sin(this.t * Math.PI) * 0.9;
        if (this.t >= 1) {
          this.mode = "station";
          this.cloaked = true;
        }
        break;
      }
      case "station": {
        const k = 1 - Math.exp(-2.5 * dt);
        g.position.z += (this.holdZ - g.position.z) * k;
        g.position.x += (drift - g.position.x) * k;
        g.position.y += (ENCOUNTER.offsetY - g.position.y) * k;
        const shimmer =
          ALIEN.cloakOpacity + (Math.sin(this.elapsed * ALIEN.cloakRate) + 1) * 0.5 * 0.22;
        this.setOpacity(shimmer);
        this.body.rotation.z *= 1 - Math.min(dt * 4, 1);
        break;
      }
      case "decloak": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        const e = 1 - Math.pow(1 - this.t, 2);
        g.position.x = this.fromX + (this.toX - this.fromX) * e;
        this.setOpacity(ALIEN.cloakOpacity + (1 - ALIEN.cloakOpacity) * e);
        this.ringMaterial.opacity = 0.6 * (1 - e);
        break;
      }
      case "destroyed": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        // Pop, then collapse.
        const s = this.t < 0.25 ? 1 + this.t * 2 : Math.max(1.5 * (1 - (this.t - 0.25) / 0.75), 0);
        this.body.scale.setScalar(s);
        this.body.rotation.y += dt * 12;
        this.ring.scale.setScalar(3.6 + this.t * 10);
        this.ringMaterial.opacity = 1 - this.t;
        if (this.t >= 1) this.hideFor("destroyed");
        break;
      }
      case "glanced": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        this.body.rotation.z += dt * 7;
        g.position.x += (this.toX < 0 ? 1 : -1) * 22 * dt;
        g.position.z -= 40 * dt;
        this.setOpacity(1 - this.t);
        if (this.t >= 1) this.hideFor("glanced");
        break;
      }
      case "warpOut": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        g.position.z -= (60 + this.t * 900) * dt;
        this.setOpacity(1 - this.t);
        if (this.t >= 1) {
          this.present = false;
          this.mode = "idle";
          g.visible = false;
        }
        break;
      }
      case "idle":
        break;
    }
  }

  /** Off screen but still "present" so the next vector can re-station it. */
  private hideFor(reason: "destroyed" | "glanced"): void {
    void reason;
    this.mode = "idle";
    this.group.visible = false;
    this.ring.scale.set(3.6, 2.2, 4.4);
    this.group.position.set(0, ENCOUNTER.offsetY, ALIEN.warpFromZ);
  }

  dispose(): void {
    this.disposed = true;
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.body.clear();
    this.group.clear();
  }
}
