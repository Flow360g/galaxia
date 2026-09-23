import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BLOOM } from "./Tuning";

/**
 * Real bloom, on the phones that can afford it.
 *
 * The scene renders into a float target, the bright parts of it are blurred
 * down a mip chain at a fraction of the canvas and added back, and the output
 * pass does the sRGB conversion the renderer would otherwise have done on its
 * own. The threshold keeps it to light: the engines, plasma, beams, blasts
 * and stars bloom; the painted sky and a lit rock face do not.
 *
 * The scene's own draw calls are read straight after the render pass, before
 * the blur passes add theirs, so the sixty-call budget keeps meaning the
 * scene.
 */
export class Post {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  /** Scene draw calls and triangles from the last frame, before the passes. */
  sceneCalls = 0;
  sceneTriangles = 0;
  /** How many full-screen passes the bloom adds on top of the scene. */
  readonly passes: number;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    antialias: boolean,
  ) {
    // Rendering into a target loses the canvas's own antialiasing, so the
    // tier that had it gets a multisampled target instead.
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: antialias ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, target);
    const render = new RenderPass(scene, camera);
    this.composer.addPass(render);
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      BLOOM.strength,
      BLOOM.radius,
      BLOOM.threshold,
    );
    // The pass already blurs at half the size it is handed; scale what it is
    // handed so `BLOOM.resolution` is the fraction of the canvas it works at.
    const bloomSize = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (width: number, height: number) =>
      bloomSize(width * BLOOM.resolution * 2, height * BLOOM.resolution * 2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // A high-pass, five blurs each way, a composite and the output: the passes
    // cost fill rate rather than draw calls, which is why they run small.
    this.passes = 14;

    // Read the scene's numbers off the render pass before the blur runs.
    const draw = render.render.bind(render);
    render.render = (...args: Parameters<RenderPass["render"]>) => {
      this.renderer.info.reset();
      draw(...args);
      this.sceneCalls = this.renderer.info.render.calls;
      this.sceneTriangles = this.renderer.info.render.triangles;
    };
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.bloom.dispose();
    this.composer.dispose();
  }
}
