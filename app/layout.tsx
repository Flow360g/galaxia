import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  themeColor: "#0d1b2e",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
