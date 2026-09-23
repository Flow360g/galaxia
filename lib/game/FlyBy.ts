import * as THREE from "three";
import { buildRockGeometry } from "./AsteroidField";
import { CAMERA, COLOR, FLYBY } from "./Tuning";
import type { QualityTier } from "./types";

/**
 * Scale: now and then a huge rock sweeps past close to the lens.
 *
 * The belt is a crowd of pebbles at a distance; one boulder the size of a
 * building tearing past a few metres off the wing is what tells the player how
 * fast they are actually going. Held to the comet gate: a fly-by only starts
 * between questions, and it always passes outside the lane corridor, so it can
 * never be read as an answer. Timing and shape come off the sky's seeded
 * stream.
 */

interface Rock {
  mesh: THREE.Mesh;
  live: boolean;
  spinX: number;
  spinY: number;
}

export class FlyBy {
  readonly group = new THREE.Group();

  private readonly rocks: Rock[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly material: THREE.MeshLambertMaterial;
  private wait: number;

  constructor(tier: QualityTier, private readonly random: () => number) {
    this.material = new THREE.MeshLambertMaterial({ color: COLOR.body, flatShading: true });
    const count = FLYBY.count[tier] ?? 0;
    for (let i = 0; i < count; i += 1) {
      const geometry = buildRockGeometry(random);
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.visible = false;
      this.group.add(mesh);
      this.rocks.push({ mesh, live: false, spinX: 0, spinY: 0 });
    }
    this.wait = this.interval();
  }

  private interval(): number {
    return FLYBY.intervalMin + (FLYBY.intervalMax - FLYBY.intervalMin) * this.random();
  }

  /**
   * @param calm        no question and no verdict on screen
   * @param worldSpeed  world units per second
   */
  update(dt: number, calm: boolean, worldSpeed: number): void {
    if (this.rocks.length === 0) return;
    if (calm) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = this.interval();
        this.launch();
      }
    }

    const travel = (worldSpeed + FLYBY.speed) * dt;
    for (const rock of this.rocks) {
      if (!rock.live) continue;
      rock.mesh.position.z += travel;
      rock.mesh.rotation.x += rock.spinX * dt;
      rock.mesh.rotation.y += rock.spinY * dt;
      if (rock.mesh.position.z > CAMERA.offsetZ + 12) {
        rock.live = false;
        rock.mesh.visible = false;
      }
    }
  }

  private launch(): void {
    const rock = this.rocks.find((r) => !r.live);
    if (!rock) return;
    const r = this.random;
    const side = r() < 0.5 ? -1 : 1;
    const scale = FLYBY.scaleMin + (FLYBY.scaleMax - FLYBY.scaleMin) * r();
    rock.mesh.position.set(
      side * (FLYBY.xMin + (FLYBY.xMax - FLYBY.xMin) * r() + scale * 0.5),
      FLYBY.yMin + (FLYBY.yMax - FLYBY.yMin) * r(),
      FLYBY.spawnZ,
    );
    rock.mesh.scale.set(scale, scale * (0.7 + 0.4 * r()), scale * (0.8 + 0.4 * r()));
    rock.mesh.rotation.set(r() * 6, r() * 6, r() * 6);
    rock.spinX = (r() * 2 - 1) * FLYBY.spin;
    rock.spinY = (r() * 2 - 1) * FLYBY.spin;
    rock.live = true;
    rock.mesh.visible = true;
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.material.dispose();
    this.group.clear();
  }
}
