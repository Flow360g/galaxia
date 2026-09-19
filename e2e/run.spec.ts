import { expect, test, type Page } from "@playwright/test";
import round from "../content/rounds/2026-09-18.json";

const SHOTS = process.env.SHOT_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/**
 * Nothing advances on a timer any more: a verdict or a waypoint card sits
 * there until the player taps. Wait for TAP TO CONTINUE to arm, then tap.
 */
async function advance(page: Page) {
  await expect(page.getByTestId("tap-prompt")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("continue").click();
}

test("a full run: burn, cluster miss, waypoint, direct hit, miss, slingshot, timeout, scan, share", async ({
  page,
}) => {
  await page.goto("/play?replay=1");

  const question = page.getByTestId("question");
  const toast = page.getByTestId("toast");

  // Encounter 1: cluster. Two correct picks, then BURN at 2 plasma.
  await expect(question).toBeVisible({ timeout: 20_000 });
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
  await advance(page);

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
  // The stage card waits to be tapped on too.
  await advance(page);

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

  // Encounter 4: vector, aim at the far end. MISS, the alien fires back, a shield goes.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("aim").fill("1000");
  await page.keyboard.press("Enter");
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

  // Encounter 7: the anomaly. No API key, so the local scorer marks it.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("AI ANOMALY")).toBeVisible();
  await page.getByTestId("anomaly-input").fill("Orion");
  await page.getByTestId("anomaly-submit").click();
  await expect(toast).toHaveAttribute("data-outcome", "thread", { timeout: 20_000 });
  await expect(toast).toContainText("100%");
  await advance(page);

  // The scorecard: one line per encounter, then the total out of the perfect
  // run. It is the beat before the share card, and it waits for a tap.
  const tally = page.getByTestId("tally");
  await expect(tally).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("tally-line-0")).toContainText("2 PLASMA BANKED");
  await expect(page.getByTestId("tally-line-6")).toContainText("SCANNER");
  // The lines land one at a time and the total lands after them. Text is in
  // the DOM the whole time, so the reveal is asserted on the class that
  // actually makes a line visible rather than on its content.
  await expect(page.getByTestId("tally-line-6")).toHaveClass(/lineIn/, { timeout: 10_000 });
  await expect(page.getByTestId("tally-total")).toContainText("/ 1,500");
  await expect(page.getByTestId("tally-continue")).toHaveText("TAP TO CONTINUE");
  // The total stamps in a beat after the last line.
  await expect(page.getByTestId("tally-total")).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, "12-tally");
  const scored = Number(
    (await page.getByTestId("tally-total").innerText()).split("/")[0]!.replace(/[^0-9]/g, ""),
  );
  expect(scored).toBeGreaterThan(0);
  expect(scored).toBeLessThan(1500);
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
  await shot(page, "13-share");

  // The run is persisted: a reload shows the card, not a fresh run.
  await page.goto("/play");
  await expect(page.getByTestId("share-card")).toBeVisible({ timeout: 15_000 });
  await page.goto("/");
  await expect(page.getByTestId("today-run")).toContainText("KM");

  // And the flight log counted it, which is what earns a hull in the bay.
  expect(await page.evaluate(() => localStorage.getItem("galaxia:flown"))).toBe("1");
});

test("all three lanes: MAXIMUM THRUST", async ({ page }) => {
  await page.goto("/play?replay=1");
  const toast = page.getByTestId("toast");

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
  await expect(page.getByTestId("burn")).toContainText("FIRE BOOST");
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
