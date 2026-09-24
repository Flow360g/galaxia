import * as THREE from "three";
import {
  contactShadowTexture,
  deckMarkingsTexture,
  deckTexture,
  wallTexture,
} from "./bayTextures";
import { loadLambertModel } from "./gltf";
import { detectTier, prefersReducedMotion } from "./quality";
import { DEFAULT_SHIP, type ShipSpec } from "./ships";
import { BACKDROP, COLOR, HANGAR, PERF } from "./Tuning";

/**
 * The ship bay: a launch bay inside the carrier, with one hull on the pad.
 *
 * A second, much smaller imperative shell alongside `Engine`. Same rules for
 * materials (Lambert, flat shading, no shadows) and the same ownership of its
 * own canvas, but there is no run, no treadmill and no game state: a frame
 * here is a rotation, a bob, and whatever the player is dragging.
 *
 * Three things it does differently from the flight, all deliberate:
 *
 *  - **It renders sharp.** Pixel ratio comes from `HANGAR.dprCap` and the
 *    device, not from the flight's quality tier. The tier decides detail
 *    COUNTS (ribs, floodlights, texture size) and nothing else. A hull the
 *    player is being asked to buy cannot be the blurriest thing in the game.
 *  - **It is lit to be looked at.** Neutral key and fill, a cool grey ambient
 *    and only a trace of cyan on the rim, so a white panel reads white.
 *  - **It takes input.** Drag turns the hull; the turntable eases back into
 *    its slow revolution once the thumb is off it.
 *
 * Deliberately not part of `Engine`. Putting a showroom mode into the flight
 * engine would mean the flight engine growing a mode, and the bay is the one
 * place in the game where the ship is a thing to look at rather than a thing
 * being flown.
 */

/** Scratch, module level: the frame loop allocates nothing. */
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3(1, 1, 1);
const scratchEuler = new THREE.Euler();
const scratchBox = new THREE.Box3();
const scratchSphere = new THREE.Sphere();
/**
 * The measuring rig: where a freshly loaded hull is stood to be measured
 * before it goes on the turntable. It has no parent and carries only the
 * turntable's resting tilt, so the box it yields is the hull's own, in the
 * pose it will be shown in. Measuring on the turntable itself was the bug
 * that buried hulls in the pad: `Box3.setFromObject` works in world space,
 * so the box carried the PREVIOUS hull's lift, the bob, the drag and the
 * swap scale, and each switch stood the new hull a little lower.
 */
const measuringRig = new THREE.Group();
measuringRig.rotation.x = HANGAR.tilt;

export interface ShipBayOptions {
  /** `?debug=1`: park the bay on `window.galaxiaBay` for the console and the
      e2e checks, the same hatch `Audio` uses. */
  debug?: boolean;
  /**
   * `?shot=<id>`: the hull alone, on a transparent clear, parked at
   * `HANGAR.shotYaw`. A QA hatch like `?replay=1`, used by
   * `scripts/ship-stills.mjs` to render the stills the results card draws;
   * never reached in play.
   */
  shot?: boolean;
}

export class ShipBay {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();

  /** Turntable the hull is parented to, so the mesh itself stays untouched. */
  private readonly turntable = new THREE.Group();
  /**
   * Sits between the turntable and the hull, and exists only to be scaled by
   * the swap animation. The group `loadLambertModel` hands back already
   * carries the scale that normalises the model to its catalogue length, so
   * writing a scale onto it is how you get a hull 13 times too small.
   */
  private readonly hullHolder = new THREE.Group();
  /** What the current hull owns, dropped whenever the hull changes. */
  private hull: THREE.Group | null = null;
  private hullMaterials: THREE.MeshLambertMaterial[] = [];
  private hullDisposables: Array<{ dispose(): void }> = [];
  /** Bumped on every load so a slow fetch cannot install a stale hull. */
  private loadToken = 0;
  /**
   * Bounding-sphere radius of the hull on the turntable, measured rather
   * than assumed: the catalogue normalises a hull's LONGEST axis, which for
   * a wide one is its wingspan. The camera frames the larger of this and
   * `HANGAR.frameRadius`, so the catalogue's hulls all frame alike and only
   * an oversized one pushes the camera back.
   */
  private hullRadius = DEFAULT_SHIP.modelLength * 0.6;
  /** 0..1 through the fade-in that hides a hull swap. 1 when settled. */
  private swapT = 1;
  /**
   * Where the turntable has to sit for the hull's underside to clear the pad
   * by `HANGAR.hoverGap`. Measured per hull; the camera does not follow it.
   */
  private hullLift: number = HANGAR.hoverY;
  /**
   * World height of the hull's own centre. The room's camera ignores it and
   * aims at a fixed point over the pad, on purpose; a still has no room to
   * frame, so it aims here instead and the hull sits in the middle of it.
   */
  private hullCenterY: number = HANGAR.hoverY;

  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly reducedMotion = prefersReducedMotion();
  private readonly tier = detectTier();
  /** `?shot=<id>`: hull only, transparent, parked. See `ShipBayOptions`. */
  private readonly shot: boolean;
  /**
   * The hull actually standing on the turntable, or null while the pad is
   * empty. It is not the same thing as the hull the page is showing the name
   * of: the name changes on the tap and the GLB arrives afterwards, so
   * anything reading the bay's measurements has to wait for this to catch up
   * or it reads the hull before last.
   */
  private hullId: string | null = null;

  /** Camera distance: where it wants to be, and where it currently is. */
  private targetDistance = 0;
  private distance = 0;
  /**
   * Fraction of the viewport height obscured by the floating overlay. The
   * hull is framed into what is left, not into the raw canvas, or it would sit
   * behind the text.
   */
  private safeArea = 0;

  /** Turntable angle from the clock, and the offset the player dragged in. */
  private autoYaw = 0;
  private dragYaw = 0;
  private dragPitch = 0;
  /** 0..1 how much of the automatic revolution is currently running. */
  private spin = 1;
  private dragging = false;
  private idleSeconds = 0;
  private pointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  /** Set once the player has dragged, so the hint can stop nagging. */
  private dragged = false;

  private frameHandle: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private elapsed = 0;
  private width = 0;
  private height = 0;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    options: ShipBayOptions = {},
  ) {
    this.shot = options.shot === true;
    this.canvas = document.createElement("canvas");
    this.canvas.dataset.galaxiaBay = "true";
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // Both of these are the fix for "the ship looks blurry". The bay has the
      // budget the flight does not.
      antialias: true,
      alpha: this.shot,
      stencil: false,
      depth: true,
      // Only for the still: the script reads the drawing buffer back to crop
      // the shot to the hull, and without this it reads back blank. It costs
      // a copy every frame, which no player ever pays.
      preserveDrawingBuffer: this.shot,
    });
    if (this.shot) this.renderer.setClearColor(0x000000, 0);
    else this.renderer.setClearColor(COLOR.space, 1);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, HANGAR.dprCap),
    );

    this.scene.background = this.shot ? null : new THREE.Color(COLOR.space);

    this.camera = new THREE.PerspectiveCamera(HANGAR.fov, 1, 0.1, 200);

    this.turntable.position.y = this.hullLift;
    this.turntable.rotation.x = HANGAR.tilt;
    this.turntable.add(this.hullHolder);
    this.scene.add(this.turntable);

    // A still wants the hull and nothing else: the deck, walls and door are
    // the reason the bay is a room, and the reason it cannot be cut out.
    if (!this.shot) this.buildBay();
    this.buildLights();

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.resize();
    this.distance = this.targetDistance;

    if (options.debug) {
      (window as unknown as { galaxiaBay?: ShipBay }).galaxiaBay = this;
    }
  }

  // ------------------------------------------------------------------- scene

  /**
   * The bay: deck, landing dais, walls, ceiling, and the door aft.
   *
   * Everything is a plane or a box with a painted map on it. The whole room
   * costs about fifteen draw calls, against the sixty the flight scene
   * budgets for an asteroid field.
   */
  private buildBay(): void {
    const textureSize = HANGAR.textureSizes[this.tier] ?? 512;
    const deckY = HANGAR.deckY;

    // --- deck ---------------------------------------------------------------
    const deckMap = deckTexture(textureSize);
    if (deckMap) {
      // Tiled, not stretched: the camera stands close enough that one map over
      // the whole floor smears every slab seam.
      deckMap.repeat.set(HANGAR.deckTiles, HANGAR.deckTiles);
      this.disposables.push(deckMap);
    }
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(HANGAR.deckSize, HANGAR.deckSize),
      new THREE.MeshLambertMaterial({
        color: deckMap ? COLOR.white : HANGAR.deckColor,
        map: deckMap,
        flatShading: true,
      }),
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, deckY, -4);
    this.keep(deck);
    this.scene.add(deck);

    // The markings, on their own decal over the concrete so the lettering is
    // drawn at the size it is read at.
    const markings = deckMarkingsTexture(textureSize);
    if (markings) {
      this.disposables.push(markings);
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(HANGAR.markingsSize, HANGAR.markingsSize),
        new THREE.MeshLambertMaterial({
          map: markings,
          transparent: true,
          depthWrite: false,
          flatShading: true,
        }),
      );
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(0, deckY + 0.01, 0);
      this.keep(decal);
      this.scene.add(decal);
    }

    // --- the dais the hull sits over ---------------------------------------
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(
        HANGAR.padRadius,
        HANGAR.padRadius * 1.04,
        HANGAR.padHeight,
        8,
      ),
      new THREE.MeshLambertMaterial({
        color: HANGAR.padColor,
        flatShading: true,
      }),
    );
    pad.position.set(0, deckY + HANGAR.padHeight / 2, 0);
    pad.rotation.y = Math.PI / 8;
    this.keep(pad);
    this.scene.add(pad);

    // A lit lip round the dais. The one place cyan is allowed in here: it
    // marks where the ship stands, which is what cyan means everywhere else.
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(
        HANGAR.padRadius * 1.02,
        HANGAR.padRadius * 1.02,
        HANGAR.padRingHeight,
        8,
        1,
        true,
      ),
      new THREE.MeshLambertMaterial({
        color: COLOR.panel,
        emissive: COLOR.cyan,
        emissiveIntensity: 0.65,
        // Open-ended, so without this only the far half of the lip draws and
        // it reads as a line across the pad rather than a ring round it.
        side: THREE.DoubleSide,
        flatShading: true,
      }),
    );
    ring.position.set(0, deckY + HANGAR.padHeight, 0);
    ring.rotation.y = Math.PI / 8;
    this.keep(ring);
    this.scene.add(ring);

    // --- contact shadow ----------------------------------------------------
    const shadowMap = contactShadowTexture();
    if (shadowMap) {
      this.disposables.push(shadowMap);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(HANGAR.shadowRadius * 2, HANGAR.shadowRadius * 2),
        new THREE.MeshBasicMaterial({
          map: shadowMap,
          transparent: true,
          opacity: HANGAR.shadowOpacity,
          depthWrite: false,
          color: 0x000000,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, deckY + HANGAR.padHeight + 0.01, 0);
      this.keep(shadow);
      this.scene.add(shadow);
    }

    // --- side walls --------------------------------------------------------
    const wallMap = wallTexture(textureSize);
    if (wallMap) {
      // One map, both walls, tiled along their length.
      wallMap.repeat.set(4, 1);
      this.disposables.push(wallMap);
    }
    const wallGeometry = new THREE.PlaneGeometry(
      HANGAR.wallDepth,
      HANGAR.wallHeight,
    );
    const wallMaterial = new THREE.MeshLambertMaterial({
      color: wallMap ? COLOR.white : HANGAR.wallColor,
      map: wallMap,
      flatShading: true,
    });
    this.disposables.push(wallGeometry, wallMaterial);

    for (const side of [-1, 1] as const) {
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.position.set(
        side * HANGAR.wallX,
        deckY + HANGAR.wallHeight / 2,
        HANGAR.wallZ,
      );
      wall.rotation.y = side * -Math.PI / 2;
      this.scene.add(wall);
    }

    // --- structural ribs up both walls -------------------------------------
    const ribCount = HANGAR.ribCounts[this.tier] ?? 5;
    const ribs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(HANGAR.ribWidth, HANGAR.wallHeight, HANGAR.ribDepth),
      new THREE.MeshLambertMaterial({
        color: HANGAR.ribColor,
        flatShading: true,
      }),
      ribCount * 2,
    );
    let rib = 0;
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < ribCount; i += 1) {
        const z =
          HANGAR.wallZ -
          HANGAR.wallDepth / 2 +
          ((i + 0.5) / ribCount) * HANGAR.wallDepth;
        scratchPosition.set(
          side * (HANGAR.wallX - HANGAR.ribDepth / 2),
          deckY + HANGAR.wallHeight / 2,
          z,
        );
        scratchEuler.set(0, side * -Math.PI / 2, 0);
        scratchQuaternion.setFromEuler(scratchEuler);
        scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
        ribs.setMatrixAt(rib, scratchMatrix);
        rib += 1;
      }
    }
    ribs.instanceMatrix.needsUpdate = true;
    this.keep(ribs);
    this.scene.add(ribs);

    // --- ceiling and floodlights -------------------------------------------
    // The same plating as the walls, so the ceiling reads as structure
    // overhead rather than a grey slab across the top of the frame.
    const ceilingMap = wallTexture(textureSize);
    if (ceilingMap) {
      ceilingMap.repeat.set(2, 6);
      this.disposables.push(ceilingMap);
    }
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(HANGAR.wallX * 2, HANGAR.ceilingDepth),
      new THREE.MeshLambertMaterial({
        color: ceilingMap ? 0x9aa0ab : HANGAR.doorFrameColor,
        map: ceilingMap,
        emissive: HANGAR.ceilingEmissive,
        flatShading: true,
      }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, deckY + HANGAR.ceilingY, HANGAR.wallZ);
    this.keep(ceiling);
    this.scene.add(ceiling);

    const floodCount = HANGAR.floodCounts[this.tier] ?? 4;
    const floods = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(HANGAR.floodSize, HANGAR.floodSize * 0.34),
      new THREE.MeshBasicMaterial({ color: HANGAR.floodColor }),
      floodCount * 2,
    );
    let flood = 0;
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < floodCount; i += 1) {
        scratchPosition.set(
          side * HANGAR.wallX * 0.45,
          deckY + HANGAR.ceilingY - 0.05,
          4 - i * HANGAR.floodSpacing,
        );
        scratchEuler.set(Math.PI / 2, 0, 0);
        scratchQuaternion.setFromEuler(scratchEuler);
        scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
        floods.setMatrixAt(flood, scratchMatrix);
        flood += 1;
      }
    }
    floods.instanceMatrix.needsUpdate = true;
    this.keep(floods);
    this.scene.add(floods);

    // --- the door aft, and space beyond it ---------------------------------
    // Three slabs round a rectangular hole rather than a plane with a hole in
    // it: the same silhouette for a third of the geometry and no custom shape.
    const jambWidth = (HANGAR.wallX * 2 - HANGAR.doorWidth) / 2;
    const frameMaterial = new THREE.MeshLambertMaterial({
      color: HANGAR.doorFrameColor,
      flatShading: true,
    });
    this.disposables.push(frameMaterial);

    const jambGeometry = new THREE.PlaneGeometry(jambWidth, HANGAR.wallHeight);
    this.disposables.push(jambGeometry);
    for (const side of [-1, 1] as const) {
      const jamb = new THREE.Mesh(jambGeometry, frameMaterial);
      jamb.position.set(
        side * (HANGAR.doorWidth / 2 + jambWidth / 2),
        deckY + HANGAR.wallHeight / 2,
        HANGAR.doorZ,
      );
      this.scene.add(jamb);
    }

    const lintelHeight = HANGAR.wallHeight - HANGAR.doorHeight;
    const lintel = new THREE.Mesh(
      new THREE.PlaneGeometry(HANGAR.doorWidth, lintelHeight),
      frameMaterial,
    );
    lintel.position.set(
      0,
      deckY + HANGAR.doorHeight + lintelHeight / 2,
      HANGAR.doorZ,
    );
    this.disposables.push(lintel.geometry);
    this.scene.add(lintel);

    // A lit rail round the opening: the bay's one horizon, and what stops the
    // door reading as a hole cut in a dark wall.
    const railMaterial = new THREE.MeshLambertMaterial({
      color: COLOR.panel,
      emissive: COLOR.cyan,
      emissiveIntensity: 0.75,
      flatShading: true,
    });
    const railTop = new THREE.Mesh(
      new THREE.BoxGeometry(HANGAR.doorWidth, HANGAR.doorRail, HANGAR.doorRail),
      railMaterial,
    );
    railTop.position.set(0, deckY + HANGAR.doorHeight, HANGAR.doorZ + 0.1);
    this.disposables.push(railTop.geometry, railMaterial);
    this.scene.add(railTop);

    const railSide = new THREE.BoxGeometry(
      HANGAR.doorRail,
      HANGAR.doorHeight,
      HANGAR.doorRail,
    );
    this.disposables.push(railSide);
    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(railSide, railMaterial);
      rail.position.set(
        side * HANGAR.doorWidth / 2,
        deckY + HANGAR.doorHeight / 2,
        HANGAR.doorZ + 0.1,
      );
      this.scene.add(rail);
    }

    // Space, seen through the door. The same image the title screen and the
    // flight backdrop use, so the bay opens onto the game's own sky.
    const voidGeometry = new THREE.PlaneGeometry(HANGAR.voidSize, HANGAR.voidSize);
    const voidMaterial = new THREE.MeshBasicMaterial({ color: COLOR.space });
    const beyond = new THREE.Mesh(voidGeometry, voidMaterial);
    beyond.position.set(0, deckY + HANGAR.voidSize / 3, HANGAR.voidZ);
    this.disposables.push(voidGeometry, voidMaterial);
    this.scene.add(beyond);

    new THREE.TextureLoader().load(
      BACKDROP.url,
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        voidMaterial.map = texture;
        voidMaterial.color.setHex(0xffffff);
        voidMaterial.needsUpdate = true;
        this.disposables.push(texture);
      },
      undefined,
      // A missing image leaves the clear colour showing through the door,
      // which still reads as space.
      () => undefined,
    );
  }

  private buildLights(): void {
    const key = new THREE.DirectionalLight(COLOR.white, HANGAR.keyIntensity);
    key.position.set(...HANGAR.keyPosition);
    this.scene.add(key);

    // Front-right and low: without it the far side of every hull is a
    // silhouette, which is half of why this used to read as dark.
    const fill = new THREE.DirectionalLight(COLOR.white, HANGAR.fillIntensity);
    fill.position.set(...HANGAR.fillPosition);
    this.scene.add(fill);

    // Cool grey rather than the saturated blue it used to be. That blue,
    // plus the old cyan rim, is what turned the Seraph's white panels pink.
    this.scene.add(
      new THREE.HemisphereLight(
        HANGAR.ambientSky,
        HANGAR.ambientGround,
        HANGAR.ambientIntensity,
      ),
    );

    // A trace of cyan from behind, to edge the hull off the bulkhead. At this
    // strength it shapes the silhouette without colouring a wing.
    const rim = new THREE.DirectionalLight(COLOR.cyan, HANGAR.rimIntensity);
    rim.position.set(...HANGAR.rimPosition);
    this.scene.add(rim);

    // The floodlights in the ceiling read as sources; these are what actually
    // pool light on the deck under them.
    const overhead = new THREE.DirectionalLight(
      HANGAR.floodColor,
      HANGAR.floodIntensity,
    );
    overhead.position.set(0, 10, 0);
    this.scene.add(overhead);
  }

  private keep(mesh: THREE.Mesh | THREE.InstancedMesh): void {
    this.disposables.push(mesh.geometry, mesh.material as THREE.Material);
  }

  // -------------------------------------------------------------------- hull

  /**
   * Swap the hull on the turntable. Resolves either way: a hull that fails to
   * load leaves the pad empty rather than the page broken.
   */
  async setShip(spec: ShipSpec): Promise<void> {
    const token = (this.loadToken += 1);
    const loaded = await loadLambertModel(
      spec.modelUrl,
      spec.modelLength,
      spec.modelYaw,
      spec.modelTrim,
    );
    // Disposed, or the player has already flicked on to another hull.
    if (this.disposed || token !== this.loadToken) {
      loaded?.disposables.forEach((item) => item.dispose());
      return;
    }

    // Whether anything was on the pad before decides if this is an arrival or
    // a swap, and only a swap wants a fade.
    const hadHull = this.hull !== null;

    this.clearHull();
    if (!loaded) return;
    this.hull = loaded.group;
    this.hullMaterials = loaded.materials;
    this.hullDisposables = loaded.disposables;

    // Measure what actually arrived on the rig, in its own frame, THEN put
    // it on the turntable. See `measuringRig` for why the order matters.
    measuringRig.add(loaded.group);
    measuringRig.updateMatrixWorld(true);
    scratchBox.setFromObject(loaded.group);
    measuringRig.remove(loaded.group);
    this.hullHolder.add(loaded.group);

    scratchBox.getBoundingSphere(scratchSphere);
    this.hullRadius = Math.max(scratchSphere.radius, 0.5);

    // Stand it on the pad by its underside, and frame the room around it.
    const padTop = HANGAR.deckY + HANGAR.padHeight;
    this.hullLift = padTop + HANGAR.hoverGap - scratchBox.min.y;
    this.hullCenterY = this.hullLift + (scratchBox.min.y + scratchBox.max.y) / 2;
    this.turntable.position.y = this.hullLift;
    this.frame();

    // Present every hull from the same angle, however the last one was left.
    this.dragYaw = 0;
    this.dragPitch = 0;
    this.autoYaw = 0;
    this.hullId = spec.id;

    // Fade and scale in, so a switch is a hull arriving rather than a pop.
    //
    // Only on a real swap. The FIRST hull is simply there: fading it in means
    // arriving at the bay to find the ship half printed, and it also makes the
    // opening frames depend on how fast the device can render them.
    this.swapT = hadHull ? 0 : 1;
    if (hadHull) {
      for (const material of this.hullMaterials) {
        material.transparent = true;
        material.opacity = 0;
      }
    }
    this.applySwap();
  }

  private clearHull(): void {
    if (this.hull) this.hullHolder.remove(this.hull);
    this.hull = null;
    this.hullId = null;
    this.hullMaterials = [];
    this.hullDisposables.forEach((item) => item.dispose());
    this.hullDisposables = [];
  }

  /** Walk the fade-in onto the hull's materials and scale. */
  private applySwap(): void {
    if (!this.hull) return;
    const eased = this.swapT * this.swapT * (3 - 2 * this.swapT);
    // The holder, never the hull: see `hullHolder`.
    this.hullHolder.scale.setScalar(
      HANGAR.swapFromScale + (1 - HANGAR.swapFromScale) * eased,
    );

    for (const material of this.hullMaterials) {
      material.opacity = eased;
      // Settle back to opaque: a transparent hull pays for sorting on every
      // frame for the rest of the visit, for nothing.
      if (this.swapT >= 1 && material.transparent) {
        material.transparent = false;
        material.opacity = 1;
        material.needsUpdate = true;
      }
    }
  }

  // ------------------------------------------------------------------- input

  /** Has the player dragged the hull yet? Drives the one-time hint. */
  get hasDragged(): boolean {
    return this.dragged;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.dragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    // Capture, so a drag that leaves the canvas keeps turning the hull rather
    // than sticking mid-spin.
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers refuse capture for a pointer that already ended.
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.lastPointerX;
    const dy = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    this.dragYaw += dx * HANGAR.dragYawPerPixel;
    this.dragPitch = clamp(
      this.dragPitch + dy * HANGAR.dragPitchPerPixel,
      HANGAR.pitchMin,
      HANGAR.pitchMax,
    );
    if (dx !== 0 || dy !== 0) this.dragged = true;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
    this.idleSeconds = 0;
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Already released, which is fine.
    }
  };

  // ----------------------------------------------------------------- framing

  /**
   * How much of the bottom of the canvas the floating overlay covers, 0..1.
   *
   * The bay fills the screen and the name, price and buttons sit over the
   * bottom of it, so "centred" has to mean centred in what is left. React
   * measures the overlay and tells us.
   */
  setSafeArea(bottomFraction: number): void {
    const next = clamp(bottomFraction, 0, 0.7);
    if (Math.abs(next - this.safeArea) < 0.002) return;
    this.safeArea = next;
    this.frame();
  }

  /**
   * Work out how far back the camera has to stand to hold the framing sphere
   * inside the clear part of the frame. The sphere is `HANGAR.frameRadius`
   * for every catalogue hull, so paging through them never moves the camera;
   * a hull that measures larger than that is fitted on its own radius.
   *
   * The FOV is vertical, so on a tall narrow bay the horizontal one binds, and
   * framing on the vertical alone hangs the wingtips off both sides. Fit
   * against the smaller of the two, with the vertical reduced by whatever the
   * overlay is covering.
   */
  private frame(): void {
    const verticalHalf = ((this.camera.fov * Math.PI) / 180) / 2;
    const clear = Math.max(1 - this.safeArea, 0.3);
    const usableVerticalHalf = Math.atan(Math.tan(verticalHalf) * clear);
    const horizontalHalf = Math.atan(
      Math.tan(verticalHalf) * Math.max(this.camera.aspect, 0.01),
    );
    const tightest = Math.min(usableVerticalHalf, horizontalHalf);
    // A still frames the hull itself, tight, because there is no room around
    // it to keep steady and every pixel of an 800x600 shot is wanted. The bay
    // frames the constant instead, so paging the catalogue never dollies.
    const radius = this.shot
      ? this.hullRadius
      : Math.max(this.hullRadius, HANGAR.frameRadius);
    const padding = this.shot ? HANGAR.shotPadding : HANGAR.framePadding;
    this.targetDistance = (radius / Math.sin(tightest)) * padding;
    if (this.distance === 0) this.distance = this.targetDistance;
  }

  /**
   * Point the camera, given wherever the eased distance has reached. It aims
   * at a fixed height over the pad, not at the hull: the room is the
   * constant and the hull is what changes.
   */
  private placeCamera(): void {
    const distance = this.distance;

    // A still has no deck to stand on and no overlay to clear: put the hull
    // in the middle of the frame and look straight at it.
    if (this.shot) {
      this.camera.position.set(0, this.hullCenterY + distance * HANGAR.shotLift, distance);
      this.camera.lookAt(0, this.hullCenterY, 0);
      return;
    }

    const verticalHalf = ((this.camera.fov * Math.PI) / 180) / 2;
    // World-space half-height of the frame at the pad. Shifting the aim down
    // by the covered share of it lifts the hull into the clear band.
    const halfHeight = Math.tan(verticalHalf) * distance;
    // Only part of the way: aiming the full height below the hull lifts it
    // clear of the type but pitches the camera down into the deck, and the
    // bay stops reading as a room you are standing in.
    const lift = halfHeight * this.safeArea * HANGAR.frameBias;
    const aimY = HANGAR.deckY + HANGAR.padHeight + HANGAR.aimY;

    this.camera.position.set(0, aimY + distance * HANGAR.cameraLift, distance);
    this.camera.lookAt(0, aimY - lift, 0);
  }

  // -------------------------------------------------------------- frame loop

  start(): void {
    if (this.frameHandle !== null || this.disposed) return;
    this.clock.getDelta();
    this.frameHandle = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (this.frameHandle === null) return;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private loop = (): void => {
    this.frameHandle = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), PERF.maxDelta);
    this.elapsed += dt;

    // The automatic revolution gives way to the thumb and eases back in once
    // it is off. A turntable that snapped back to speed would read as a bug.
    if (this.dragging) {
      this.spin = Math.max(this.spin - dt / 0.2, 0);
    } else {
      this.idleSeconds += dt;
      if (this.idleSeconds >= HANGAR.resumeSeconds) {
        this.spin = Math.min(this.spin + dt / HANGAR.resumeEaseSeconds, 1);
      }
    }

    // Halved for a player who asked for reduced motion, since the turn IS the
    // content here and stopping it dead leaves them looking at a still.
    const rate = this.reducedMotion ? 0.5 : 1;
    this.autoYaw +=
      ((dt * this.spin * rate) / HANGAR.revolveSeconds) * Math.PI * 2;

    if (this.shot) {
      // Parked: a still has to be the same picture every time it is taken, so
      // neither the revolution nor the bob is allowed near it. The room's
      // tilt goes too; `shotPitch` is the whole angle.
      this.turntable.rotation.y = HANGAR.shotYaw;
      this.turntable.rotation.x = HANGAR.shotPitch;
      this.turntable.position.y = this.hullLift;
    } else {
      this.turntable.rotation.y = this.autoYaw + this.dragYaw;
      this.turntable.rotation.x = HANGAR.tilt + this.dragPitch;
      this.turntable.position.y = this.reducedMotion
        ? this.hullLift
        : this.hullLift +
          Math.sin(this.elapsed * HANGAR.bobRate) * HANGAR.bobAmplitude;
    }

    if (this.swapT < 1) {
      this.swapT = Math.min(this.swapT + dt / HANGAR.swapFadeSeconds, 1);
      this.applySwap();
    }

    // Each hull frames at its own distance, so a switch changes it. Easing
    // turns that change into a dolly instead of a cut.
    if (Math.abs(this.targetDistance - this.distance) > 0.001) {
      const response = 1 - Math.exp(-HANGAR.frameEaseRate * dt);
      this.distance += (this.targetDistance - this.distance) * response;
    }
    this.placeCamera();

    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) this.stop();
    else if (!this.disposed) this.start();
  };

  /** What `?debug=1` and the e2e checks read. */
  debugState(): {
    yaw: number;
    pitch: number;
    dragged: boolean;
    drawCalls: number;
    triangles: number;
    dpr: number;
    /** The current hull's measured radius and turntable height, so the
        framing constant can be checked against the catalogue and a test can
        assert a hull stands at the same height on every visit. */
    hullRadius: number;
    hullLift: number;
    padTop: number;
    /** The hull now ON the turntable, not the one the page names. Null until
        the first GLB lands. What the stills script and the bay's own
        geometry checks wait on. */
    hullId: string | null;
  } {
    return {
      yaw: this.turntable.rotation.y,
      pitch: this.turntable.rotation.x,
      dragged: this.dragged,
      hullId: this.hullId,
      hullRadius: this.hullRadius,
      hullLift: this.hullLift,
      padTop: HANGAR.deckY + HANGAR.padHeight,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      dpr: this.renderer.getPixelRatio(),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);

    this.clearHull();
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.scene.clear();

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();

    const owner = window as unknown as { galaxiaBay?: ShipBay };
    if (owner.galaxiaBay === this) delete owner.galaxiaBay;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
