import { expect, test, type Page } from "@playwright/test";
import round from "../content/rounds/2026-09-18.json";
import { launch } from "./helpers";

const SHOTS = process.env.SHOT_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/**
 * Nothing advances on a timer any more: a verdict or a waypoint card sits
 * there until the player taps. Wait for TAP TO CONTINUE to arm, then tap.
 *
 * Either target counts, and both are exercised below: the banner itself,
 * which is what a player aims at, and anywhere else on the screen, which is
 * the catcher behind the band.
 */
async function advance(page: Page, via: "banner" | "anywhere" = "anywhere") {
  const prompt = page.getByTestId("tap-prompt");
  await expect(prompt).toBeVisible({ timeout: 15_000 });
  if (via === "banner") await prompt.click();
  else await page.getByTestId("continue").click();
}

test("a full run: burn, cluster miss, waypoint, direct hit, miss, slingshot, timeout, dock, share", async ({
  page,
}) => {
  await page.goto("/play?replay=1&round=2026-09-18");

  const question = page.getByTestId("question");
  const toast = page.getByTestId("toast");

  // Every run opens on the launch card: what Phase 1 is, and one button.
  const ready = page.getByTestId("ready");
  await expect(ready).toBeVisible({ timeout: 20_000 });
  await expect(ready).toContainText("CLUSTER");
  // Nothing is flying behind it.
  await expect(question).toHaveCount(0);
  await shot(page, "00-ready");
  await launch(page);

  // READY, then 3, 2, 1, GO over the engines lighting.
  await expect(page.getByTestId("countdown")).toBeVisible({ timeout: 10_000 });
  await shot(page, "00-countdown");

  // Encounter 1: cluster. Two correct picks, then BURN at 2 plasma.
  await expect(question).toBeVisible({ timeout: 20_000 });
  // GO has cleared by the time the first prompt lands.
  await expect(page.getByTestId("countdown")).toHaveCount(0);
  await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "0");
  await expect(page.getByTestId("burn")).toBeDisabled();
  await shot(page, "01-cluster");
  const [right1, right2] = answersOf(0);
  await page.getByTestId(`option-${right1}`).click();
  await expect(page.getByTestId(`option-${right1}`)).toHaveAttribute("data-got", "true", {
    timeout: 5_000,
  });
  await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "1");
  await expect(page.getByTestId("burn")).toBeEnabled();
  await page.getByTestId(`option-${right2}`).click();
  await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "2", { timeout: 5_000 });
  await shot(page, "02-two-plasma");
  await page.getByTestId("burn").click();
  await expect(toast).toHaveAttribute("data-outcome", "burn", { timeout: 10_000 });
  await expect(toast).toHaveAttribute("data-charge", "2");
  await shot(page, "03-burn");
  // The verdict names the points, not just the velocity: 3 plasma at x1.
  await expect(page.getByTestId("toast-points")).toHaveText(/\+60/);
  await expect(page.getByTestId("score")).toContainText("60");
  const velocityAfterBurn = await readVelocity(page);
  expect(velocityAfterBurn).toBeGreaterThan(4000);
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "3");
  // The words are a target, not just a label.
  await advance(page, "banner");

  // Encounter 2: cluster. One correct, then a wrong lane. A boulder in the
  // lane: COLLISION, and one of the three shields is gone.
  await expect(question).toBeVisible({ timeout: 15_000 });
  const [right] = answersOf(1);
  await page.getByTestId(`option-${right}`).click();
  await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "1", { timeout: 5_000 });
  await page.getByTestId(`option-${wrongLaneOf(1)}`).click();
  await expect(page.getByTestId("pulse")).toHaveAttribute("data-kind", "shield", {
    timeout: 5_000,
  });
  await expect(toast).toHaveAttribute("data-outcome", "collision", { timeout: 10_000 });
  await expect(toast).toContainText("1 plasma lost");
  await shot(page, "04-cluster-miss");
  await expect(page.getByTestId("streak")).toHaveText(/^\s*$/);
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "2");
  expect(await readVelocity(page)).toBeLessThan(velocityAfterBurn);
  // A miss docks points as well as velocity.
  await expect(page.getByTestId("toast-points")).toHaveText(/-\d/);
  await advance(page);

  // Waypoint: Stage 1 rated (3 plasma, a shield down: B), then ALIEN CONTACT.
  const waypoint = page.getByTestId("waypoint");
  await expect(waypoint).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rating")).toHaveText("B", { timeout: 5_000 });
  await shot(page, "05-waypoint-rating");
  await expect(waypoint).toContainText("ALIEN CONTACT", { timeout: 6_000 });
  await shot(page, "06-waypoint-entering");
  // The stage card waits to be tapped on too, banner included.
  await advance(page, "banner");

  // Encounter 3: vector. Aim dead on. DIRECT HIT, salvage restores a shield.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("VECTOR")).toBeVisible();
  await page.getByTestId("aim").fill(String(sliderOf(2)));
  await expect(page.getByTestId("aim-value")).toContainText("10,9", { timeout: 5_000 });
  await shot(page, "07-vector-aim");
  await page.getByTestId("lock").click();
  await expect(toast).toHaveAttribute("data-outcome", "slingshot", { timeout: 10_000 });
  await expect(page.getByTestId("salvage")).toContainText("SHIELD RESTORED");
  await shot(page, "08-direct-hit");
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "3");
  await advance(page);

  // Encounter 4: vector, aim at the far end. The ship never fires: the scout
  // does, and the screen says the hull wore it.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("aim").fill("1000");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("damage")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("pulse")).toHaveAttribute("data-kind", "damage");
  await shot(page, "09-damage");
  await expect(toast).toHaveAttribute("data-outcome", "collision", { timeout: 10_000 });
  await expect(toast).toContainText("MISS");
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "2");
  await shot(page, "09-miss");
  await advance(page);

  // Encounter 5: NOVA then correct with boost. SLINGSHOT.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("nova").click();
  await expect(page.getByTestId("nova-result")).toBeVisible();
  await page.getByTestId("boost").click();
  await expect(page.getByTestId("boost")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId(`option-${answerOf(4)}`).click();
  await expect(page.getByTestId("pulse")).toHaveAttribute("data-kind", "plasma", {
    timeout: 5_000,
  });
  await expect(toast).toHaveAttribute("data-outcome", "slingshot", { timeout: 10_000 });
  await shot(page, "10-slingshot");
  await advance(page);

  // Encounter 6: let the five seconds run out. TOO SLOW.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(toast).toHaveAttribute("data-outcome", "timeout", { timeout: 30_000 });
  await shot(page, "11-timeout");
  await advance(page);

  // Waypoint: Alien Contact rated, then the card briefs WHERE ON EARTH as
  // phase 4 (phase 3 is not built, and the round says so).
  await expect(waypoint).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rating")).toBeVisible({ timeout: 5_000 });
  await expect(waypoint).toContainText("PHASE 4", { timeout: 6_000 });
  await expect(waypoint).toContainText("WHERE ON EARTH");
  await expect(page.getByTestId("waypoint-standby")).toBeVisible();
  await shot(page, "12-waypoint-earth");
  await advance(page, "banner");

  // Encounter 7: WHERE ON EARTH. No lanes, no clock, no tools: the station
  // comes alongside and arms the door. The score does not move for docking.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(question.getByText("WHERE ON EARTH")).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveCount(0);
  await expect(page.getByTestId("thrust")).toHaveCount(0);
  await expect(page.getByTestId("option-0")).toHaveCount(0);
  await expect(page.getByTestId("nova")).toHaveCount(0);
  const enter = page.getByTestId("enter-station");
  await expect(enter).toBeDisabled();
  await expect(enter).toHaveText("CLOSING...");
  const scoreBefore = await page.getByTestId("score").innerText();
  await expect(enter).toBeEnabled({ timeout: 15_000 });
  await expect(enter).toHaveText("ENTER SPACE STATION");
  await expect(page.getByTestId("station-status")).toContainText("ALONGSIDE");
  await shot(page, "13-station-approach");
  await enter.click();

  // Aboard: the station screen owns the display; the HUD is gone under it.
  // Two sites are flown on one dock, the second starting where the first was
  // answered rather than back at the approach.
  const station = page.getByTestId("station");
  await expect(station).toBeVisible();
  await expect(station).toContainText(/satellite feed/i);
  await expect(question).toHaveCount(0);
  await shot(page, "14-station");

  for (const [index, site] of ["Dubai", "Cape Town"].entries()) {
    // The clock is held until the imagery settles, so the box is disabled
    // until the feed is up. The grace timeout guarantees it opens regardless.
    const box = page.getByTestId("site-answer");
    await expect(box).toBeEnabled({ timeout: 20_000 });
    await box.fill(site);
    await page.getByTestId("site-submit").click();
    await expect(station).toContainText(/site identified/i);
    if (index === 0) await shot(page, "15-station-site");
    await page.getByTestId("next-site").click();
  }

  // The scorecard: one line per encounter, then the total out of the perfect
  // run. It is the beat before the share card, and it waits for a tap.
  const tally = page.getByTestId("tally");
  await expect(tally).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("tally-line-0")).toContainText("2 PLASMA BANKED");
  await expect(page.getByTestId("tally-line-6")).toContainText("WHERE ON EARTH");
  await expect(page.getByTestId("tally-line-7")).toContainText("WHERE ON EARTH");
  // The lines land one at a time and the total lands after them. Text is in
  // the DOM the whole time, so the reveal is asserted on the class that
  // actually makes a line visible rather than on its content.
  await expect(page.getByTestId("tally-line-7")).toHaveClass(/lineIn/, { timeout: 10_000 });
  await expect(page.getByTestId("tally-total")).toContainText("/ 2,400");
  await expect(page.getByTestId("tally-continue")).toHaveText("TAP TO CONTINUE");
  // The total stamps in a beat after the last line.
  await expect(page.getByTestId("tally-total")).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, "15-tally");
  const scored = Number(
    (await page.getByTestId("tally-total").innerText()).split("/")[0]!.replace(/[^0-9]/g, ""),
  );
  expect(scored).toBeGreaterThan(0);
  expect(scored).toBeLessThan(2400);
  // The station is an encounter now, not a cutscene: two sites named correctly
  // add the finale's double base on top of whatever the flight had banked.
  const beforeDock = Number(scoreBefore.split("/")[0]!.replace(/[^0-9]/g, ""));
  expect(scored).toBeGreaterThan(beforeDock);
  await page.getByTestId("tally-continue").click();

  // Share card.
  const card = page.getByTestId("share-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("share-image")).toHaveAttribute("src", /blob:|data:/, {
    timeout: 15_000,
  });
  const distance = await page.getByTestId("final-distance").innerText();
  expect(Number(distance.replace(/[^0-9]/g, ""))).toBeGreaterThan(1000);
  await expect(page.getByTestId("final-score")).toBeVisible();
  await shot(page, "16-share");

  // The run is persisted: a reload shows the card, not a fresh run.
  await page.goto("/play?round=2026-09-18");
  await expect(page.getByTestId("share-card")).toBeVisible({ timeout: 15_000 });
  await page.goto("/?round=2026-09-18");
  await expect(page.getByTestId("today-run")).toContainText("KM");

  // And the flight log counted it, which is what earns a hull in the bay.
  expect(await page.evaluate(() => localStorage.getItem("galaxia:flown"))).toBe("1");
});

test("all three lanes: MAXIMUM THRUST", async ({ page }) => {
  await page.goto("/play?replay=1&round=2026-09-18");
  const toast = page.getByTestId("toast");

  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 20_000 });
  const lanes = answersOf(0);
  for (const lane of lanes.slice(0, -1)) {
    await page.keyboard.press(String(lane + 1));
    await expect(page.getByTestId(`option-${lane}`)).toHaveAttribute("data-got", "true", {
      timeout: 5_000,
    });
  }
  // The third correct pick fills the gauge and stops the clock: the boost is
  // spent on a tap, not taken away on a timer.
  await page.keyboard.press(String(lanes[lanes.length - 1]! + 1));
  await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "3", { timeout: 5_000 });
  await expect(page.getByTestId("burn")).toContainText("FIRE");
  await shot(page, "14-gauge-full");
  await page.getByTestId("burn").click();
  await expect(toast).toHaveAttribute("data-outcome", "burn", { timeout: 10_000 });
  await expect(toast).toHaveAttribute("data-charge", "3");
  await expect(toast).toContainText("MAXIMUM THRUST");
  // The full-screen treatment only a full reactor gets: hazard placard, speed
  // lines, and the shell shaking under both.
  await expect(page.getByTestId("max-thrust")).toBeVisible();
  await expect(page.getByTestId("warp")).toBeAttached();
  // Full charge at x1: the whole 100 for the encounter.
  await expect(page.getByTestId("toast-points")).toHaveText(/\+100/);
  await expect(page.getByTestId("score")).toContainText("100");
  await shot(page, "09-max-thrust");
  expect(await readVelocity(page)).toBeGreaterThan(6000);
  await expect(page.getByTestId("streak")).toHaveText("STREAK x1");
});

async function readVelocity(page: Page): Promise<number> {
  const text = await page.getByTestId("velocity").innerText();
  return Number(text.replace(/[^0-9]/g, ""));
}

function answerOf(index: number): number {
  const question = round.questions[index];
  if (!question || question.type !== "mcq") throw new Error(`no mcq at ${index}`);
  return question.answer as number;
}

/** Slider position (0..1000) that lands exactly on a vector's answer. */
function sliderOf(index: number): number {
  const question = round.questions[index];
  if (!question || question.type !== "vector") throw new Error(`no vector at ${index}`);
  const { min, max, answer } = question as { min: number; max: number; answer: number };
  const t = (question as { log?: boolean }).log
    ? (Math.log(answer) - Math.log(min)) / (Math.log(max) - Math.log(min))
    : (answer - min) / (max - min);
  return Math.round(t * 1000);
}

function answersOf(index: number): number[] {
  const question = round.questions[index];
  if (!question || question.type !== "cluster") throw new Error(`no cluster at ${index}`);
  return question.answers as number[];
}

function wrongLaneOf(index: number): number {
  const question = round.questions[index];
  if (!question || question.type !== "cluster") throw new Error(`no cluster at ${index}`);
  const answers = question.answers as number[];
  const lane = question.options.findIndex((_, i) => !answers.includes(i));
  if (lane < 0) throw new Error(`no wrong lane at ${index}`);
  return lane;
}
