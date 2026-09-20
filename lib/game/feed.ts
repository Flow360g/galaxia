/**
 * WHERE ON EARTH: the satellite feed's imagery.
 *
 * Slippy-map arithmetic and the tile source, kept out of the component so the
 * maths can be read on its own. Sentinel-2 cloudless is openly licensed and is
 * close to what the game could actually ship; it caps out around zoom 14, and
 * the site pool is framed with that in mind.
 */

import { md5 } from "./md5";
import { STATION } from "./Tuning";

export const TILE = 256;
/** Side of the crop taken from the 3x3 mosaic, in mosaic pixels. */
export const WINDOW = 512;
/** Sentinel-2 stops here; framing past it would just resample. */
export const MAX_ZOOM = 14;

export const FEED_HOST = "tiles.maps.eox.at";

export function tileUrl(z: number, x: number, y: number): string {
  return `https://${FEED_HOST}/wmts/1.0.0/s2cloudless-2020_3857/default/GoogleMapsCompatible/${z}/${y}/${x}.jpg`;
}

export function lonToTile(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

export function latToTile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

export function wrapTile(value: number, span: number): number {
  return ((value % span) + span) % span;
}

export function clampTile(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Commons serves a stable image from a filename alone, so ground photography
 * costs no key, no token and no server hop. The filename names the place, so
 * it belongs in the URL and nowhere else.
 *
 * This is the slow road, kept as the fallback: it answers with a redirect, then
 * another, and marks both uncacheable, so every tap on a hint paid about three
 * seconds for a picture the browser may already have held. `thumbUrl` is the
 * road the game takes first.
 */
export function commonsUrl(file: string, width: number): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    file.replace(/ /g, "_"),
  )}?width=${width}`;
}

/**
 * The thumbnail's own address on upload.wikimedia.org: one hop, served from
 * Wikimedia's edge cache with a long lifetime and `Access-Control-Allow-Origin`,
 * exactly as a Wikipedia article embeds it. Files are shelved by the first two
 * hex characters of the MD5 of the underscored filename, and a rendered page
 * (a TIFF's, an SVG's) carries a prefix and gets a raster extension. The width
 * has to be on Wikimedia's list; see `STATION.groundWidth`.
 *
 * Null for a file type this does not know how to name, and a caller falls back
 * to `commonsUrl`, which the feed also does if the direct address ever 404s
 * (a file renamed on Commons, say).
 */
export function thumbUrl(file: string, width: number): string | null {
  const name = file.replace(/ /g, "_");
  const dot = name.lastIndexOf(".");
  const ext = dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
  let thumb: string;
  if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "gif" || ext === "webp") {
    thumb = `${width}px-${name}`;
  } else if (ext === "tif" || ext === "tiff") {
    thumb = `lossy-page1-${width}px-${name}.jpg`;
  } else if (ext === "svg") {
    thumb = `${width}px-${name}.png`;
  } else {
    return null;
  }
  const hash = md5(name);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash.slice(0, 1)}/${hash.slice(
    0,
    2,
  )}/${encodeURIComponent(name)}/${encodeURIComponent(thumb)}`;
}

/** The zoom the optic shows for a site's framing and a dial step, within the source's range. */
export function opticZoom(framing: number, step: number): number {
  return clampTile(Math.round(framing + step), STATION.minZoom, MAX_ZOOM);
}

export interface FeedTile {
  x: number;
  y: number;
  url: string;
  /** Column and row in the 3x3 mosaic, -1..1, the centre tile being 0,0. */
  tx: number;
  ty: number;
}

/**
 * The 3x3 mosaic around a point at a zoom: the tile under it and its eight
 * neighbours, wrapped across the antimeridian and clamped at the poles. The
 * optic draws these and the prefetch warms them, so they must agree.
 */
export function tilesAround(lat: number, lon: number, zoom: number): FeedTile[] {
  const span = 2 ** zoom;
  const ix = Math.floor(lonToTile(lon, zoom));
  const iy = Math.floor(latToTile(lat, zoom));
  const tiles: FeedTile[] = [];
  for (let ty = -1; ty <= 1; ty += 1) {
    for (let tx = -1; tx <= 1; tx += 1) {
      const x = wrapTile(ix + tx, span);
      const y = clampTile(iy + ty, 0, span - 1);
      tiles.push({ x, y, url: tileUrl(zoom, x, y), tx, ty });
    }
  }
  return tiles;
}

/** The intel ladder, in order, for a site. Each rung past the opener is bought. */
export type EarthRung = "clue" | "street" | "landmark" | "structure" | "territory";

export function earthLadder(has: {
  street?: unknown;
  landmark?: unknown;
  structure?: unknown;
}): EarthRung[] {
  const rungs: EarthRung[] = ["clue"];
  if (has.street) rungs.push("street");
  if (has.landmark) rungs.push("landmark");
  if (has.structure) rungs.push("structure");
  rungs.push("territory");
  return rungs;
}
