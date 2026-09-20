import * as THREE from "three";

/**
 * The ship bay's surfaces, drawn rather than shipped.
 *
 * A launch bay has to read as concrete and plate: poured slabs with seams and
 * stains, hazard paint at the edge of the pad, ribbed wall panels with hatches
 * and stencils. None of that is geometry a phone should draw, and none of it is
 * worth a texture download, so it is painted into a canvas at load and handed
 * to three.js as a map. Same 2D drawing as `share.ts` does for the share card,
 * pointed at a different surface.
 *
 * Two rules for anything added here:
 *
 *  - **Set the colour space.** A `CanvasTexture` defaults to no colour space,
 *    and a colour map that skips `SRGBColorSpace` renders washed out and
 *    wrong. `Backdrop.ts` does the same for the space image.
 *  - **Hand back the texture and let the caller dispose it.** The bay owns its
 *    disposables; nothing here keeps a reference or caches between mounts.
 *
 * Every function takes its resolution from the caller, which reads it off the
 * quality tier, so a weak phone is not asked to hold three megapixel maps.
 */

/** A 2D context at `size` square, or null if the browser will not give one. */
function surface(size: number): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas.getContext("2d");
}

function finish(
  context: CanvasRenderingContext2D,
  repeat = 1,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(context.canvas);
  // Colour maps are authored in sRGB. Without this the bay renders pale and
  // flat, which is the exact complaint this whole module exists to answer.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}

/**
 * Deterministic value noise. The bay looks the same on every visit, which
 * matters because two players comparing a screenshot of the same hull should
 * not be looking at two different floors.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Speckle and blotch a rectangle so a flat fill reads as a poured surface. */
function grain(
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
  passes: number,
): void {
  // Broad blotches first: uneven cure, old spills, tyre paths.
  for (let i = 0; i < passes; i += 1) {
    const radius = size * (0.04 + random() * 0.16);
    const x = random() * size;
    const y = random() * size;
    const dark = random() > 0.5;
    const wash = context.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = 0.03 + random() * 0.05;
    wash.addColorStop(0, dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`);
    wash.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = wash;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Then aggregate: the fine speckle that stops it looking like paper.
  const specks = Math.round(size * size * 0.02);
  for (let i = 0; i < specks; i += 1) {
    const value = random();
    context.fillStyle =
      value > 0.5 ? `rgba(255,255,255,0.05)` : `rgba(0,0,0,0.07)`;
    context.fillRect(random() * size, random() * size, 1.5, 1.5);
  }
}

/**
 * The deck: poured slabs, seams and grain, and nothing else.
 *
 * Tileable, and tiled several times across the deck, because the camera stands
 * close enough that one map stretched over the whole floor is a blurry mess.
 * The markings go on their own decal, see `deckMarkingsTexture`, so they can
 * be drawn at the size they are actually seen at.
 */
export function deckTexture(size: number): THREE.CanvasTexture | null {
  const context = surface(size);
  if (!context) return null;
  const random = seeded(0x5eed1);

  context.fillStyle = "#43464e";
  context.fillRect(0, 0, size, size);
  grain(context, size, random, 70);

  // Slab seams. A grid of poured sections, each very slightly its own shade,
  // which is what concrete actually looks like from above.
  const slabs = 4;
  const step = size / slabs;
  for (let x = 0; x < slabs; x += 1) {
    for (let y = 0; y < slabs; y += 1) {
      context.fillStyle = `rgba(${random() > 0.5 ? "255,255,255" : "0,0,0"},${
        0.014 + random() * 0.026
      })`;
      context.fillRect(x * step, y * step, step, step);
    }
  }
  context.strokeStyle = "rgba(0,0,0,0.38)";
  context.lineWidth = Math.max(size / 300, 2);
  for (let i = 0; i < slabs; i += 1) {
    context.beginPath();
    context.moveTo(i * step, 0);
    context.lineTo(i * step, size);
    context.moveTo(0, i * step);
    context.lineTo(size, i * step);
    context.stroke();
  }

  grain(context, size, random, 18);
  return finish(context);
}

/**
 * Deck markings, on their own transparent decal laid over the concrete: the
 * landing ring, the hazard chevrons fore of the pad, and the stencils.
 *
 * Separate from the concrete so each is drawn at its own scale. The concrete
 * tiles small and stays sharp; the markings are one map over a patch of deck
 * about as wide as the bay, so the lettering is legible instead of smeared.
 */
export function deckMarkingsTexture(size: number): THREE.CanvasTexture | null {
  const context = surface(size);
  if (!context) return null;
  const random = seeded(0xdec41);
  const centre = size / 2;

  // Hazard paint: a painted ring round the landing circle, and a lighter one
  // outside it.
  context.strokeStyle = "rgba(226,206,96,0.72)";
  context.lineWidth = size * 0.011;
  context.beginPath();
  context.arc(centre, centre, size * 0.26, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "rgba(226,206,96,0.34)";
  context.lineWidth = size * 0.005;
  context.beginPath();
  context.arc(centre, centre, size * 0.305, 0, Math.PI * 2);
  context.stroke();

  // Tick marks round the ring, like a real pad's alignment marks.
  context.strokeStyle = "rgba(226,231,242,0.4)";
  context.lineWidth = size * 0.006;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const inner = size * 0.315;
    const outer = size * 0.35;
    context.beginPath();
    context.moveTo(centre + Math.cos(angle) * inner, centre + Math.sin(angle) * inner);
    context.lineTo(centre + Math.cos(angle) * outer, centre + Math.sin(angle) * outer);
    context.stroke();
  }

  // Chevrons across the fore edge, the way a real deck warns you off the
  // thrust cone.
  const chevronTop = size * 0.72;
  const chevronWidth = size * 0.045;
  context.save();
  context.beginPath();
  context.rect(size * 0.1, chevronTop, size * 0.8, size * 0.07);
  context.clip();
  context.fillStyle = "rgba(226,206,96,0.6)";
  for (let x = -size; x < size * 2; x += chevronWidth * 2) {
    context.beginPath();
    context.moveTo(x, chevronTop + size * 0.07);
    context.lineTo(x + chevronWidth, chevronTop + size * 0.07);
    context.lineTo(x + chevronWidth * 2, chevronTop);
    context.lineTo(x + chevronWidth, chevronTop);
    context.closePath();
    context.fill();
  }
  context.restore();

  // Stencils. Loud, worn, and the thing that makes a floor read as a place
  // with a job rather than a texture.
  context.fillStyle = "rgba(226,231,242,0.42)";
  context.textAlign = "center";
  context.font = `${Math.round(size * 0.042)}px monospace`;
  context.fillText("LAUNCH BAY 04", centre, size * 0.115);
  context.font = `${Math.round(size * 0.026)}px monospace`;
  context.fillText("KEEP CLEAR OF THRUST", centre, size * 0.685);
  context.save();
  context.translate(size * 0.075, centre);
  context.rotate(-Math.PI / 2);
  context.fillText("ASTRO RUN FLEET", 0, 0);
  context.restore();
  context.save();
  context.translate(size * 0.925, centre);
  context.rotate(Math.PI / 2);
  context.fillText("DECK C", 0, 0);
  context.restore();

  // Wear the paint back into the floor, so it is not a decal sitting on top.
  context.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 160; i += 1) {
    const radius = size * (0.004 + random() * 0.02);
    context.fillStyle = `rgba(0,0,0,${0.12 + random() * 0.4})`;
    context.beginPath();
    context.arc(random() * size, random() * size, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(context.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Wall plating: ribbed panels, hatches, bolt lines and a stencil. Tiles, so
 * one map covers both walls at any length.
 */
export function wallTexture(size: number): THREE.CanvasTexture | null {
  const context = surface(size);
  if (!context) return null;
  const random = seeded(0xb0a7d);

  context.fillStyle = "#4b505a";
  context.fillRect(0, 0, size, size);
  grain(context, size, random, 50);

  // Horizontal plate courses, each with a bolt line along its top edge.
  const courses = 6;
  const courseHeight = size / courses;
  for (let i = 0; i < courses; i += 1) {
    const y = i * courseHeight;
    context.fillStyle = `rgba(${i % 2 === 0 ? "255,255,255" : "0,0,0"},0.03)`;
    context.fillRect(0, y, size, courseHeight);

    context.strokeStyle = "rgba(0,0,0,0.4)";
    context.lineWidth = Math.max(size / 400, 1.2);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y);
    context.stroke();

    context.fillStyle = "rgba(0,0,0,0.3)";
    const bolts = 16;
    for (let b = 0; b < bolts; b += 1) {
      const bx = ((b + 0.5) / bolts) * size;
      context.beginPath();
      context.arc(bx, y + courseHeight * 0.14, size * 0.005, 0, Math.PI * 2);
      context.fill();
    }
  }

  // Vertical panel joins, irregular so the wall does not read as graph paper.
  context.strokeStyle = "rgba(0,0,0,0.3)";
  context.lineWidth = Math.max(size / 500, 1);
  let x = 0;
  while (x < size) {
    x += size * (0.1 + random() * 0.12);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, size);
    context.stroke();
  }

  // A couple of hatches, and a stencil beside one of them.
  for (let i = 0; i < 2; i += 1) {
    const hx = size * (0.12 + i * 0.5);
    const hy = size * (0.3 + random() * 0.3);
    const hw = size * 0.2;
    const hh = size * 0.26;
    context.fillStyle = "rgba(0,0,0,0.22)";
    context.fillRect(hx, hy, hw, hh);
    context.strokeStyle = "rgba(226,231,242,0.14)";
    context.lineWidth = Math.max(size / 400, 1.2);
    context.strokeRect(hx, hy, hw, hh);
    context.fillStyle = "rgba(226,231,242,0.2)";
    context.font = `${Math.round(size * 0.022)}px monospace`;
    context.textAlign = "left";
    context.fillText(i === 0 ? "A-04" : "COOLANT", hx + hw * 0.08, hy - size * 0.014);
  }

  grain(context, size, random, 16);
  return finish(context, 1);
}

/**
 * The contact shadow: a soft dark disc that goes on the dais under the hull.
 *
 * Shadows are banned in this project on cost grounds, and a hovering ship with
 * nothing under it looks pasted on. This is the cheap honest fake: one
 * transparent plane, one radial gradient, and the hull suddenly has weight.
 */
export function contactShadowTexture(size = 256): THREE.CanvasTexture | null {
  const context = surface(size);
  if (!context) return null;

  const centre = size / 2;
  const wash = context.createRadialGradient(
    centre,
    centre,
    0,
    centre,
    centre,
    centre,
  );
  wash.addColorStop(0, "rgba(0,0,0,0.85)");
  wash.addColorStop(0.45, "rgba(0,0,0,0.42)");
  wash.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = wash;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(context.canvas);
  // An alpha-only gradient carries no colour, so it stays in no colour space:
  // tagging it sRGB would lift the mid-tones and make the shadow muddy.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
