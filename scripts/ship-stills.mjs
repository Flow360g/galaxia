/**
 * Renders one still per hull into `public/ships/`, for the results card.
 *
 * The card is a 2D canvas drawn on a phone the moment a run ends, so it
 * cannot afford to stand up a second WebGL context to photograph a ship. The
 * pictures are taken once, here, and committed. Run this after adding a hull
 * to `SHIPS` in `Tuning.ts`, and never as part of a build.
 *
 *   npm run build
 *   npx next start -p 3100 &
 *   npm run ship-stills
 *
 * It drives the `/hangar?shot=<id>` hatch, which parks the hull alone at
 * `HANGAR.shotYaw` on a transparent clear with the room and the overlay gone,
 * so the screenshot needs no cutting out. The hull is lit by the bay's own
 * rig, which is the point: a still that does not match the bay is worse than
 * no still.
 *
 * Pass ids to shoot only some; with none it shoots the whole catalogue, read
 * out of `Tuning.ts` rather than listed again here.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "ships");
const BASE = process.env.SHIP_STILLS_URL || "http://127.0.0.1:3100";

/** Matches `HANGAR.shotSize`. Rendered large and drawn down on the card. */
const SIZE = { width: 800, height: 600 };
/** Settling time before the shutter, so no hull is caught mid fade-in. */
const SETTLE_MS = 600;
/** Transparent pixels kept around the hull, so nothing touches the edge. */
const MARGIN = 12;

/**
 * Crops the bay's canvas to the hull and returns it as a PNG data URL.
 *
 * The bay frames a bounding SPHERE, which for a hull that is mostly wingspan
 * leaves most of the frame empty; cropping to the pixels that actually
 * arrived is simpler and tighter than teaching the camera about the silhouette
 * of every model. Runs in the page, where the drawing buffer is.
 */
function cropToHull(margin) {
  const source = document.querySelector("[data-testid='bay-shot'] canvas");
  if (!source) return null;
  const read = document.createElement("canvas");
  read.width = source.width;
  read.height = source.height;
  const readCtx = read.getContext("2d");
  if (!readCtx) return null;
  readCtx.drawImage(source, 0, 0);

  const { data } = readCtx.getImageData(0, 0, read.width, read.height);
  let minX = read.width;
  let minY = read.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < read.height; y += 1) {
    for (let x = 0; x < read.width; x += 1) {
      if (data[(y * read.width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;

  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(read.width - 1, maxX + margin);
  maxY = Math.min(read.height - 1, maxY + margin);

  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.drawImage(read, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/** Every id in the `SHIPS` catalogue, in catalogue order. */
async function catalogueIds() {
  const source = await readFile(path.join(ROOT, "lib", "game", "Tuning.ts"), "utf8");
  const block = source.slice(source.indexOf("export const SHIPS = ["));
  const end = block.indexOf("] as const;");
  return [...block.slice(0, end).matchAll(/^\s{4}id:\s*"([^"]+)"/gm)].map((m) => m[1]);
}

async function main() {
  const asked = process.argv.slice(2);
  const ids = asked.length > 0 ? asked : await catalogueIds();
  if (ids.length === 0) {
    console.error("No ship ids found in lib/game/Tuning.ts.");
    process.exitCode = 1;
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });

  try {
    for (const id of ids) {
      const url = `${BASE}/hangar?shot=${encodeURIComponent(id)}&debug=1`;
      await page.goto(url, { waitUntil: "networkidle" });

      // The GLB has to be on the turntable before the shutter: an empty bay
      // screenshots perfectly happily.
      await page.waitForFunction(
        (wanted) => window.galaxiaBay?.debugState().hullId === wanted,
        id,
        { timeout: 60_000 },
      );
      await page.waitForTimeout(SETTLE_MS);

      const dataUrl = await page.evaluate(cropToHull, MARGIN);
      if (!dataUrl) throw new Error(`Nothing rendered for ${id}`);
      const png = Buffer.from(dataUrl.split(",")[1], "base64");
      const file = path.join(OUT_DIR, `${id}.png`);
      await writeFile(file, png);
      console.log(`wrote ${path.relative(ROOT, file)} (${png.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
