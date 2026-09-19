import * as THREE from "three";
import { buildRockGeometry } from "./AsteroidField";
import { COLOR, LANE, SHIP } from "./Tuning";

/**
 * The one thing that comes at the ship after a lane is picked.
 *
 * Nothing is on screen while the question is open: the sky is the ambient
 * field and nothing else, so the scene never leaks which lanes are right and
 * a player is never looking at six rocks that imply six collisions. The
 * moment a lane is chosen, exactly one object is born far down that lane and
 * runs at the ship:
 *
 *   right lane -> a PLASMA POD, cyan and glowing, flown straight through;
 *   wrong lane -> a BOULDER, big enough to fill the lane, which pulls up just
 *                 ahead for a beat and then strikes.
 *
 * Two meshes, two wireframes, one of each visible at a time: four draw calls
 * at the very most.
 */

type Mode = "idle" | "run" | "hold" | "strike" | "pass" | "shatter";

export type IncomingKind = "pod" | "rock";

export class Incoming {
  readonly group = new THREE.Group();
  active = false;

  private mode: Mode = "idle";
  private kind: IncomingKind = "pod";
  private laneX = 0;
  private t = 0;
  private from = 0;
  private seconds = 1;
  private elapsed = 0;

  private readonly rock: THREE.Group;
  private readonly pod: THREE.Group;
  private readonly rockGeometry: THREE.BufferGeometry;
  private readonly rockWireGeometry: THREE.BufferGeometry;
  private readonly rockMaterial: THREE.MeshLambertMaterial;
  private readonly rockWire: THREE.LineBasicMaterial;
  private readonly podGeometry: THREE.BufferGeometry;
  private readonly podShellGeometry: THREE.BufferGeometry;
  private readonly podMaterial: THREE.MeshBasicMaterial;
  private readonly podShell: THREE.MeshBasicMaterial;

  constructor(random: () => number) {
    this.rockGeometry = buildRockGeometry(random);
    this.rockWireGeometry = new THREE.EdgesGeometry(this.rockGeometry, 18);
    this.rockMaterial = new THREE.MeshLambertMaterial({
      color: COLOR.panelLabel,
      flatShading: true,
    });
    this.rockWire = new THREE.LineBasicMaterial({
      color: COLOR.neg,
      transparent: true,
      opacity: 0.9,
    });
    this.rock = new THREE.Group();
    const rockMesh = new THREE.Mesh(this.rockGeometry, this.rockMaterial);
    const rockEdges = new THREE.LineSegments(this.rockWireGeometry, this.rockWire);
    rockMesh.scale.setScalar(LANE.rockRadius);
    rockEdges.scale.setScalar(LANE.rockRadius * 1.02);
    this.rock.add(rockMesh, rockEdges);

    // The pod is deliberately nothing like a rock: an octahedron core inside
    // a wider additive shell, so it reads as a pickup at a glance.
    this.podGeometry = new THREE.OctahedronGeometry(LANE.podRadius, 0);
    this.podShellGeometry = new THREE.IcosahedronGeometry(LANE.podRadius * 1.9, 1);
    this.podMaterial = new THREE.MeshBasicMaterial({ color: COLOR.cyan, fog: false });
    this.podShell = new THREE.MeshBasicMaterial({
      color: COLOR.cyan,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
      fog: false,
    });
    this.pod = new THREE.Group();
    this.pod.add(
      new THREE.Mesh(this.podGeometry, this.podMaterial),
      new THREE.Mesh(this.podShellGeometry, this.podShell),
    );

    this.rock.visible = false;
    this.pod.visible = false;
    this.group.add(this.rock, this.pod);
    this.group.visible = false;
  }

  private get body(): THREE.Group {
    return this.kind === "pod" ? this.pod : this.rock;
  }

  /**
   * A lane was picked. Launch the pod or the boulder down it.
   *
   * @param x        world X of the lane at the ship's plane
   * @param seconds  how long the run-in takes
   */
  launch(kind: IncomingKind, x: number, seconds: number): void {
    this.retire();
    this.kind = kind;
    this.laneX = x;
    this.mode = "run";
    this.t = 0;
    this.from = LANE.spawnZ;
    this.seconds = Math.max(seconds, 0.05);
    this.active = true;

    this.group.visible = true;
    this.body.visible = true;
    this.body.scale.setScalar(1);
    this.body.rotation.set(0, 0, 0);
    this.group.position.set(this.xAt(LANE.spawnZ), this.yFor(), LANE.spawnZ);
  }

  /** The pod reached the ship: flare it and let it stream past the camera. */
  collect(): void {
    if (this.kind !== "pod") return;
    this.mode = "pass";
  }

  /** The boulder makes its final run at the hull over `seconds`. */
  strike(seconds: number): void {
    if (!this.active || this.kind !== "rock") return;
    this.mode = "strike";
    this.t = 0;
    this.from = this.group.position.z;
    this.seconds = Math.max(seconds, 0.05);
  }

  /** Contact. Break the boulder up. */
  shatter(): void {
    if (this.kind !== "rock") return;
    this.mode = "shatter";
    this.t = 0;
  }

  /** Where the object is right now, for the debris burst. */
  position(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.group.position);
  }

  update(dt: number, worldSpeed: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    const g = this.group;

    if (this.kind === "rock") {
      this.rock.rotation.x += dt * 0.5;
      this.rock.rotation.y += dt * 0.7;
    } else {
      this.pod.rotation.y += dt * 2.4;
      this.pod.rotation.x += dt * 1.1;
    }

    switch (this.mode) {
      case "run": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        // Accelerating in: slow at the vanishing point, fast at the hull.
        const eased = this.t * this.t;
        const target = this.kind === "pod" ? SHIP.z : LANE.menaceZ;
        g.position.z = this.from + (target - this.from) * eased;
        g.position.x = this.xAt(g.position.z);
        if (this.kind === "pod") {
          const pulse = 1 + Math.sin(this.elapsed * 13) * 0.12;
          this.pod.scale.setScalar(pulse);
        }
        // Arrived: a pod waits at the hull for the collect beat, a boulder
        // hangs at the menace mark until the strike is called.
        if (this.t >= 1) this.mode = "hold";
        break;
      }
      case "hold":
        if (this.kind === "rock") g.position.z = LANE.menaceZ + Math.sin(this.elapsed * 6) * 0.4;
        else this.pod.scale.setScalar(1 + Math.sin(this.elapsed * 13) * 0.12);
        break;
      case "strike": {
        this.t = Math.min(this.t + dt / this.seconds, 1);
        const eased = this.t * this.t;
        // Ends with the rock's face just into the nose, on the same beat the
        // run calls contact. See `LANE.strikeOverlap`.
        const contactZ = SHIP.noseZ - LANE.rockRadius + LANE.strikeOverlap;
        g.position.z = this.from + (contactZ - this.from) * eased;
        g.position.x = this.xAt(g.position.z);
        break;
      }
      case "pass":
        g.position.z += Math.max(worldSpeed, 70) * 1.8 * dt;
        this.pod.scale.multiplyScalar(1 + dt * 2.6);
        this.podShell.opacity = Math.max(this.podShell.opacity - dt * 1.6, 0);
        if (g.position.z > 20) this.retire();
        break;
      case "shatter": {
        this.t += dt / LANE.shatterSeconds;
        if (this.t >= 1) {
          this.retire();
          break;
        }
        // Linear, not eased: half gone at half time, so the remnant is never
        // still rock-sized as it drifts back over the hull.
        this.rock.scale.setScalar(1 - this.t);
        this.rock.rotation.y += dt * 10;
        g.position.z += worldSpeed * LANE.shatterDrift * dt;
        break;
      }
    }
  }

  /** Lane X at depth z: born fanned out, converging on the true lane. */
  private xAt(z: number): number {
    const depth = Math.min(Math.max(z / LANE.spawnZ, 0), 1);
    return this.laneX * (1 + (LANE.farSpread - 1) * depth);
  }

  /**
   * Dead on the ship's plane. The camera aims above the ship, so an object
   * out at the vanishing point still appears high in frame and drops toward
   * the hull as it closes: the collision course draws itself.
   */
  private yFor(): number {
    return 0;
  }

  retire(): void {
    this.mode = "idle";
    this.active = false;
    this.group.visible = false;
    this.rock.visible = false;
    this.pod.visible = false;
    this.rock.scale.setScalar(1);
    this.pod.scale.setScalar(1);
    this.podShell.opacity = 0.35;
  }

  dispose(): void {
    this.rockGeometry.dispose();
    this.rockWireGeometry.dispose();
    this.rockMaterial.dispose();
    this.rockWire.dispose();
    this.podGeometry.dispose();
    this.podShellGeometry.dispose();
    this.podMaterial.dispose();
    this.podShell.dispose();
    this.group.clear();
  }
}
