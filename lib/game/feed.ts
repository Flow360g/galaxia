/**
 * WHERE ON EARTH: the satellite feed's imagery.
 *
 * Slippy-map arithmetic and the tile source, kept out of the component so the
 * maths can be read on its own. Sentinel-2 cloudless is openly licensed and is
 * close to what the game could actually ship; it caps out around zoom 14, and
 * the site pool is framed with that in mind.
 */

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
 */
export function commonsUrl(file: string, width: number): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    file.replace(/ /g, "_"),
  )}?width=${width}`;
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
