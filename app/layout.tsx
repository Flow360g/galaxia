import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/** Press Start 2P (OFL). The arcade face for titles, figures and buttons. */
const arcade = localFont({
  src: "./fonts/PressStart2P-Regular.ttf",
  variable: "--arcade",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Galaxia",
  description:
    "A daily quiz flight. Answer the asteroids, fly as far as you can.",
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
      <body>{children}</body>
    </html>
  );
}
