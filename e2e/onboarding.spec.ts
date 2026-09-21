import { expect, test, type Page } from "@playwright/test";
import { acknowledge, launch } from "./helpers";

/**
 * The two things that wrap a run: the briefing a first-time player is walked
 * through before the first round, and the ship bay they pick a hull in.
 *
 * Both are storage-driven, and both fall back to something flyable when
 * storage says nothing, so every test here starts from a fresh profile and
 * says out loud what it seeded.
 */

const SHOTS = process.env.SHOT_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Pretend this device has flown `runs` runs, before anything loads. */
async function seedFlown(page: Page, runs: number) {
  await page.addInitScript(`try {
    localStorage.setItem('galaxia:flown', '${runs}');
    localStorage.setItem('galaxia:briefed', 'true');
  } catch (error) {}`);
}

test("a first flight is briefed on the rules before the round starts", async ({
  page,
}) => {
  // Nothing seeded: no runs on file, never briefed.
  await page.goto("/play");

  const briefing = page.getByTestId("briefing");
  await expect(briefing).toBeVisible({ timeout: 20_000 });
  await expect(briefing).toContainText(/first flight/i);
  await expect(briefing).toContainText(/welcome aboard/i);
  // The welcome page names every phase and what a perfect run scores on it,
  // and those figures add up to the total in the title.
  const phases = page.getByTestId("briefing-phases");
  await expect(phases).toContainText("Cluster Belt");
  await expect(phases).toContainText("Open Sky");
  await expect(phases).toContainText("Where on Earth");
  await expect(briefing).toContainText("1,800");
  // The run is held back: no question is open behind the briefing.
  await expect(page.getByTestId("question")).toHaveCount(0);
  await shot(page, "b01-briefing");

  // Read it through, keeping every card's copy. The last one launches.
  const next = page.getByTestId("briefing-next");
  const read: string[] = [];
  for (let card = 0; card < 12; card += 1) {
    read.push(await briefing.innerText());
    if ((await next.innerText()).trim().toUpperCase() === "LAUNCH") break;
    await next.click();
    await expect(briefing).not.toHaveText(read[read.length - 1] ?? "");
  }
  const everything = read.join("\n");

  // The scoring system is the half of this a player cannot work out by
  // playing, and every figure in it is read from Tuning. One page per phase,
  // each with its table, in plain words.
  expect(everything).toMatch(/ALL 3 FOUND\s+200 POINTS/);
  expect(everything).toMatch(/WITHIN 5%/);
  expect(everything).toMatch(/WITHIN 15%\s+0 POINTS · NO HARM/);
  expect(everything).toMatch(/CORRECT \+ BOOST\s+200 POINTS/);
  expect(everything).toMatch(/a streak of correct answers keeps your ship fast/i);
  expect(everything).toMatch(/PICK ONE/);
  expect(everything).toMatch(/NAME THE PLACE/);
  // The last page is about hints: the free ones, and the ones that cost.
  expect(everything).toMatch(/HINTS\s+2 FOR THE RUN/i);
  expect(everything).toMatch(/NAME THE PLACE HINT\s+-45 POINTS/i);
  // No flight-model figures: distance is a speedometer, not the score.
  expect(everything).not.toMatch(/km\/h/i);
  await shot(page, "b02-briefing-last");
  await expect(next).toHaveText(/launch/i);
  await next.click();

  // Briefing gone. The Mayday from Earth Command comes in, then the launch
  // card behind it, with its scoring shut until it is asked for.
  await expect(briefing).toHaveCount(0);
  const mayday = page.getByTestId("transmission");
  await expect(mayday).toContainText(/mayday/i, { timeout: 15_000 });
  // The mayday has a face on it, not a voice alone.
  await expect(mayday).toContainText(/sargent soap/i);
  await expect(mayday.getByTestId("transmission-portrait").locator("img")).toBeVisible();
  await shot(page, "b02b-transmission");
  await acknowledge(page);
  const toggle = page.getByTestId("scoring-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("scoring")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("scoring")).toContainText("1 FOUND");
  // Opening the table did not launch the run.
  await expect(page.getByTestId("ready")).toBeVisible();
  await shot(page, "b02c-ready-scoring");
  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 25_000 });

  // It was read once and does not come back, and nor does the Mayday.
  await page.goto("/play");
  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("briefing")).toHaveCount(0);
});

test("the briefing can be skipped from the first card", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByTestId("briefing")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("briefing-back").click();
  await expect(page.getByTestId("briefing")).toHaveCount(0);
  // Skipping the rules does not skip the mission.
  await acknowledge(page);
  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 25_000 });
});

test("a returning player is not briefed, and can read it again from the title", async ({
  page,
}) => {
  await seedFlown(page, 3);
  await page.goto("/play");
  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("briefing")).toHaveCount(0);

  await page.goto("/");
  await page.getByTestId("view-briefing").click();
  const briefing = page.getByTestId("briefing");
  await expect(briefing).toBeVisible();
  await expect(briefing).toContainText(/briefing/i);
  await expect(briefing).not.toContainText(/first flight/i);
  await briefing.getByTestId("briefing-back").click();
  await expect(briefing).toHaveCount(0);
});

test("the ship bay: earned after five runs, limited edition bought", async ({
  page,
}) => {
  await seedFlown(page, 2);
  await page.goto("/");
  await page.getByTestId("view-ship").click();

  // Standard issue: always flyable, and what a new player is in.
  await expect(page.getByTestId("ship-name")).toHaveText("Cinder VII");
  await expect(page.getByTestId("bay-status")).toContainText(/in your hangar/i);
  await expect(page.getByTestId("bay-stamp")).toHaveCount(0);
  await shot(page, "b03-bay-default");

  // Earned hull, two runs in: locked, and it says how far off.
  await page.getByRole("button", { name: "Next ship" }).click();
  await expect(page.getByTestId("ship-name")).toHaveText("Neon Flamingo");
  await expect(page.getByTestId("bay-stamp")).toHaveText(/locked/i);
  await expect(page.getByTestId("bay-status")).toContainText(/5 runs flown/i);
  await expect(page.getByTestId("bay-status")).toContainText("2 on file");
  await expect(page.getByTestId("bay-action")).toBeDisabled();
  await expect(page.getByTestId("bay-action")).toContainText(/3 more runs/i);
  await shot(page, "b04-bay-locked");

  // Limited edition: for sale, and the price is quoted the same everywhere.
  await page.getByRole("button", { name: "Next ship" }).click();
  await expect(page.getByTestId("ship-name")).toHaveText("White Seraph");
  await expect(page.getByTestId("bay-stamp")).toHaveText(/limited edition/i);
  await expect(page.getByTestId("bay-action")).toContainText("$4.99");
  await shot(page, "b05-bay-for-sale");

  // Buy it. The entitlement is recorded and the hull becomes the selection.
  await page.getByTestId("bay-action").click();
  await expect(page.getByTestId("bay-checkout")).toContainText("$4.99");
  await page.getByTestId("bay-confirm").click();
  await expect(page.getByTestId("bay-stamp")).toHaveCount(0);
  await expect(page.getByTestId("bay-status")).toContainText(/in your hangar/i);
  await expect(page.getByTestId("bay-action")).toContainText(/press start/i);
  await shot(page, "b06-bay-bought");

  // And it survives a reload, which is the whole point of buying it.
  await page.reload();
  await expect(page.getByTestId("ship-name")).toHaveText("White Seraph");
  await expect(page.getByTestId("bay-status")).toContainText(/in your hangar/i);
});

test("the bay flies the hull it was told to, and refuses one it was not", async ({
  page,
}) => {
  await seedFlown(page, 6);
  await page.goto("/hangar");

  // Six runs on file: the earned hull is available now.
  await page.getByRole("button", { name: "Next ship" }).click();
  await expect(page.getByTestId("ship-name")).toHaveText("Neon Flamingo");
  await expect(page.getByTestId("bay-status")).toContainText(/cleared to fly/i);
  await page.getByTestId("bay-action").click();
  await expect(page.getByTestId("bay-status")).toContainText(/in your hangar/i);

  const stored = await page.evaluate(() => localStorage.getItem("galaxia:ship"));
  expect(stored).toBe('"flamingo"');

  // A selection the player never unlocked falls back rather than failing: the
  // run must always start, whatever storage happens to say.
  await page.evaluate(() =>
    localStorage.setItem("galaxia:ship", JSON.stringify("seraph")),
  );
  await page.goto("/hangar");
  await expect(page.getByTestId("ship-name")).toHaveText("Cinder VII");
  await page.goto("/play?replay=1");
  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 25_000 });
});

/**
 * The bay's own behaviour, as opposed to what it says about a hull.
 *
 * These read the bay through `window.galaxiaBay`, which `?debug=1` parks there
 * the same way `?debug=1` exposes the audio engine. Asserting on the turntable
 * angle and the draw count directly beats trying to see a rotation in a
 * screenshot, and it is the only way to check the frame budget at all.
 */
type BayState = {
  yaw: number;
  pitch: number;
  dragged: boolean;
  drawCalls: number;
  triangles: number;
  dpr: number;
  hullRadius: number;
  hullLift: number;
  padTop: number;
};

declare global {
  interface Window {
    galaxiaBay?: { debugState(): BayState };
  }
}

async function bayState(page: Page): Promise<BayState> {
  await page.waitForFunction(() => window.galaxiaBay !== undefined, null, {
    timeout: 20_000,
  });
  return page.evaluate(() => window.galaxiaBay!.debugState());
}

test("the bay does not move when the hull changes", async ({ page }) => {
  await seedFlown(page, 9);
  await page.goto("/hangar?debug=1");

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  // The whole defect this layout exists to fix: the canvas used to be a flex
  // sibling of the text, so a hull with a longer name resized it and the
  // camera re-framed mid-switch. It is pinned to the viewport now, so the box
  // must be identical for every hull.
  const first = await canvas.boundingBox();
  expect(first).not.toBeNull();

  // Every hull stands on the pad, and stands at the SAME height on every
  // visit. It used to be measured on the turntable, in world space, so each
  // switch inherited the previous hull's lift and the bob's phase, and a few
  // pages in the hull was below the deck.
  const lifts = new Map<string, number>();
  const settled = async (name: string): Promise<BayState> => {
    await expect(page.getByTestId("ship-name")).toHaveText(name);
    // The hull arrives when its GLB does; wait for the lift to leave the
    // fallback and hold still.
    await expect
      .poll(async () => (await bayState(page)).hullLift, { timeout: 20_000 })
      .not.toBe(0.5);
    return bayState(page);
  };

  const order = ["Cinder VII", "Neon Flamingo", "White Seraph"];
  let state = await settled(order[0]!);
  expect(state.hullLift).toBeGreaterThan(state.padTop);
  lifts.set(order[0]!, state.hullLift);

  for (let i = 1; i < 6; i += 1) {
    await page.getByRole("button", { name: "Next ship" }).click();
    const name = order[i % order.length]!;
    state = await settled(name);
    const box = await canvas.boundingBox();
    expect(box).toEqual(first);
    // Above the pad, by the whole hover gap, never buried.
    expect(state.hullLift).toBeGreaterThan(state.padTop);
    const seen = lifts.get(name);
    if (seen !== undefined) expect(state.hullLift).toBeCloseTo(seen, 6);
    lifts.set(name, state.hullLift);
  }

  // And the hull is rendered sharp, on its own budget rather than the
  // flight's: a phone on the low tier renders the flight at DPR 1.
  const budget = await bayState(page);
  expect(budget.dpr).toBeGreaterThan(1);
  // A room and one hull. The flight scene is allowed sixty.
  expect(budget.drawCalls).toBeLessThanOrEqual(30);
});

test("dragging turns the hull, and the hint gives way", async ({ page }) => {
  await seedFlown(page, 9);
  await page.goto("/hangar?debug=1");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("bay-hint")).toBeVisible();

  const before = await bayState(page);
  expect(before.dragged).toBe(false);

  // Drag across the middle of the bay, clear of the arrows and the overlay.
  const viewport = page.viewportSize();
  const midX = Math.round((viewport?.width ?? 400) / 2);
  const midY = Math.round((viewport?.height ?? 800) * 0.35);
  await page.mouse.move(midX, midY);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(midX + step * 30, midY);
  }
  await page.mouse.up();

  const after = await bayState(page);
  expect(after.dragged).toBe(true);
  // 180px at the catalogue's radians-per-pixel is well over a radian, and the
  // automatic revolution is far too slow to account for it.
  expect(after.yaw - before.yaw).toBeGreaterThan(1);

  // The nudge has done its job and gets out of the way.
  await expect(page.getByTestId("bay-hint")).toHaveCount(0);
});
