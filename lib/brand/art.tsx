import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The link preview and the home screen icon, drawn at build time with
 * `next/og`. Server only: the files are read off disk, and every route that
 * uses this is prerendered, so nothing here runs on a request.
 *
 * Colours are the game's own (`--space`, the plasma cyan, the score yellow);
 * the ship is standard issue, the one every new player flies.
 */

const SPACE = "#071122";
const CYAN = "79, 241, 255";
const YELLOW = "#ffe03d";
const LABEL = "#9aa3b2";

// Literal paths, one per file: a path built from a variable makes the build
// trace the whole project into the server bundle.
function png(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function logo(): Promise<string> {
  return png(await readFile(join(process.cwd(), "public/astro-run-logo.png")));
}

async function ship(): Promise<string> {
  return png(await readFile(join(process.cwd(), "public/ships/cinder.png")));
}

function arcadeFont(): Promise<Buffer> {
  return readFile(join(process.cwd(), "app/fonts/PressStart2P-Regular.ttf"));
}

/** A fixed scatter of dim stars, the same every build. */
function stars(width: number, height: number, count: number) {
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, i) => {
    const size = rand() < 0.15 ? 3 : 2;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: Math.floor(rand() * width),
          top: Math.floor(rand() * height),
          width: size,
          height: size,
          background: `rgba(255, 255, 255, ${0.25 + rand() * 0.35})`,
        }}
      />
    );
  });
}

/** The preview a shared link unfurls into: 1200x630, the Open Graph size. */
export const PREVIEW_SIZE = { width: 1200, height: 630 };

export async function previewImage(): Promise<ImageResponse> {
  const [logoSrc, shipSrc, arcade] = await Promise.all([logo(), ship(), arcadeFont()]);
  const { width, height } = PREVIEW_SIZE;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: SPACE,
          backgroundImage: `radial-gradient(circle at 82% 45%, rgba(${CYAN}, 0.14), rgba(${CYAN}, 0) 60%)`,
        }}
      >
        {stars(width, height, 110)}

        <div
          style={{
            position: "absolute",
            left: 72,
            top: 64,
            display: "flex",
            fontFamily: "Arcade",
            fontSize: 18,
            letterSpacing: 2,
            color: `rgb(${CYAN})`,
          }}
        >
          DAILY TRIVIA RUN
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={760}
          height={257}
          alt=""
          style={{ position: "absolute", left: 40, top: 108 }}
        />

        <div
          style={{
            position: "absolute",
            left: 72,
            top: 420,
            display: "flex",
            flexDirection: "column",
            gap: 26,
          }}
        >
          <div style={{ display: "flex", fontFamily: "Arcade", fontSize: 28, color: YELLOW }}>
            8 QUESTIONS · ONE RUN A DAY
          </div>
          <div style={{ display: "flex", fontFamily: "Arcade", fontSize: 22, color: "#ffffff" }}>
            SAME RUN FOR EVERYONE
          </div>
          <div style={{ display: "flex", fontFamily: "Arcade", fontSize: 22, color: "#ffffff" }}>
            CAN YOU BEAT YOUR FRIENDS?
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shipSrc}
          width={340}
          height={174}
          alt=""
          style={{ position: "absolute", right: 56, top: 190 }}
        />

        <div
          style={{
            position: "absolute",
            right: 72,
            bottom: 40,
            display: "flex",
            fontFamily: "Arcade",
            fontSize: 16,
            color: LABEL,
          }}
        >
          ASTRORUN.IO
        </div>
      </div>
    ),
    {
      ...PREVIEW_SIZE,
      fonts: [{ name: "Arcade", data: arcade, style: "normal", weight: 400 }],
    },
  );
}

/**
 * The app icon at any square size: the ship on deep space with a plasma glow.
 * The hull fills 78% of the width, big enough to read at 60px on a home
 * screen; Android's round mask trims no more than the tips of its wings, so
 * the one PNG serves as both the plain and the maskable icon.
 */
export async function appIcon(size: number): Promise<ImageResponse> {
  const shipSrc = await ship();
  const w = Math.round(size * 0.78);
  const h = Math.round((w * 356) / 697);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: SPACE,
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(${CYAN}, 0.55), rgba(${CYAN}, 0) 66%)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shipSrc} width={w} height={h} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
