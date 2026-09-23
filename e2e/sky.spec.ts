import { expect, test, type Page } from "@playwright/test";
import round from "../content/rounds/2026-09-18.json";
import { launch } from "./helpers";

const SHOTS = process.env.SHOT_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

declare global {
  interface Window {
    galaxiaSky?: { comets(): number };
  }
}

const comets = (page: Page) => page.evaluate(() => window.galaxiaSky?.comets() ?? -1);

/** Sample the sky for `ms` and return the most comets seen at once. */
async function peakComets(page: Page, ms: number): Promise<number> {
  let peak = 0;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    peak = Math.max(peak, await comets(page));
    await page.waitForTimeout(100);
  }
  return peak;
}

async function drawCalls(page: Page): Promise<number> {
  const text = await page.getByTestId("debug-draws").innerText();
  return Number(text.replace(/\D/g, ""));
}

/**
 * The set dressing: comets and shooting stars cross the sky between
 * questions and never while one is up, and the glow, the dust and the rings
 * all fit inside the flight's sixty draw calls.
 */
test("comets fly between questions, never during one, inside the draw budget", async ({
  page,
}) => {
  await page.goto("/play?replay=1&round=2026-09-18&debug=1");
  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => window.galaxiaSky !== undefined);

  // The read screen is a question on screen: the sky stays empty.
  await expect(page.getByTestId("cluster-ready")).toBeVisible();
  expect(await peakComets(page, 1500)).toBe(0);
  expect(await drawCalls(page)).toBeLessThanOrEqual(60);

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("option-0")).toBeVisible({ timeout: 5_000 });
  const lanes = round.questions[0]!.answers as number[];
  await page.keyboard.press(String(lanes[0]! + 1));
  await page.waitForTimeout(500);
  await shot(page, "sky-00-pod-inbound");
  // A pod on the hull: halo, ring and flash all live at once.
  await expect(page.getByTestId(`option-${lanes[0]}`)).toHaveAttribute("data-got", "true", {
    timeout: 5_000,
  });
  await shot(page, "sky-01-collect");
  expect(await drawCalls(page)).toBeLessThanOrEqual(60);
  for (const lane of lanes.slice(1)) {
    await page.keyboard.press(String(lane + 1));
    await expect(page.getByTestId(`option-${lane}`)).toHaveAttribute("data-got", "true", {
      timeout: 5_000,
    });
  }
  await expect(page.getByTestId("burn")).toContainText("FIRE", { timeout: 5_000 });
  await page.getByTestId("burn").click();

  // Parked on the verdict: the sky is calm, and something crosses it.
  await expect(page.getByTestId("tap-prompt")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => comets(page), { timeout: 20_000, intervals: [100] }).toBeGreaterThan(0);
  await shot(page, "sky-02-comet");
  expect(await drawCalls(page)).toBeLessThanOrEqual(60);

  // The next question opens: anything in flight is gone within a blink, and
  // nothing new starts while it is up.
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("cluster-ready")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => comets(page), { timeout: 1_000, intervals: [50] }).toBe(0);
  expect(await peakComets(page, 3000)).toBe(0);
});

/**
 * The top tier blooms, and bloom does not eat the budget: the scene's own
 * draw calls are counted before the blur passes, and stay inside sixty.
 * `?tier=0` pins the tier, since a headless browser detects as a low-end phone.
 */
test("the high tier renders with bloom, inside the draw budget", async ({ page }) => {
  test.slow();
  await page.goto("/play?replay=1&round=2026-09-18&debug=1&tier=0");
  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("debug-bloom")).toHaveText(/ON/, { timeout: 10_000 });
  await expect(page.getByTestId("debug-tier")).toHaveText(/HIGH/);
  expect(await drawCalls(page)).toBeLessThanOrEqual(60);
});
