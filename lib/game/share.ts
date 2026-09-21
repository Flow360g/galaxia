import { SHARE, SHIPS } from "./Tuning";
import { formatDistance, formatRoundNumber, formatScore } from "./format";
import { PHASE_TITLE } from "./phaseTitles";
import type { Question, RunSummary, ScoreLine } from "./types";

/**
 * The share card: one 1080x1350 PNG, and the block of squares that goes with
 * it into a group chat.
 *
 * It used to lead with a velocity chart: seven marker shapes, a streak bar and
 * five stat cells. It read as a telemetry printout, and a friend scrolling past
 * had to study it to learn whether you had a good day. Wordle settled that
 * argument years ago. The card now says the score, then four rows of filled
 * squares, one per stage of the run, and the text share says exactly the same
 * thing in emoji so the picture and the paste can never disagree.
 *
 * Pure 2D canvas, no React, so it can render into an offscreen element from
 * anywhere in the browser. Every layout figure lives in the constants below;
 * the drawing code only ever reads them. Nothing here throws on odd data: a
 * run with no lines draws an empty table rather than a blank card.
 */

// ------------------------------------------------------------------ layout

const W = SHARE.width;
const H = SHARE.height;
const PAD = 64;

/** The logo, centred at the top, scaled from its own 1400x473. */
const LOGO_TOP = 54;
const LOGO_WIDTH = 460;
const LOGO_ASPECT = 473 / 1400;

const EYEBROW_Y = 262;
const EYEBROW_RULE_Y = 284;

const HERO_LABEL_Y = 336;
const HERO_Y = 442;
const HERO_FONT = 104;
const HERO_UNIT_FONT = 26;
const HERO_UNIT_GAP = 22;
/** The "/ 1,800" anchor, set under the hero figure rather than beside it: at
 *  four digits the score already runs half the card wide. */
const HERO_MAX_Y = 484;
const HERO_MAX_FONT = 26;
/** Distance, demoted to the right of the hero band but still a real figure. */
const DISTANCE_FIGURE_FONT = 34;
const DISTANCE_UNIT_FONT = 16;
const DISTANCE_UNIT_GAP = 12;

/** The stage table: four rows, each a hairline, a name, a meter and a figure. */
const TABLE_TOP = 528;
const ROW_H = 118;
const ROW_NAME_Y = 46;
const ROW_POINTS_Y = 52;
const ROW_POINTS_FONT = 34;
const ROW_MAX_Y = 84;
const METER_TOP = 60;
const METER_CELL = 40;
const METER_GAP = 12;

const SUMMARY_RULE_Y = TABLE_TOP + ROW_H * 4;
const SUMMARY_TEXT_Y = SUMMARY_RULE_Y + 42;

const RIDE_RULE_Y = SUMMARY_TEXT_Y + 34;
const RIDE_LABEL_Y = RIDE_RULE_Y + 34;
const RIDE_IMAGE_TOP = RIDE_LABEL_Y + 8;
const RIDE_IMAGE_H = 166;
const RIDE_IMAGE_W = 300;
const RIDE_TEXT_GAP = 24;
const RIDE_NAME_Y = RIDE_IMAGE_TOP + 86;
const RIDE_CLASS_Y = RIDE_IMAGE_TOP + 120;

const FOOTER_RULE_Y = 1302;
const FOOTER_Y = 1332;
const FOOTER_FONT = 14;

// ----------------------------------------------------------------- palette

const INK = "#071122";
const WHITE = "#ffffff";
const LABEL = "#9aa3b2";
const RULE = "rgba(228, 231, 236, 0.14)";
const CYAN = "#4ff1ff";
const YELLOW = "#ffe03d";

const ARCADE_FALLBACK = '"Press Start 2P", monospace';

// ------------------------------------------------------------------ stages

/**
 * The run's four stages, in flight order.
 *
 * A round is always two cluster, two vector, two mcq, two earth, in four named
 * stages, so a question's type is also its stage. That is what lets the card
 * group the tally without being handed the round: `RunSummary` is everything
 * the card gets, and it does not carry one.
 *
 * The emoji are for the copied text only. The card draws its own squares.
 */
const STAGES: ReadonlyArray<{ type: Question["type"]; name: string; emoji: string }> = [
  { type: "cluster", name: "CLUSTER BELT", emoji: "🪨" },
  { type: "vector", name: "ALIEN CONTACT", emoji: "👽" },
  { type: "mcq", name: "OPEN SKY", emoji: "❔" },
  { type: "earth", name: "WHERE ON EARTH", emoji: "🌏" },
];

interface StageRow {
  name: string;
  emoji: string;
  type: Question["type"];
  points: number;
  max: number;
  /** Cells of `SHARE.meterCells` this stage filled. */
  filled: number;
  /** Encounters in this stage that were actually flown. */
  flown: number;
  /** Encounters in this stage that scored. */
  scored: number;
}

/**
 * A line's stage. `type` has been on `ScoreLine` since the card was rebuilt;
 * a run read back from localStorage may predate it, and its label is the only
 * thing left to go on.
 */
function typeOf(line: ScoreLine): Question["type"] | null {
  if (line.type) return line.type;
  for (const [type, title] of Object.entries(PHASE_TITLE)) {
    if (title === line.label) return type as Question["type"];
  }
  return null;
}

function stageRows(summary: RunSummary): StageRow[] {
  const lines = summary.lines ?? [];
  return STAGES.map((stage) => {
    const mine = lines.filter((line) => typeOf(line) === stage.type);
    const points = mine.reduce((sum, line) => sum + safe(line.points), 0);
    const max = mine.reduce((sum, line) => sum + safe(line.max), 0);
    return {
      name: stage.name,
      emoji: stage.emoji,
      type: stage.type,
      points,
      max,
      filled: fillFor(points, max),
      flown: mine.length,
      scored: mine.filter((line) => safe(line.points) > 0).length,
    };
  });
}

/** How many of a stage's cells its points fill. Never negative, never over. */
function fillFor(points: number, max: number): number {
  if (!(max > 0)) return 0;
  const share = Math.max(0, Math.min(1, points / max));
  return Math.round(share * SHARE.meterCells);
}

// ------------------------------------------------------------------- earth

/**
 * WHERE ON EARTH in plain words.
 *
 * It used to read NOT REACHED whenever no outcome of kind `dock` was recorded,
 * which told a player who had flown the station and named a site that they
 * never got there. The station is always reached; what varies is how many of
 * the two landing sites were named, so that is what it says.
 */
export function earthLineFor(summary: RunSummary): string | null {
  const earth = (summary.lines ?? []).filter((line) => typeOf(line) === "earth");
  if (earth.length === 0) return null;
  const found = earth.filter((line) => safe(line.points) > 0).length;
  if (found === 0) return "NO LOCATIONS IDENTIFIED";
  if (found >= earth.length) {
    return earth.length === 2 ? "BOTH LOCATIONS IDENTIFIED" : "ALL LOCATIONS IDENTIFIED";
  }
  return `${found} OF ${earth.length} LOCATIONS IDENTIFIED`;
}

// ------------------------------------------------------------------ public

/** Draws the full card into `canvas`, resizing it to SHARE dimensions. */
export function renderShareCard(canvas: HTMLCanvasElement, summary: RunSummary): void {
  try {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const arcade = arcadeFamily();
    const rows = stageRows(summary);

    drawBackground(ctx);
    drawLogo(ctx, summary, arcade);
    drawEyebrow(ctx, summary, arcade);
    drawHero(ctx, summary, arcade);
    drawTable(ctx, rows, arcade);
    drawSummaryLine(ctx, summary, arcade);
    drawRide(ctx, summary, arcade);
    drawFooter(ctx, arcade);
  } catch {
    // A share card must never take the run screen down with it.
  }
}

/** Renders offscreen and resolves the PNG. */
export async function shareCardBlob(summary: RunSummary): Promise<Blob> {
  await Promise.all([waitForFonts(), preloadShareArt(summary.shipId)]);
  const canvas = document.createElement("canvas");
  renderShareCard(canvas, summary);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Share card could not be encoded"));
    }, "image/png");
  });
}

/**
 * The block for the clipboard: the round, the score, one row of squares per
 * stage, and where to go and play it.
 *
 * Same four groups and the same fill as the card draws, from the same
 * `stageRows`, so a screenshot and a paste of the same run always agree.
 */
export function shareText(summary: RunSummary): string {
  const heading = `ASTRORUN #${formatRoundNumber(summary.roundNumber)}`;
  const max = stored(summary.maxScore);
  const score = stored(summary.score);

  // A run stored before the score existed has no total to quote, and printing
  // "NaN/0" is worse than falling back to the distance it does have.
  if (max === null || max <= 0 || score === null) {
    return [heading, "", `${formatDistance(summary.distance)} km flown`, "", SHARE.site].join(
      "\n",
    );
  }

  const rows = stageRows(summary).map(
    (row) =>
      `${"🟦".repeat(row.filled)}${"⬜️".repeat(Math.max(0, SHARE.meterCells - row.filled))} ${formatScore(row.points)} ${row.emoji}`,
  );

  return [
    heading,
    "",
    `Total Score: ${formatScore(score)}/${formatScore(max)}`,
    "",
    ...rows,
    "",
    SHARE.site,
  ].join("\n");
}

// -------------------------------------------------------------------- art

/**
 * The logo and the ship stills, loaded once and kept.
 *
 * `renderShareCard` is synchronous, because the results screen draws it inside
 * an effect. So the images are warmed here first and the draw takes whatever
 * has arrived: a still that failed to load costs its picture and never the
 * card.
 */
const ART = new Map<string, HTMLImageElement | null>();
const ART_PENDING = new Map<string, Promise<HTMLImageElement | null>>();

const LOGO_SRC = "/astro-run-logo.png";

/**
 * The hull the run was flown in, straight off the catalogue.
 *
 * Read from `SHIPS` rather than through `ships.ts`, which is the hangar's
 * read side and pulls localStorage in with it. The card only wants a name and
 * a filename, and it has to stay a pure drawing module. An id that is not in
 * the catalogue, from a stored run or a hull that was removed, falls back to
 * standard issue rather than drawing nothing.
 */
function shipFor(shipId: string | undefined): (typeof SHIPS)[number] {
  return SHIPS.find((ship) => ship.id === shipId) ?? SHIPS[0];
}

function shipSrc(shipId: string | undefined): string {
  return `/ships/${shipFor(shipId).id}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  const pending = ART_PENDING.get(src);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    try {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        ART.set(src, image);
        resolve(image);
      };
      image.onerror = () => {
        ART.set(src, null);
        resolve(null);
      };
      image.src = src;
    } catch {
      ART.set(src, null);
      resolve(null);
    }
  });

  ART_PENDING.set(src, promise);
  return promise;
}

/** Warms the logo and this run's hull. Resolves whether or not they arrive. */
export async function preloadShareArt(shipId?: string): Promise<void> {
  if (typeof window === "undefined") return;
  await Promise.all([loadImage(LOGO_SRC), loadImage(shipSrc(shipId))]);
}

function art(src: string): HTMLImageElement | null {
  return ART.get(src) ?? null;
}

// ------------------------------------------------------------------- fonts

/**
 * next/font renames the face, so the real family name is only known from the
 * CSS variable it sets on <html>. Fall back to the plain name for any page
 * that loads the font by hand.
 */
function arcadeFamily(): string {
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--arcade")
      .trim();
    return value ? `${value}, ${ARCADE_FALLBACK}` : ARCADE_FALLBACK;
  } catch {
    return ARCADE_FALLBACK;
  }
}

async function waitForFonts(): Promise<void> {
  try {
    const fonts = document.fonts;
    if (!fonts) return;
    await fonts.load(`16px ${arcadeFamily()}`).catch(() => undefined);
    await fonts.ready;
  } catch {
    // No FontFaceSet, or it rejected. Draw with whatever is there.
  }
}

function arcadeFont(px: number, family: string): string {
  return `${px}px ${family}`;
}

// ----------------------------------------------------------------- helpers

type Ctx = CanvasRenderingContext2D;

function safe(n: number | undefined, fallback = 0): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * A field that a summary read back from localStorage may simply not have: the
 * score arrived after some runs were already stored. Null means "this run
 * predates the figure", which is a different thing from a zero.
 */
function stored(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hairline(ctx: Ctx, y: number): void {
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 0.5);
  ctx.lineTo(W - PAD, y + 0.5);
  ctx.stroke();
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "left",
): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

// ---------------------------------------------------------------- sections

function drawBackground(ctx: Ctx): void {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  // A faint cyan wash behind the table, so the middle of the card reads as a
  // viewport rather than a spreadsheet.
  const wash = ctx.createRadialGradient(W / 2, TABLE_TOP + 120, 40, W / 2, TABLE_TOP + 120, 700);
  wash.addColorStop(0, "rgba(79, 241, 255, 0.07)");
  wash.addColorStop(1, "rgba(79, 241, 255, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // A scatter of dim stars. Deterministic so the same run makes the same card.
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  for (let i = 0; i < 90; i += 1) {
    const x = rand() * W;
    const y = rand() * H;
    const s = rand() < 0.15 ? 2 : 1;
    ctx.fillRect(Math.floor(x), Math.floor(y), s, s);
  }
}

/** The logo owns the top of the card. Falls back to the wordmark in type. */
function drawLogo(ctx: Ctx, summary: RunSummary, arcade: string): void {
  const logo = art(LOGO_SRC);
  if (logo) {
    const h = LOGO_WIDTH * LOGO_ASPECT;
    ctx.drawImage(logo, (W - LOGO_WIDTH) / 2, LOGO_TOP, LOGO_WIDTH, h);
    return;
  }
  text(ctx, "ASTRO RUN", W / 2, LOGO_TOP + 96, arcadeFont(52, arcade), WHITE, "center");
  void summary;
}

function drawEyebrow(ctx: Ctx, summary: RunSummary, arcade: string): void {
  text(
    ctx,
    `#${formatRoundNumber(summary.roundNumber)} · ${summary.date}`,
    PAD,
    EYEBROW_Y,
    arcadeFont(13, arcade),
    CYAN,
  );
  const theme = summary.theme.trim();
  if (theme) {
    text(ctx, theme.toUpperCase(), W - PAD, EYEBROW_Y, arcadeFont(13, arcade), LABEL, "right");
  }
  hairline(ctx, EYEBROW_RULE_Y);
}

/**
 * The hero band: SCORE out of a perfect run, with distance beside it.
 *
 * The score leads because it is the figure the run is played for and the only
 * one that means anything on its own: "1,375 / 1,800" is legible to somebody
 * who has never flown. The maximum is never dropped, because the score without
 * its anchor is just another number nobody can place. Distance keeps a real
 * figure on the right: it is still flown and still tracked, just no longer the
 * headline.
 *
 * A summary stored before the score existed has no anchor to show, so it falls
 * back to the old card and leads with distance rather than drawing "NaN".
 */
function drawHero(ctx: Ctx, summary: RunSummary, arcade: string): void {
  const max = stored(summary.maxScore);
  const score = stored(summary.score);
  if (max === null || max <= 0 || score === null) {
    drawLegacyDistance(ctx, summary, arcade);
    return;
  }

  text(ctx, "SCORE", PAD, HERO_LABEL_Y, arcadeFont(12, arcade), LABEL);

  ctx.save();
  ctx.shadowColor = "rgba(255, 224, 61, 0.55)";
  ctx.shadowBlur = 28;
  text(ctx, formatScore(score), PAD, HERO_Y, arcadeFont(HERO_FONT, arcade), YELLOW);
  ctx.restore();
  text(ctx, `/ ${formatScore(max)}`, PAD, HERO_MAX_Y, arcadeFont(HERO_MAX_FONT, arcade), LABEL);

  drawDistanceAside(ctx, summary, arcade);
}

/** Distance, right-aligned in the hero band: second billing, same eye line. */
function drawDistanceAside(ctx: Ctx, summary: RunSummary, arcade: string): void {
  text(ctx, "DISTANCE FLOWN", W - PAD, HERO_LABEL_Y, arcadeFont(12, arcade), LABEL, "right");

  ctx.font = arcadeFont(DISTANCE_UNIT_FONT, arcade);
  const unitWidth = ctx.measureText("KM").width;
  text(ctx, "KM", W - PAD, HERO_Y, arcadeFont(DISTANCE_UNIT_FONT, arcade), LABEL, "right");
  text(
    ctx,
    formatDistance(summary.distance),
    W - PAD - unitWidth - DISTANCE_UNIT_GAP,
    HERO_Y,
    arcadeFont(DISTANCE_FIGURE_FONT, arcade),
    WHITE,
    "right",
  );
}

/** The card as it was before the score: distance as the hero figure. */
function drawLegacyDistance(ctx: Ctx, summary: RunSummary, arcade: string): void {
  text(ctx, "DISTANCE FLOWN", PAD, HERO_LABEL_Y, arcadeFont(12, arcade), LABEL);

  const figure = formatDistance(summary.distance);
  ctx.save();
  ctx.shadowColor = "rgba(255, 224, 61, 0.55)";
  ctx.shadowBlur = 28;
  text(ctx, figure, PAD, HERO_Y, arcadeFont(HERO_FONT, arcade), YELLOW);
  ctx.restore();

  ctx.font = arcadeFont(HERO_FONT, arcade);
  const width = ctx.measureText(figure).width;
  text(ctx, "KM", PAD + width + HERO_UNIT_GAP, HERO_Y, arcadeFont(HERO_UNIT_FONT, arcade), LABEL);
}

// ------------------------------------------------------------------- table

/**
 * Four rows, one per stage: the name, the squares, and what the stage was
 * worth. The squares are the point of the card, so they are the only thing on
 * it drawn in the plasma cyan the run is built around.
 */
function drawTable(ctx: Ctx, rows: StageRow[], arcade: string): void {
  rows.forEach((row, i) => {
    const top = TABLE_TOP + ROW_H * i;
    hairline(ctx, top);

    text(ctx, row.name, PAD, top + ROW_NAME_Y, arcadeFont(17, arcade), WHITE);
    drawMeter(ctx, PAD, top + METER_TOP, row.filled);

    text(
      ctx,
      formatScore(row.points),
      W - PAD,
      top + ROW_POINTS_Y,
      arcadeFont(ROW_POINTS_FONT, arcade),
      row.points > 0 ? YELLOW : LABEL,
      "right",
    );
    if (row.max > 0) {
      text(
        ctx,
        `/ ${formatScore(row.max)}`,
        W - PAD,
        top + ROW_MAX_Y,
        arcadeFont(13, arcade),
        LABEL,
        "right",
      );
    }
  });
  hairline(ctx, SUMMARY_RULE_Y);
}

function drawMeter(ctx: Ctx, x: number, y: number, filled: number): void {
  for (let i = 0; i < SHARE.meterCells; i += 1) {
    const cx = x + i * (METER_CELL + METER_GAP);
    if (i < filled) {
      ctx.fillStyle = CYAN;
      ctx.fillRect(cx, y, METER_CELL, METER_CELL);
    } else {
      ctx.strokeStyle = RULE;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, y + 0.5, METER_CELL - 1, METER_CELL - 1);
    }
  }
}

/** The landing sites on the left, the best streak on the right. One line. */
function drawSummaryLine(ctx: Ctx, summary: RunSummary, arcade: string): void {
  const earth = earthLineFor(summary);
  if (earth) {
    text(ctx, earth, PAD, SUMMARY_TEXT_Y, arcadeFont(14, arcade), CYAN);
  }
  const streak = Math.max(0, Math.floor(safe(summary.bestStreak)));
  if (streak > 0) {
    text(
      ctx,
      `BEST STREAK x${streak}`,
      W - PAD,
      SUMMARY_TEXT_Y,
      arcadeFont(14, arcade),
      WHITE,
      "right",
    );
  }
}

/** The hull that flew it. Cosmetic, and the one warm thing on the card. */
function drawRide(ctx: Ctx, summary: RunSummary, arcade: string): void {
  hairline(ctx, RIDE_RULE_Y);
  text(ctx, "TODAY'S RIDE", PAD, RIDE_LABEL_Y, arcadeFont(12, arcade), LABEL);

  const ship = shipFor(summary.shipId);
  const still = art(shipSrc(summary.shipId));
  let textX = PAD;
  if (still && still.naturalWidth > 0 && still.naturalHeight > 0) {
    // Fit inside the box rather than filling it, so a hull with a different
    // aspect is never stretched.
    const scale = Math.min(RIDE_IMAGE_W / still.naturalWidth, RIDE_IMAGE_H / still.naturalHeight);
    const w = still.naturalWidth * scale;
    const h = still.naturalHeight * scale;
    ctx.drawImage(still, PAD + (RIDE_IMAGE_W - w) / 2, RIDE_IMAGE_TOP + (RIDE_IMAGE_H - h) / 2, w, h);
    textX = PAD + RIDE_IMAGE_W + RIDE_TEXT_GAP;
  }

  text(ctx, ship.name.toUpperCase(), textX, RIDE_NAME_Y, arcadeFont(22, arcade), WHITE);
  text(ctx, ship.className.toUpperCase(), textX, RIDE_CLASS_Y, arcadeFont(12, arcade), LABEL);
}

function drawFooter(ctx: Ctx, arcade: string): void {
  hairline(ctx, FOOTER_RULE_Y);
  text(ctx, "ASTRO RUN", PAD, FOOTER_Y, arcadeFont(FOOTER_FONT, arcade), WHITE);
  text(ctx, SHARE.site, W - PAD, FOOTER_Y, arcadeFont(FOOTER_FONT, arcade), CYAN, "right");
}
