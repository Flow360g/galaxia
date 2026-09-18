import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Load a GLB and re-materialise it as flat Lambert, normalised so its
 * longest axis measures `length` and centred on its bounds.
 *
 * Resolves null on any failure so callers can fall back to a stand-in shape
 * rather than a hole in the scene. The README bans PBR on mobile; Lambert
 * with the same atlas keeps the authored colours at a fraction of the cost.
 */
export interface LoadedModel {
  group: THREE.Group;
  materials: THREE.MeshLambertMaterial[];
  disposables: Array<{ dispose(): void }>;
}

export async function loadLambertModel(
  url: string,
  length: number,
  yaw = 0,
): Promise<LoadedModel | null> {
  let gltf: Awaited<ReturnType<GLTFLoader["loadAsync"]>>;
  try {
    gltf = await new GLTFLoader().loadAsync(url);
  } catch {
    return null;
  }

  const model = gltf.scene;
  const disposables: Array<{ dispose(): void }> = [];
  const materials: THREE.MeshLambertMaterial[] = [];

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    // Not every GLB ships normals, and Lambert with no normals shades to
    // pure black however much light is on it. Derive them from the geometry.
    if (!object.geometry.getAttribute("normal")) object.geometry.computeVertexNormals();
    const source = object.material as THREE.MeshStandardMaterial;
    const material = new THREE.MeshLambertMaterial({
      map: source.map ?? null,
      color: source.color,
    });
    object.material = material;
    materials.push(material);
    disposables.push(object.geometry, material);
    if (source.map) disposables.push(source.map);
    source.dispose();
  });

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z, 1e-6);

  const group = new THREE.Group();
  model.position.copy(centre).multiplyScalar(-1);
  group.add(model);
  group.scale.setScalar(length / longest);
  group.rotation.y = yaw;

  return { group, materials, disposables };
}
