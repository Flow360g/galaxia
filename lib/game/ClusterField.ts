import * as THREE from "three";
import { buildRockGeometry } from "./AsteroidField";
import { CLUSTER, COLOR, ENCOUNTER, SHIP, WORLD } from "./Tuning";

/**
 * The six rocks of a Cluster, one per lane.
 *
 * All six look identical while the answer is open and loom together as
 * thrust drains, so nothing about the scene leaks which lanes are right. A
 * picked rock runs at the ship: a right one turns into a cyan plasma pod the
 * ship flies through; a wrong one turns red, holds just ahead for the verdict
 * beat, then strikes and shatters. When the encounter ends the rest stream
 * past and retire.
 *
 * One shared geometry, six meshes, six wireframes: twelve draw calls at most
 * while a cluster is live, well inside the budget.
 */

type Mode = "idle" | "hold" | "collect" | "menace" | "strike" | "pass" | "shatter" | "stream";

interface Lane {
  index: number;
  group: THREE.Group;
  material: THREE.MeshLambertMaterial;
  wire: THREE.LineBasicMaterial;
  mode: Mode;
  t: number;
  from: number;
  seconds: number;
  spin: { x: number; y: number; z: number };
}

/** Z a wrong rock holds at while the verdict lands, before the final strike. */
const MENACE_Z = -22;

export class ClusterField {
  readonly group = new THREE.Group();
  active = false;

  private readonly lanes: Lane[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly wireGeometry: THREE.BufferGeometry;
  private holdTarget: number = CLUSTER.holdFar;
  private elapsed = 0;

  constructor(random: () => number) {
    this.geometry = buildRockGeometry(random);
    this.wireGeometry = new THREE.EdgesGeometry(this.geometry, 18);

    for (let i = 0; i < CLUSTER.laneCount; i += 1) {
      const material = new THREE.MeshLambertMaterial({
        color: COLOR.panelLabel,
        flatShading: true,
      });
      const wire = new THREE.LineBasicMaterial({
        color: COLOR.accent,
        transparent: true,
        opacity: 0.9,
      });
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(this.geometry, material);
      const edges = new THREE.LineSegments(this.wireGeometry, wire);
      mesh.scale.setScalar(CLUSTER.rockRadius);
      edges.scale.setScalar(CLUSTER.rockRadius * 1.02);
      group.add(mesh, edges);
      group.visible = false;
      this.group.add(group);
      this.lanes.push({
        index: i,
        group,
        material,
        wire,
        mode: "idle",
        t: 0,
        from: 0,
        seconds: 1,
        spin: {
          x: (random() - 0.5) * 0.5,
          y: (random() - 0.5) * 0.5,
          z: (random() - 0.5) * 0.5,
        },
      });
    }
  }

  /** World X of a lane at the ship, spread across the corridor. */
  static laneX(lane: number): number {
    const count = CLUSTER.laneCount;
    const span = WORLD.corridorHalfWidth * CLUSTER.laneSpan;
    if (count <= 1) return 0;
    return -span + (2 * span * lane) / (count - 1);
  }

  /** Lane X at depth `z`: fanned out at the far hold, true lane at the ship. */
  private static laneXAt(lane: number, z: number): number {
    const depth = Math.min(Math.max(-z / -CLUSTER.holdFar, 0), 1);
    return ClusterField.laneX(lane) * (1 + (CLUSTER.farSpread - 1) * depth);
  }

  /** Call all six in at the far hold. */
  spawn(): void {
    this.active = true;
    this.holdTarget = CLUSTER.holdFar;
    this.lanes.forEach((lane, i) => {
      lane.mode = "hold";
      lane.t = 0;
      lane.group.visible = true;
      lane.group.scale.setScalar(1);
      const z = CLUSTER.holdFar - (i % 3) * 4;
      lane.group.position.set(ClusterField.laneXAt(i, z), ENCOUNTER.offsetY, z);
      lane.material.color.setHex(COLOR.panelLabel);
      lane.material.emissive.setHex(0x000000);
      lane.material.emissiveIntensity = 0;
      lane.wire.color.setHex(COLOR.accent);
      lane.wire.opacity = 0.9;
    });
  }

  /** 0 = full thrust (far), 1 = empty (close). */
  setLoom(progress: number): void {
    const t = progress < 0 ? 0 : progress > 1 ? 1 : progress;
    this.holdTarget = CLUSTER.holdFar + (CLUSTER.holdNear - CLUSTER.holdFar) * t;
  }

  /**
   * A lane was picked. A right rock runs to the ship over `seconds` and is
   * collected on arrival; a wrong one runs to the menace hold and waits for
   * `strike`.
   */
  pick(index: number, correct: boolean, seconds: number): void {
    const lane = this.lanes[index];
    if (!lane || !this.active) return;
    lane.mode = correct ? "collect" : "menace";
    lane.t = 0;
    lane.from = lane.group.position.z;
    lane.seconds = Math.max(seconds, 0.05);

    if (correct) {
      lane.material.color.setHex(0x0b3a44);
      lane.material.emissive.setHex(COLOR.cyan);
      lane.material.emissiveIntensity = 0.7;
      lane.wire.color.setHex(COLOR.cyan);
    } else {
      lane.material.color.setHex(COLOR.neg);
      lane.wire.color.setHex(COLOR.neg);
    }
    lane.wire.opacity = 1;
  }

  /** The pod was collected: it streams past the camera. */
  collect(index: number): void {
    const lane = this.lanes[index];
    if (!lane) return;
    lane.mode = "pass";
  }

  /** The wrong rock, or a timeout: the fatal lane strikes over `seconds`. */
  strike(index: number | null, seconds: number): void {
    const lane = index === null ? null : this.lanes[index];
    if (!lane) {
      this.stream();
      return;
    }
    lane.mode = "strike";
    lane.t = 0;
    lane.from = lane.group.position.z;
    lane.seconds = Math.max(seconds, 0.05);
    lane.material.color.setHex(COLOR.neg);
    lane.wire.color.setHex(COLOR.neg);
    this.stream(index);
  }

  /** Contact with the fatal rock: shatter it. */
  shatter(index: number): void {
    const lane = this.lanes[index];
    if (!lane) return;
    lane.mode = "shatter";
    lane.t = 0;
  }

  /** Every rock still holding streams past and retires (burn or timeout). */
  stream(except: number | null = null): void {
    this.lanes.forEach((lane, i) => {
      if (i === except) return;
      if (lane.mode === "hold" || lane.mode === "menace") lane.mode = "stream";
    });
  }

  /** World position of a lane's rock, for debris. */
  positionOf(index: number, out: THREE.Vector3): THREE.Vector3 {
    const lane = this.lanes[index];
    return lane ? out.copy(lane.group.position) : out.set(0, 0, 0);
  }

  update(dt: number, worldSpeed: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    let live = 0;

    for (const lane of this.lanes) {
      if (lane.mode === "idle") continue;
      live += 1;
      const g = lane.group;
      g.rotation.x += lane.spin.x * dt;
      g.rotation.y += lane.spin.y * dt;
      g.rotation.z += lane.spin.z * dt;

      switch (lane.mode) {
        case "hold": {
          const k = 1 - Math.exp(-1.8 * dt);
          g.position.z += (this.holdTarget - g.position.z) * k;
          g.position.x = ClusterField.laneXAt(lane.index, g.position.z);
          break;
        }
        case "collect": {
          lane.t = Math.min(lane.t + dt / lane.seconds, 1);
          const eased = lane.t * lane.t;
          g.position.z = lane.from + (SHIP.z + 1.5 - lane.from) * eased;
          g.position.x = ClusterField.laneXAt(lane.index, g.position.z);
          const pulse = 1 + Math.sin(this.elapsed * 14) * 0.08;
          g.scale.setScalar(pulse);
          break;
        }
        case "menace": {
          lane.t = Math.min(lane.t + dt / lane.seconds, 1);
          const eased = lane.t * lane.t;
          g.position.z = lane.from + (MENACE_Z - lane.from) * eased;
          g.position.x = ClusterField.laneXAt(lane.index, g.position.z);
          break;
        }
        case "strike": {
          lane.t = Math.min(lane.t + dt / lane.seconds, 1);
          const eased = lane.t * lane.t;
          g.position.z = lane.from + (SHIP.z + 1.5 - lane.from) * eased;
          g.position.x = ClusterField.laneXAt(lane.index, g.position.z);
          break;
        }
        case "pass":
          g.position.z += Math.max(worldSpeed, 60) * 1.6 * dt;
          if (g.position.z > WORLD.recycleDistance) this.retireLane(lane);
          break;
        case "stream":
          g.position.z += Math.max(worldSpeed, 40) * 1.3 * dt;
          if (g.position.z > WORLD.recycleDistance) this.retireLane(lane);
          break;
        case "shatter": {
          lane.t += dt / 0.32;
          if (lane.t >= 1) {
            this.retireLane(lane);
            break;
          }
          g.scale.setScalar(1 - lane.t * lane.t);
          g.rotation.y += dt * 9;
          g.position.z += worldSpeed * dt;
          break;
        }
      }
    }

    if (live === 0) this.active = false;
  }

  private retireLane(lane: Lane): void {
    lane.mode = "idle";
    lane.group.visible = false;
    lane.group.scale.setScalar(1);
  }

  retire(): void {
    this.lanes.forEach((lane) => this.retireLane(lane));
    this.active = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.wireGeometry.dispose();
    for (const lane of this.lanes) {
      lane.material.dispose();
      lane.wire.dispose();
    }
    this.group.clear();
  }
}
