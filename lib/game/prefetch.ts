/**
 * WHERE ON EARTH: the feed's imagery, fetched before it is asked for.
 *
 * A bought hint used to start its photograph's download on the tap, and a
 * zoom step its nine tiles', and each arrived seconds later against a running
 * clock. The two sites of the day are known from the round, so everything the
 * feed can show is requested when the run launches: the four photographs and
 * the 3x3 mosaic at every zoom the dial reaches, for both sites. The bytes are
 * fetched into blobs and the image that later mounts is handed the blob's
 * address, so it paints on the same frame as the tap with no network in the
 * way. A blob rather than a warmed `<img>` because the page cannot depend on
 * how each browser's cache treats a second request for the same picture; a
 * blob is the bytes, in hand, whatever the cache thinks.
 *
 * The fetch is possible because both sources are one hop with
 * `Access-Control-Allow-Origin` on it: the direct photograph address
 * (`thumbUrl`), exactly as a Wikipedia article embeds it, and the tile server.
 * The slow road for a photograph (`commonsUrl`) hides behind redirects that
 * carry no such header and cannot be read this way. If a fetch fails for any
 * reason the image simply loads itself from the network as it always did.
 * Best effort throughout: nothing here can throw, and a run plays out with
 * the pictures arriving late rather than not at all.
 *
 * About sixty requests and a megabyte or so, spread over the two minutes of
 * flight before the station; the browser queues them per host on its own.
 */

import { commonsUrl, opticZoom, thumbUrl, tilesAround } from "./feed";
import { STATION } from "./Tuning";
import type { EarthShot, Round } from "./types";

interface Held {
  /** The blob's address once the bytes are in, else the network address. */
  url: string;
  /** Kept referenced so the decoded picture stays warm as well as the bytes. */
  image: HTMLImageElement | null;
}

/** Keyed on the network address, which is what the view would otherwise mount. */
const held = new Map<string, Held>();

/** The direct address for a photograph, or the slow road if it has no direct one. */
export function directUrl(shot: EarthShot): string {
  return thumbUrl(shot.file, STATION.groundWidth) ?? commonsUrl(shot.file, STATION.groundWidth);
}

/** The address a figure should mount with: the warmed one if there is one. */
export function groundUrl(shot: EarthShot): string {
  return warmUrl(directUrl(shot));
}

/** The address an image should mount with for a network address: its blob if fetched. */
export function warmUrl(url: string): string {
  return held.get(url)?.url ?? url;
}

/** Warm every picture the round's sites can show: photographs and tiles at every zoom. */
export function preloadFeed(round: Round): void {
  if (typeof fetch !== "function" || typeof URL?.createObjectURL !== "function") return;
  for (const question of round.questions) {
    if (question.type !== "earth") continue;
    if (question.street) void warm(directUrl(question.street));
    if (question.structure) void warm(directUrl(question.structure));
    // The dial's own zoom first, so the feed itself comes up faster too.
    const steps = [...STATION.zoomSteps].sort((a, b) => Math.abs(a) - Math.abs(b));
    for (const step of steps) {
      const zoom = opticZoom(question.zoom, step);
      for (const tile of tilesAround(question.lat, question.lon, zoom)) void warm(tile.url);
    }
  }
}

async function warm(url: string): Promise<void> {
  if (held.has(url)) return;
  const entry: Held = { url, image: null };
  held.set(url, entry);
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return;
    entry.url = URL.createObjectURL(blob);
    // Decoded as well as downloaded, so the first paint is not a JPEG decode.
    if (typeof Image !== "undefined") {
      const image = new Image();
      image.src = entry.url;
      entry.image = image;
      if (typeof image.decode === "function") image.decode().catch(() => {});
    }
  } catch {
    // Offline, rate limited, blocked: the image fetches itself when shown.
  }
}
