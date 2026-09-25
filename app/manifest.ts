import type { MetadataRoute } from "next";

/**
 * Add to Home Screen. Standalone so a run launched from the icon fills the
 * screen with no browser bar, portrait because that is how it is played.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Astro Run",
    short_name: "Astro Run",
    description: "A daily trivia run in space. Eight questions, one run a day.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#071122",
    theme_color: "#071122",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
