import * as THREE from "three";
import { BACKDROP, CAMERA } from "./Tuning";

/**
 * The painted sky: one textured plane parented to the camera, far enough back
 * that everything else draws in front of it.
 *
 * A camera child rather than `scene.background` so it can be sized to cover
 * the frustum at any aspect (a portrait image on a landscape screen would
 * otherwise stretch) and drift slightly with the ship for a parallax read.
 */
export class Backdrop {
  readonly mesh: THREE.Mesh;

  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private texture: THREE.Texture | null = null;
  private aspect = 1;

  constructor() {
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      fog: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.z = -BACKDROP.depth;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
  }

  load(): Promise<void> {
    return new Promise((resolve) => {
      new THREE.TextureLoader().load(
        BACKDROP.url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.generateMipmaps = false;
          texture.minFilter = THREE.LinearFilter;
          this.texture = texture;
          this.material.map = texture;
          this.material.color.setHex(0xffffff);
          this.material.needsUpdate = true;
          this.mesh.visible = true;
          resolve();
        },
        undefined,
        // A missing image is not fatal: the clear colour still reads as space.
        () => resolve(),
      );
    });
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.fit();
  }

  /** Scale the plane to cover the frustum at its depth, at the widest FOV. */
  private fit(): void {
    const halfFov = THREE.MathUtils.degToRad(CAMERA.fovAtMaxSpeed) / 2;
    const needHeight = 2 * BACKDROP.depth * Math.tan(halfFov) * BACKDROP.coverMargin;
    const needWidth = needHeight * this.aspect;

    // Cover: scale the image uniformly until both axes are filled.
    const scale = Math.max(needWidth / BACKDROP.aspect, needHeight);
    this.mesh.scale.set(scale * BACKDROP.aspect, scale, 1);
  }

  update(shipX: number, shipY: number): void {
    this.mesh.position.x = -shipX * BACKDROP.parallax;
    this.mesh.position.y = -shipY * BACKDROP.parallax;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}
