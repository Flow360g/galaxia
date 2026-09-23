import * as THREE from "three";
import { disposeGlow, glowMaterial, glowSprite, glowTexture } from "./glow";
import { loadLambertModel } from "./gltf";
import { ALIEN, COLOR, VECTOR } from "./Tuning";

/**
 * The alien scout of Stage 2.
 *
 * Warps in at the waypoint, takes station ahead of the ship and holds there,
 * drifting slowly so its rest position never gives the answer away. On a
 * vector lock it slides to the truth: that is the moment the answer is shown,
 * and the beam is already on its way. A hit rocks it and leaves it burning; a
 * kill breaks it up for good; a miss and it returns fire.
 *
 * The scout IS the model. There is no field, halo or wireframe around it: it
 * is the one thing the player aims at for a whole encounter, so it is lit,
 * near, and big enough to read as a ship. A flat-shaded octahedron stands in
 * only until the GLB lands.
 */

const contactColor = new THREE.Color(COLOR.contact);
const damageColor = new THREE.Color(COLOR.neg);
const scratchBox = new THREE.Box3();

type Mode = "idle" | "warpIn" | "station" | "reveal" | "destroyed" | "glanced" | "warpOut";

export class Alien {
  readonly group = new THREE.Group();
  /** True from warp-in until it is destroyed or warps out. */
  present = false;
  /** True once a kill has broken it up. It does not come back. */
  destroyed = false;

  private readonly body = new THREE.Group();
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
  private driftPhase = 0;
  /** Damage flash, 1 just after a hit, decaying to 0. */
  private glow = 0;
  /** Which way a glancing hit knocked it. */
  private knock = 0;
  /** Current hull opacity, which the lights follow out on a warp or a kill. */
  private opacity = 1;

  /**
   * Running lights: every beacon in one point cloud, brightness carried in
   * vertex colour (additive, so black is off). One draw call for the lot.
   */
  private readonly lights: THREE.Points;
  private readonly lightColors: Float32Array;
  private readonly lightGeometry: THREE.BufferGeometry;
  private readonly lightMaterial: THREE.PointsMaterial;
  /** The soft violet pool of light under the hull. */
  private readonly underglow: THREE.Sprite;
  private readonly underglowMaterial: THREE.SpriteMaterial;

  constructor(random: () => number) {
    this.group.add(this.body);
    this.driftPhase = random() * Math.PI * 2;

    // The stand-in hull lives until the GLB replaces it; a run that reaches
    // the alien before the fetch lands still has something to shoot at.
    const geometry = new THREE.OctahedronGeometry(1, 0);
    const material = new THREE.MeshLambertMaterial({
      color: 0x6f5aa8,
      emissive: COLOR.contact,
      emissiveIntensity: 0.3,
      flatShading: true,
      transparent: true,
    });
    const hull = new THREE.Mesh(geometry, material);
    hull.scale.set(ALIEN.modelLength * 0.42, ALIEN.modelLength * 0.17, ALIEN.modelLength * 0.6);
    this.body.add(hull);
    this.materials = [material];
    this.disposables = [geometry, material];

    const count = ALIEN.lights.length;
    this.lightColors = new Float32Array(count * 3);
    this.lightGeometry = new THREE.BufferGeometry();
    this.lightGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    this.lightGeometry.setAttribute("color", new THREE.BufferAttribute(this.lightColors, 3));
    this.lightMaterial = new THREE.PointsMaterial({
      map: glowTexture(),
      size: ALIEN.lightSize,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.lights = new THREE.Points(this.lightGeometry, this.lightMaterial);
    this.lights.frustumCulled = false;

    this.underglowMaterial = glowMaterial(COLOR.contact, ALIEN.underglowOpacity);
    this.underglow = glowSprite(
      this.underglowMaterial,
      ALIEN.modelLength * ALIEN.underglowScale,
    );

    scratchBox.setFromObject(hull);
    this.placeLights(scratchBox);

    this.group.visible = false;
    void this.loadModel();
  }

  /** Stand the beacons and the underglow on the hull's own extents. */
  private placeLights(box: THREE.Box3): void {
    const position = this.lightGeometry.getAttribute("position") as THREE.BufferAttribute;
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const hx = (box.max.x - box.min.x) / 2;
    const hy = (box.max.y - box.min.y) / 2;
    const hz = (box.max.z - box.min.z) / 2;
    ALIEN.lights.forEach((light, i) => {
      position.setXYZ(i, cx + light.x * hx, cy + light.y * hy, cz + light.z * hz);
    });
    position.needsUpdate = true;
    this.underglow.position.set(cx, box.min.y, cz);
    this.body.add(this.lights, this.underglow);
  }

  private async loadModel(): Promise<void> {
    const loaded = await loadLambertModel(ALIEN.modelUrl, ALIEN.modelLength, Math.PI);
    if (!loaded || this.disposed) return;
    for (const material of loaded.materials) {
      material.transparent = true;
      material.emissive.setHex(COLOR.contact);
      material.emissiveIntensity = ALIEN.restEmissive;
    }
    scratchBox.setFromObject(loaded.group);
    this.body.clear();
    this.disposables.forEach((item) => item.dispose());
    this.body.add(loaded.group);
    this.materials = loaded.materials;
    this.disposables = [...loaded.disposables];
    this.placeLights(scratchBox);
    this.setOpacity(1);
  }

  private setOpacity(opacity: number): void {
    this.opacity = opacity;
    for (const material of this.materials) material.opacity = opacity;
  }

  /**
   * Strobe the beacons and breathe the underglow. A hit flares every light
   * at once; a kill makes them stutter as the hull comes apart.
   */
  private updateLights(): void {
    const period = ALIEN.lightPeriod;
    const stutter =
      this.mode === "destroyed" ? (Math.sin(this.elapsed * 47) > 0 ? 1 : 0.15) : 1;
    const level = this.opacity * stutter;
    ALIEN.lights.forEach((light, i) => {
      const cycle = (this.elapsed / period + light.phase) % 1;
      const flash = Math.exp(-cycle * period * ALIEN.lightDecay);
      const b =
        Math.min(ALIEN.lightRest + (1 - ALIEN.lightRest) * Math.max(flash, this.glow), 1) *
        level;
      this.lightColors[i * 3] = contactColor.r * b;
      this.lightColors[i * 3 + 1] = contactColor.g * b;
      this.lightColors[i * 3 + 2] = contactColor.b * b;
    });
    this.lightGeometry.getAttribute("color").needsUpdate = true;

    const pulse = 1 + Math.sin(this.elapsed * ALIEN.underglowRate * Math.PI * 2) * ALIEN.underglowPulse;
    this.underglowMaterial.opacity = ALIEN.underglowOpacity * pulse * level * (1 + this.glow);
  }

  /** Warp in from the far distance and take station at `holdZ`. */
  warpIn(holdZ: number): void {
    if (this.destroyed) return;
    this.present = true;
    this.holdZ = holdZ;
    this.mode = "warpIn";
    this.t = 0;
    this.seconds = ALIEN.warpSeconds;
    this.glow = 0;
    this.setOpacity(1);
    this.group.visible = true;
    this.group.position.set(-18, VECTOR.holdY + 6, ALIEN.warpFromZ);
    this.group.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
  }

  /** Re-station at a new hold (the second vector comes in closer). */
  station(holdZ: number): void {
    if (this.destroyed) return;
    if (!this.present) {
      this.warpIn(holdZ);
      return;
    }
    this.holdZ = holdZ;
    this.mode = "station";
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
    this.setOpacity(1);
    this.group.visible = true;
  }

  /** The player locked. Slide to the truth: this is the answer being shown. */
  reveal(x: number): void {
    if (!this.present) return;
    this.mode = "reveal";
    this.t = 0;
    this.seconds = ALIEN.decloakSeconds;
    this.fromX = this.group.position.x;
    this.toX = x;
    this.setOpacity(1);
  }

  /** Beam contact. A kill breaks it up; a glance rocks it and leaves it lit. */
  hit(kind: "direct" | "glance"): void {
    if (!this.present) return;
    this.glow = 1;
    this.setOpacity(1);
    if (kind === "direct") {
      this.mode = "destroyed";
      this.t = 0;
      this.seconds = ALIEN.destroySeconds;
      this.destroyed = true;
      return;
    }
    this.mode = "glanced";
    this.t = 0;
    this.seconds = ALIEN.glanceSeconds;
    this.knock = this.group.position.x >= 0 ? 1 : -1;
  }

  /** A miss: a recoil kick as it fires back. */
  returnFire(): void {
    if (!this.present) return;
    this.group.position.z -= 2.5;
  }

  warpOut(): void {
    if (!this.present || this.destroyed) return;
    this.mode = "warpOut";
    this.t = 0;
    this.seconds = ALIEN.warpOutSeconds;
  }

  /** Where the beam should land: the hull centre. */
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

    if (this.glow > 0) {
      this.glow = Math.max(this.glow - dt / 0.6, 0);
      // The hit flashes the hull red, then it settles back to its own violet.
      for (const material of this.materials) {
        material.emissive.copy(contactColor).lerp(damageColor, Math.min(this.glow * 1.5, 1));
        material.emissiveIntensity = Math.max(this.glow * 1.6, ALIEN.restEmissive);
      }
    }

    switch (this.mode) {
      case "warpIn": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        // Overshoot past the hold, then bank back: an arrival, not a slide.
        const e = 1 - Math.pow(1 - this.t, 3);
        const overshoot = Math.sin(this.t * Math.PI) * 30;
        g.position.z = ALIEN.warpFromZ + (this.holdZ - ALIEN.warpFromZ) * e + overshoot;
        g.position.x = -18 + (drift + 18) * e;
        g.position.y = VECTOR.holdY + 6 * (1 - e);
        this.body.rotation.z = Math.sin(this.t * Math.PI) * 0.9;
        if (this.t >= 1) this.mode = "station";
        break;
      }
      case "station": {
        const k = 1 - Math.exp(-2.5 * dt);
        g.position.z += (this.holdZ - g.position.z) * k;
        g.position.x += (drift - g.position.x) * k;
        g.position.y += (VECTOR.holdY - g.position.y) * k;
        // It is lit, not cloaked: the shimmer is an engine idling, not a field.
        this.setOpacity(
          ALIEN.holdOpacity + Math.sin(this.elapsed * ALIEN.cloakRate) * ALIEN.shimmer,
        );
        this.body.rotation.y = Math.sin(this.elapsed * ALIEN.idleSpin) * 0.35;
        this.body.rotation.z *= 1 - Math.min(dt * 4, 1);
        break;
      }
      case "reveal": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        const e = 1 - Math.pow(1 - this.t, 2);
        g.position.x = this.fromX + (this.toX - this.fromX) * e;
        this.body.rotation.z = (this.toX - this.fromX) * 0.02 * (1 - e);
        this.setOpacity(1);
        break;
      }
      case "destroyed": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        // Rock, swell, then collapse into the debris burst.
        const s = this.t < 0.3 ? 1 + this.t * 0.9 : Math.max(1.27 * (1 - (this.t - 0.3) / 0.7), 0);
        this.body.scale.setScalar(s);
        this.body.rotation.y += dt * 9;
        this.body.rotation.z += dt * 5;
        this.setOpacity(1 - this.t * this.t);
        if (this.t >= 1) {
          this.present = false;
          this.mode = "idle";
          g.visible = false;
        }
        break;
      }
      case "glanced": {
        // Struck, but still flying: knocked off station, tumbling, then it
        // pulls itself back level ready for the next vector.
        this.t = Math.min(this.t + dt / this.seconds, 1);
        const away = Math.sin(this.t * Math.PI);
        this.body.rotation.z += dt * 6 * (1 - this.t);
        g.position.x += this.knock * ALIEN.glanceKick * away * dt;
        g.position.z -= 6 * away * dt;
        this.setOpacity(1);
        if (this.t >= 1) this.mode = "station";
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

    if (this.present) this.updateLights();
  }

  dispose(): void {
    this.disposed = true;
    this.lightGeometry.dispose();
    disposeGlow(this.lightMaterial);
    disposeGlow(this.underglowMaterial);
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.body.clear();
    this.group.clear();
  }
}
