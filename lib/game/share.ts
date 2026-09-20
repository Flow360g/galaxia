import { SHARE } from "./Tuning";
import { formatDistance, formatRoundNumber, formatScore, formatVelocity } from "./format";
import type { FlightSample, OutcomeKind, RunEvent, RunSummary } from "./types";

/**
 * The share card: one 1080x1350 PNG that tells the day's run as a story.
 *
 * Pure 2D canvas, no React, so it can render into an offscreen element from
 * anywhere in the browser. Every layout figure lives in the constants below;
 * the drawing code only ever reads them. Nothing here throws on odd data: an
 * empty run draws a flat line and an empty strip rather than a blank card.
 */

// ------------------------------------------------------------------ layout

const W = SHARE.width;
const H = SHARE.height;
const PAD = 64;

const HEADER_Y = 92;
const HEADER_RULE_Y = 124;
const THEME_Y = 162;

const HERO_LABEL_Y = 226;
const HERO_Y = 338;
const HERO_FONT = 104;
const HERO_UNIT_FONT = 26;
const HERO_UNIT_GAP = 22;
/** The "/ 2,400" anchor, set under the hero figure rather than beside it: at
 *  four digits the score already runs half the card wide. */
const HERO_MAX_Y = 380;
const HERO_MAX_FONT = 26;
/** Distance, demoted to the right of the hero band but still a real figure. */
const DISTANCE_FIGURE_FONT = 34;
const DISTANCE_UNIT_FONT = 16;
const DISTANCE_UNIT_GAP = 12;

const CHART_TOP = 420;
const CHART_BOTTOM = 950;
const CHART_LEFT = PAD;
const CHART_RIGHT = W - PAD;
const CHART_INSET_Y = 34;
const CHART_GRID_LINES = 3;
const CHART_LABEL_FONT = 12;
const MARKER_NUMBER_Y = 982;
const MARKER_NUMBER_FONT = 14;
const STREAK_BAR_Y = 1002;
const STREAK_BAR_H = 4;

const STATS_LABEL_Y = 1052;
const STATS_VALUE_Y = 1088;
const STATS_LABEL_FONT = 11;
const STATS_VALUE_FONT = 24;

const EARTH_RULE_Y = 1132;
const EARTH_TEXT_Y = 1172;
const EARTH_FONT = 15;

const RAIL_RULE_Y = 1236;
const RAIL_CELL = 48;
const RAIL_CELL_GAP = 10;
const RAIL_Y = 1262;
const FOOTER_FONT = 14;

const LINE_WIDTH = 4;
const GLOW_WIDTH = 14;
const MARKER_SMALL = 11;
const MARKER_LARGE = 18;
const SHATTER_LINES = 5;

// ----------------------------------------------------------------- palette

const INK = "#071122";
const WHITE = "#ffffff";
const LABEL = "#9aa3b2";
const RULE = "rgba(228, 231, 236, 0.14)";
const CYAN = "#4ff1ff";
const YELLOW = "#ffe03d";
const RED = "#ff6b5c";
const RED_DEEP = "#b3261e";
const VIOLET = "#b28cff";
const ORANGE = "#ff8a1f";
const PANEL_LABEL = "#9aa3b2";

const ARCADE_FALLBACK = '"Press Start 2P", monospace';

// ------------------------------------------------------------------ public

/** Draws the full card into `canvas`, resizing it to SHARE dimensions. */
export function renderShareCard(
  canvas: HTMLCanvasElement,
  summary: RunSummary,
): void {
  try {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const arcade = arcadeFamily();

    drawBackground(ctx);
    drawHeader(ctx, summary, arcade);
    drawHero(ctx, summary, arcade);
    drawChart(ctx, summary, arcade);
    drawStats(ctx, summary, arcade);
    drawEarthLine(ctx, summary, arcade);
    drawRail(ctx, summary, arcade);
  } catch {
    // A share card must never take the run screen down with it.
  }
}

/** Renders offscreen and resolves the PNG. */
export async function shareCardBlob(summary: RunSummary): Promise<Blob> {
  await waitForFonts();
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
 * Three lines for the clipboard: the score out of a perfect run, the glyph
 * strip, then the supporting stats. Short enough to paste into a group chat
 * without it becoming a wall, and the first line alone is the whole brag.
 */
export function shareText(summary: RunSummary): string {
  const total = stripLength(summary);
  const glyphs: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const kind = kindAt(summary, i);
    glyphs.push(kind ? TEXT_GLYPH[kind] : "·");
  }

  // A stored run from before the score has nothing to quote, so that one
  // leads with distance the way the old strip did, and does not repeat it.
  const max = stored(summary.maxScore);
  const score = stored(summary.score);
  const scored = max !== null && max > 0 && score !== null;

  const stats = [
    `Peak ${formatVelocity(summary.peakVelocity)} km/h`,
    `Streak ${Math.max(0, Math.floor(summary.bestStreak))}`,
  ];
  if (scored) stats.unshift(`${formatDistance(summary.distance)} km`);
  if (summary.fullBurns > 0) {
    stats.push(`Full burn${summary.fullBurns > 1 ? "s" : ""} ${summary.fullBurns}`);
  }
  if (summary.ratings?.length) {
    stats.push(`Stage ${summary.ratings.join(" · ")}`);
  }

  const headline = scored
    ? `${formatScore(score)} / ${formatScore(max)}`
    : `${formatDistance(summary.distance)} km`;

  return [
    `ASTRO RUN #${formatRoundNumber(summary.roundNumber)} · ${headline}`,
    glyphs.join(""),
    stats.join(" · "),
  ].join("\n");
}

// ------------------------------------------------------------------- fonts

const TEXT_GLYPH: Record<OutcomeKind, string> = {
  thread: "▶",
  slingshot: "⚡",
  collision: "✕",
  wreck: "✖",
  timeout: "○",
  burn: "»",
  dock: "◎",
  graze: "◇",
};

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

function stripLength(summary: RunSummary): number {
  const total = Math.floor(summary.total);
  if (Number.isFinite(total) && total > 0) return Math.min(total, 12);
  return Math.max(summary.outcomes.length, 7);
}

function kindAt(summary: RunSummary, index: number): OutcomeKind | null {
  const outcome = summary.outcomes[index];
  if (outcome) return outcome.kind;
  const event = summary.events.find((e) => e.index === index);
  return event ? event.kind : null;
}


function safe(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * A field that a summary read back from localStorage may simply not have: the
 * score arrived after some runs were already stored. Null means "this run
 * predates the figure", which is a different thing from a zero.
 */
function stored(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function kindColor(kind: OutcomeKind): string {
  switch (kind) {
    case "thread":
      return CYAN;
    case "slingshot":
      return YELLOW;
    case "burn":
      return ORANGE;
    case "dock":
      return VIOLET;
    case "graze":
      return PANEL_LABEL;
    default:
      return RED;
  }
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

  // A faint cyan wash behind the chart, so the middle of the card reads as
  // a viewport rather than a spreadsheet.
  const wash = ctx.createRadialGradient(W / 2, CHART_TOP + 200, 40, W / 2, CHART_TOP + 200, 700);
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

function drawHeader(ctx: Ctx, summary: RunSummary, arcade: string): void {
  text(
    ctx,
    `ASTRO RUN / ROUND ${formatRoundNumber(summary.roundNumber)}`,
    PAD,
    HEADER_Y,
    arcadeFont(16, arcade),
    CYAN,
  );
  text(ctx, summary.date, W - PAD, HEADER_Y, arcadeFont(16, arcade), LABEL, "right");
  hairline(ctx, HEADER_RULE_Y);

  const theme = summary.theme.trim();
  if (theme) {
    text(ctx, "SECTOR", PAD, THEME_Y, arcadeFont(11, arcade), LABEL);
    text(ctx, theme.toUpperCase(), PAD + 120, THEME_Y, arcadeFont(11, arcade), WHITE);
  }
}

/**
 * The hero band: SCORE out of a perfect run, with distance beside it.
 *
 * The score leads because it is the figure the run is played for and the only
 * one that means anything on its own: "1,880 / 2,400" is legible to somebody
 * who has never flown. The maximum is never dropped, because the score without
 * its anchor is just another number nobody can place. Distance keeps a real
 * figure on the right, since the chart below it is a distance and velocity
 * story, but it is a supporting stat now.
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

  const figure = formatScore(score);
  ctx.save();
  ctx.shadowColor = "rgba(255, 224, 61, 0.55)";
  ctx.shadowBlur = 28;
  text(ctx, figure, PAD, HERO_Y, arcadeFont(HERO_FONT, arcade), YELLOW);
  ctx.restore();
  text(
    ctx,
    `/ ${formatScore(max)}`,
    PAD,
    HERO_MAX_Y,
    arcadeFont(HERO_MAX_FONT, arcade),
    LABEL,
  );

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
  text(
    ctx,
    "KM",
    PAD + width + HERO_UNIT_GAP,
    HERO_Y,
    arcadeFont(HERO_UNIT_FONT, arcade),
    LABEL,
  );
}

// ------------------------------------------------------------------- chart

interface Scale {
  x(t: number): number;
  y(v: number): number;
}

function buildScale(samples: FlightSample[], events: RunEvent[], duration: number): Scale {
  let tMin = Infinity;
  let tMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  const feed = (t: number, v: number) => {
    if (Number.isFinite(t)) {
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
    }
    if (Number.isFinite(v)) {
      vMin = Math.min(vMin, v);
      vMax = Math.max(vMax, v);
    }
  };
  for (const s of samples) feed(s.t, s.v);
  for (const e of events) feed(e.t, e.v);

  if (!Number.isFinite(tMin)) {
    tMin = 0;
    tMax = Math.max(1, safe(duration, 1));
  }
  if (tMax - tMin < 1e-6) tMax = tMin + 1;
  if (!Number.isFinite(vMin)) {
    vMin = 0;
    vMax = 1;
  }
  if (vMax - vMin < 1e-6) {
    // Flat run. Centre the line rather than pin it to an edge.
    vMin -= Math.max(1, Math.abs(vMin) * 0.25);
    vMax += Math.max(1, Math.abs(vMax) * 0.25);
  }

  const top = CHART_TOP + CHART_INSET_Y;
  const bottom = CHART_BOTTOM - CHART_INSET_Y;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  return {
    x: (t) =>
      clamp(
        CHART_LEFT + ((safe(t, tMin) - tMin) / (tMax - tMin)) * (CHART_RIGHT - CHART_LEFT),
        CHART_LEFT,
        CHART_RIGHT,
      ),
    y: (v) =>
      clamp(
        bottom - ((safe(v, vMin) - vMin) / (vMax - vMin)) * (bottom - top),
        top,
        bottom,
      ),
  };
}

function drawChart(ctx: Ctx, summary: RunSummary, arcade: string): void {
  const samples = summary.samples.filter(
    (s) => Number.isFinite(s.t) && Number.isFinite(s.v),
  );
  const events = summary.events
    .filter((e) => Number.isFinite(e.t))
    .slice()
    .sort((a, b) => a.t - b.t);
  const scale = buildScale(samples, events, summary.durationSeconds);

  // Grid: a few velocity hairlines with tiny labels on the right.
  const vLabels = velocityTicks(samples, events);
  for (let i = 0; i <= CHART_GRID_LINES; i += 1) {
    const y = CHART_TOP + ((CHART_BOTTOM - CHART_TOP) * i) / CHART_GRID_LINES;
    hairline(ctx, y);
  }
  for (const tick of vLabels) {
    text(
      ctx,
      `${formatVelocity(tick)}`,
      CHART_RIGHT,
      scale.y(tick) - 6,
      arcadeFont(CHART_LABEL_FONT, arcade),
      "rgba(154, 163, 178, 0.7)",
      "right",
    );
  }
  text(ctx, "VELOCITY KM/H", CHART_LEFT, CHART_TOP - 12, arcadeFont(CHART_LABEL_FONT, arcade), LABEL);

  // The path itself. One sample draws a flat line at its velocity; none at
  // all draws one through the middle of the chart.
  const only = samples[0];
  const flatY = only ? scale.y(only.v) : (CHART_TOP + CHART_BOTTOM) / 2;
  const points: Array<[number, number]> =
    samples.length >= 2
      ? samples.map((s) => [scale.x(s.t), scale.y(s.v)])
      : [
          [CHART_LEFT, flatY],
          [CHART_RIGHT, flatY],
        ];

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return;

  const fill = ctx.createLinearGradient(0, CHART_TOP, 0, CHART_BOTTOM);
  fill.addColorStop(0, "rgba(79, 241, 255, 0.32)");
  fill.addColorStop(1, "rgba(79, 241, 255, 0)");
  ctx.beginPath();
  ctx.moveTo(first[0], CHART_BOTTOM);
  for (const [x, y] of points) ctx.lineTo(x, y);
  ctx.lineTo(last[0], CHART_BOTTOM);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  const stroke = () => {
    ctx.beginPath();
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i];
      if (p) ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(79, 241, 255, 0.22)";
  ctx.lineWidth = GLOW_WIDTH;
  stroke();
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = LINE_WIDTH;
  stroke();
  ctx.restore();

  // Axis.
  ctx.strokeStyle = "rgba(228, 231, 236, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CHART_LEFT, CHART_BOTTOM + 0.5);
  ctx.lineTo(CHART_RIGHT, CHART_BOTTOM + 0.5);
  ctx.stroke();

  // Streak underlines first, so markers and numbers sit on top.
  drawStreakBars(ctx, events, scale);
  drawRatings(ctx, summary, scale, arcade);

  for (const event of events) {
    const x = scale.x(event.t);
    const y = scale.y(event.v);
    drawMarker(ctx, event, x, y);
    if (Number.isInteger(event.index) && event.index >= 0) {
      text(
        ctx,
        `${event.index + 1}`,
        x,
        MARKER_NUMBER_Y,
        arcadeFont(MARKER_NUMBER_FONT, arcade),
        LABEL,
        "center",
      );
    }
  }
}

/** Stage-rating stamps on the timeline, beside the encounter that closed each stage. */
function drawRatings(ctx: Ctx, summary: RunSummary, scale: Scale, arcade: string): void {
  for (const event of summary.events) {
    const rating = event.rating;
    if (!rating) continue;
    const x = scale.x(event.t) + 30;
    const y = CHART_TOP + 22;
    const color = rating === "S" ? YELLOW : rating === "A" ? CYAN : rating === "B" ? WHITE : RED;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 15, y - 15, 30, 30);
    text(ctx, rating, x, y + 6, arcadeFont(16, arcade), color, "center");
    ctx.restore();
  }
}

function velocityTicks(samples: FlightSample[], events: RunEvent[]): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of samples) {
    lo = Math.min(lo, s.v);
    hi = Math.max(hi, s.v);
  }
  for (const e of events) {
    if (Number.isFinite(e.v)) {
      lo = Math.min(lo, e.v);
      hi = Math.max(hi, e.v);
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1) return [];
  return [hi, lo];
}

function drawStreakBars(ctx: Ctx, events: RunEvent[], scale: Scale): void {
  let runStart: RunEvent | null = null;
  let runEnd: RunEvent | null = null;
  let runLength = 0;
  const flush = () => {
    if (runStart && runEnd && runLength >= 2) {
      const x0 = scale.x(runStart.t);
      const x1 = scale.x(runEnd.t);
      ctx.fillStyle = "rgba(79, 241, 255, 0.55)";
      ctx.fillRect(x0 - MARKER_SMALL, STREAK_BAR_Y, x1 - x0 + MARKER_SMALL * 2, STREAK_BAR_H);
    }
    runStart = null;
    runEnd = null;
    runLength = 0;
  };
  for (const event of events) {
    if (event.correct) {
      if (!runStart) runStart = event;
      runEnd = event;
      runLength += 1;
    } else {
      flush();
    }
  }
  flush();
}

// ----------------------------------------------------------------- markers

function drawMarker(ctx: Ctx, event: RunEvent, x: number, y: number): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (event.kind) {
    case "thread":
      drawDiamond(ctx, x, y, MARKER_SMALL, CYAN);
      break;
    case "slingshot":
      drawStreakTrail(ctx, x, y);
      drawStar(ctx, x, y, MARKER_LARGE, YELLOW);
      break;
    case "burn": {
      // Sized by the charge banked: a full burn is the biggest mark on the card.
      const charge = Math.max(1, Math.min(3, Math.floor(safe(event.charge ?? 1, 1))));
      if (charge >= 2) drawStreakTrail(ctx, x, y);
      drawChevrons(ctx, x, y, MARKER_SMALL + charge * 3, charge, ORANGE);
      break;
    }
    case "collision":
      drawShatter(ctx, x, y, MARKER_SMALL + 4, 1);
      drawCross(ctx, x, y, MARKER_SMALL, RED, 4);
      break;
    case "wreck":
      drawShatter(ctx, x, y, MARKER_LARGE + 8, 2);
      drawStar(ctx, x, y, MARKER_LARGE, RED_DEEP);
      drawCross(ctx, x, y, MARKER_SMALL, RED, 4);
      break;
    case "timeout":
      ctx.strokeStyle = RED;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, MARKER_SMALL, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "dock":
      drawDockRing(ctx, x, y, MARKER_SMALL + 2, VIOLET);
      break;
    case "graze":
      // Hollow: the shape of a hit with nothing in it.
      ctx.strokeStyle = PANEL_LABEL;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - MARKER_SMALL);
      ctx.lineTo(x + MARKER_SMALL, y);
      ctx.lineTo(x, y + MARKER_SMALL);
      ctx.lineTo(x - MARKER_SMALL, y);
      ctx.closePath();
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** The station: a ring with a point at its centre, the docking axis seen end on. */
function drawDockRing(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r * 0.28, 2), 0, Math.PI * 2);
  ctx.fill();
}

function drawDiamond(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.4);
  ctx.lineTo(x + r * 0.4, y);
  ctx.lineTo(x, y + r * 0.4);
  ctx.lineTo(x - r * 0.4, y);
  ctx.closePath();
  ctx.fill();
}

function drawStar(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI / 4) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.42;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

/** Stacked chevrons pointing right: one per plasma banked. */
function drawChevrons(ctx: Ctx, x: number, y: number, r: number, count: number, color: string): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  const step = r * 0.55;
  const left = x - ((count - 1) * step) / 2;
  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const cx = left + i * step;
    ctx.moveTo(cx - r * 0.45, y - r);
    ctx.lineTo(cx + r * 0.35, y);
    ctx.lineTo(cx - r * 0.45, y + r);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawStreakTrail(ctx: Ctx, x: number, y: number): void {
  const trail = ctx.createLinearGradient(x - 70, y, x, y);
  trail.addColorStop(0, "rgba(255, 224, 61, 0)");
  trail.addColorStop(1, "rgba(255, 224, 61, 0.7)");
  ctx.strokeStyle = trail;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x - 70, y + 6);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 50, y - 10);
  ctx.lineTo(x - 6, y - 4);
  ctx.stroke();
}

function drawCross(ctx: Ctx, x: number, y: number, r: number, color: string, width: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** Short lines flying out from an impact. `spread` scales their length. */
function drawShatter(ctx: Ctx, x: number, y: number, r: number, spread: number): void {
  ctx.strokeStyle = "rgba(255, 107, 92, 0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < SHATTER_LINES; i += 1) {
    const angle = ((Math.PI * 2) / SHATTER_LINES) * i + 0.35;
    const inner = r * 0.9;
    const outer = r + 9 * spread + (i % 2) * 5;
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
  }
  ctx.stroke();
}

// ------------------------------------------------------------------- stats

function drawStats(ctx: Ctx, summary: RunSummary, arcade: string): void {
  const cells: Array<[string, string]> = [
    ["PEAK KM/H", formatVelocity(summary.peakVelocity)],
    ["BEST STREAK", `${Math.max(0, Math.floor(safe(summary.bestStreak)))}`],
    ["CORRECT", `${Math.max(0, Math.floor(safe(summary.correct)))}/${Math.max(0, Math.floor(safe(summary.total)))}`],
    ["BOOSTS", `${Math.max(0, Math.floor(safe(summary.boostHits)))}/${Math.max(0, Math.floor(safe(summary.boosts)))}`],
    ["COLLISIONS", `${Math.max(0, Math.floor(safe(summary.collisions)))}`],
  ];
  const span = (W - PAD * 2) / cells.length;
  cells.forEach(([label, value], i) => {
    const x = PAD + span * i;
    text(ctx, label, x, STATS_LABEL_Y, arcadeFont(STATS_LABEL_FONT, arcade), LABEL);
    text(ctx, value, x, STATS_VALUE_Y, arcadeFont(STATS_VALUE_FONT, arcade), WHITE);
  });
}

/**
 * WHERE ON EARTH gets its own line between the stats and the rail. Once the
 * satellite feed scores, this is where the invasion landed; until then it
 * says whether the station was reached at all.
 */
function drawEarthLine(ctx: Ctx, summary: RunSummary, arcade: string): void {
  hairline(ctx, EARTH_RULE_Y);
  const docked = summary.outcomes.some((outcome) => outcome.kind === "dock");
  if (!docked) {
    text(ctx, "WHERE ON EARTH: NOT REACHED", PAD, EARTH_TEXT_Y, arcadeFont(EARTH_FONT, arcade), LABEL);
    return;
  }
  text(ctx, "WHERE ON EARTH: DOCKED", PAD, EARTH_TEXT_Y, arcadeFont(EARTH_FONT, arcade), VIOLET);
  text(
    ctx,
    "FEED STANDING BY",
    W - PAD,
    EARTH_TEXT_Y,
    arcadeFont(EARTH_FONT - 3, arcade),
    LABEL,
    "right",
  );
}

// -------------------------------------------------------------------- rail

function drawRail(ctx: Ctx, summary: RunSummary, arcade: string): void {
  hairline(ctx, RAIL_RULE_Y);
  const total = stripLength(summary);
  for (let i = 0; i < total; i += 1) {
    const x = PAD + i * (RAIL_CELL + RAIL_CELL_GAP);
    drawRailCell(ctx, x, RAIL_Y, kindAt(summary, i));
  }

  const footerY = RAIL_Y + RAIL_CELL - 14;
  text(ctx, "ASTRO RUN", W - PAD, footerY, arcadeFont(FOOTER_FONT + 4, arcade), WHITE, "right");
  text(ctx, summary.date, W - PAD, footerY + 22, arcadeFont(FOOTER_FONT - 3, arcade), LABEL, "right");
}

function drawRailCell(ctx: Ctx, x: number, y: number, kind: OutcomeKind | null): void {
  const cx = x + RAIL_CELL / 2;
  const cy = y + RAIL_CELL / 2;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (!kind) {
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, RAIL_CELL - 1, RAIL_CELL - 1);
    ctx.restore();
    return;
  }

  const color = kindColor(kind);
  const filled = kind === "slingshot" || kind === "wreck" || kind === "burn";
  ctx.fillStyle = filled
    ? kind === "wreck"
      ? RED_DEEP
      : kind === "burn"
        ? ORANGE
        : YELLOW
    : "rgba(7, 17, 34, 0.9)";
  ctx.fillRect(x, y, RAIL_CELL, RAIL_CELL);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, RAIL_CELL - 2, RAIL_CELL - 2);

  const glyphColor = filled ? INK : color;
  const r = 9;
  switch (kind) {
    case "thread":
      ctx.fillStyle = glyphColor;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.8, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx - r * 0.8, cy + r);
      ctx.closePath();
      ctx.fill();
      break;
    case "slingshot":
      drawStar(ctx, cx, cy, r + 3, glyphColor);
      break;
    case "burn":
      drawChevrons(ctx, cx, cy, r, 2, glyphColor);
      break;
    case "collision":
      drawCross(ctx, cx, cy, r, glyphColor, 3);
      break;
    case "wreck":
      drawCross(ctx, cx, cy, r + 2, glyphColor, 4);
      break;
    case "timeout":
      ctx.strokeStyle = glyphColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "dock":
      drawDockRing(ctx, cx, cy, r, glyphColor);
      break;
    case "graze":
      ctx.strokeStyle = glyphColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();
      break;
  }
  ctx.restore();
}
