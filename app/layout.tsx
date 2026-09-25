import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { MenuMusic } from "@/components/MenuMusic";
import { SHARE } from "@/lib/game/Tuning";
import "./globals.css";

/** Press Start 2P (OFL). The arcade face for titles, figures and buttons. */
const arcade = localFont({
  src: "./fonts/PressStart2P-Regular.ttf",
  variable: "--arcade",
  display: "swap",
  adjustFontFallback: false,
});

const DESCRIPTION =
  "A daily trivia game in space. Eight questions, one run a day, and everyone gets the same run. Score your run and see if you can beat your friends.";

/**
 * What a shared link says about itself. The preview image is
 * `opengraph-image.tsx` beside this file; `metadataBase` makes its address
 * absolute, which chat apps need before they will fetch it. The icons are
 * `icon.svg`, `apple-icon.tsx` and the manifest's, all in this folder.
 */
export const metadata: Metadata = {
  metadataBase: new URL(`https://${SHARE.site}`),
  title: "Astro Run",
  description: DESCRIPTION,
  applicationName: "Astro Run",
  openGraph: {
    title: "Astro Run",
    description: DESCRIPTION,
    siteName: "Astro Run",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Astro Run",
    description: DESCRIPTION,
  },
  // Launched from the home screen it runs full screen, like an app. Every
  // screen already pads for the notch, so the status bar can sit over it.
  appleWebApp: {
    capable: true,
    title: "Astro Run",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // The game is a fixed surface. Pinch-zoom and pull-to-refresh both fight
  // drag-to-steer, so they are disabled at the document level.
  userScalable: false,
  themeColor: "#071122",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={arcade.variable}>
      <body>
        {children}
        <MenuMusic />
        <Analytics />
      </body>
    </html>
  );
}
