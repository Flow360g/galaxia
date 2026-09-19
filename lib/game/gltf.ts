import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PERF } from "./Tuning";

/**
 * Load a GLB and re-materialise it as flat Lambert, normalised so its
 * longest axis measures `length` and centred on its bounds.
 *
 * Resolves null on any failure so callers can fall back to a stand-in shape
 * rather than a hole in the scene. The README bans PBR on mobile; Lambert
 * with the same atlas keeps the authored colours at a fraction of the cost.
 *
 * A model authored as one mesh per colour is collapsed into a single mesh
 * with the colours baked into vertices first, see `mergeByColour`. Without
 * that a detailed hull costs a draw call per part and a single ship can spend
 * the whole frame budget on its own.
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

  const source: THREE.Object3D = gltf.scene;
  const disposables: Array<{ dispose(): void }> = [];
  const materials: THREE.MeshLambertMaterial[] = [];

  const merged = mergeByColour(source, disposables, materials);
  const model = merged ?? source;

  if (!merged) {
    source.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      // Not every GLB ships normals, and Lambert with no normals shades to
      // pure black however much light is on it. Derive them from the geometry.
      if (!object.geometry.getAttribute("normal")) object.geometry.computeVertexNormals();
      const material = object.material as THREE.MeshStandardMaterial;
      const lambert = new THREE.MeshLambertMaterial({
        map: material.map ?? null,
        color: material.color,
      });
      object.material = lambert;
      materials.push(lambert);
      disposables.push(object.geometry, lambert);
      if (material.map) disposables.push(material.map);
      material.dispose();
    });
  }

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

/**
 * Collapse a many-part, untextured model into one mesh, with each part's
 * material colour written into its vertices.
 *
 * Some GLBs (anything exported from a voxel or an OBJ-per-colour pipeline)
 * carry dozens of small meshes, one per material. three.js draws each of
 * those separately, so a 65-part hull is 65 draw calls out of a budget of
 * sixty for the entire scene. Merged, it is one, and it looks identical:
 * flat-shaded Lambert reading a per-vertex colour is the same shading it had
 * reading a per-material one.
 *
 * Declines to merge (returning null) when the model is already cheap or when
 * anything in it is textured, since a texture cannot be baked into a vertex
 * colour without an atlas the loader has no business building.
 */
function mergeByColour(
  source: THREE.Object3D,
  disposables: Array<{ dispose(): void }>,
  materials: THREE.MeshLambertMaterial[],
): THREE.Object3D | null {
  const meshes: THREE.Mesh[] = [];
  let textured = false;

  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes.push(object);
    const material = object.material as THREE.MeshStandardMaterial;
    if (material.map) textured = true;
  });

  if (textured || meshes.length <= PERF.mergeMeshesAbove) return null;

  source.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];

  for (const mesh of meshes) {
    const material = mesh.material as THREE.MeshStandardMaterial;

    // Non-indexed throughout so every part has the same attribute layout,
    // which is what `mergeGeometries` insists on.
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();

    // Keep only what the merged material reads. A stray UV or tangent on one
    // part and not the next is enough to fail the merge.
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
    }

    geometry.applyMatrix4(mesh.matrixWorld);

    const count = geometry.getAttribute("position").count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colours[i * 3] = material.color.r;
      colours[i * 3 + 1] = material.color.g;
      colours[i * 3 + 2] = material.color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

    parts.push(geometry);
    mesh.geometry.dispose();
    material.dispose();
  }

  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) return null;

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  materials.push(material);
  disposables.push(geometry, material);

  // A group, not the bare mesh: the caller re-parents and offsets what it
  // gets back, and every other path here hands it a container.
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  return group;
}
