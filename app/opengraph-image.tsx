import { PREVIEW_SIZE, previewImage } from "@/lib/brand/art";

/** What a shared link unfurls into in a group chat. Drawn once at build. */
export const alt = "Astro Run: a daily trivia run. Eight questions, one run a day.";
export const size = PREVIEW_SIZE;
export const contentType = "image/png";

export default function Image() {
  return previewImage();
}
