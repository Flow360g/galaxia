import { expect, test, type Page } from "@playwright/test";
import round from "../content/rounds/2026-09-18.json";

const SHOTS = process.env.SHOT_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("a full run: burn, cluster miss, wreck, slingshot, thread, timeout, scan, share", async ({
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
  const velocityAfterBurn = await readVelocity(page);
  expect(velocityAfterBurn).toBeGreaterThan(4000);
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "3");

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

  // Encounter 3: MCQ, wrong, with boost armed. Boosted misses always WRECK.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("boost").click();
  await page.getByTestId(`option-${wrongOf(2)}`).click();
  await expect(toast).toHaveAttribute("data-outcome", "wreck", { timeout: 10_000 });
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "1");
  await shot(page, "05-wreck");

  // Encounter 4: NOVA then correct with boost. SLINGSHOT.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("nova").click();
  await expect(page.getByTestId("nova-result")).toBeVisible();
  await page.getByTestId("boost").click();
  await expect(page.getByTestId("boost")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId(`option-${answerOf(3)}`).click();
  await expect(page.getByTestId("pulse")).toHaveAttribute("data-kind", "plasma", {
    timeout: 5_000,
  });
  await expect(toast).toHaveAttribute("data-outcome", "slingshot", { timeout: 10_000 });
  await shot(page, "06-slingshot");

  // Encounter 5: correct via keyboard. LANE CLEAR.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press(String(answerOf(4) + 1));
  await expect(toast).toHaveAttribute("data-outcome", "thread", { timeout: 10_000 });

  // Encounter 6: let the five seconds run out. TOO SLOW.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(toast).toHaveAttribute("data-outcome", "timeout", { timeout: 30_000 });
  await shot(page, "07-timeout");

  // Encounter 7: the anomaly. No API key, so the local scorer marks it.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("AI ANOMALY")).toBeVisible();
  await page.getByTestId("anomaly-input").fill("Orion");
  await page.getByTestId("anomaly-submit").click();
  await expect(toast).toHaveAttribute("data-outcome", "thread", { timeout: 20_000 });
  await expect(toast).toContainText("100%");

  // Share card.
  const card = page.getByTestId("share-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("share-image")).toHaveAttribute("src", /blob:|data:/, {
    timeout: 15_000,
  });
  const distance = await page.getByTestId("final-distance").innerText();
  expect(Number(distance.replace(/[^0-9]/g, ""))).toBeGreaterThan(1000);
  await shot(page, "08-share");

  // The run is persisted: a reload shows the card, not a fresh run.
  await page.goto("/play");
  await expect(page.getByTestId("share-card")).toBeVisible({ timeout: 15_000 });
  await page.goto("/");
  await expect(page.getByTestId("today-run")).toContainText("KM");
});

test("a full burn: all three lanes, keyboard, warp", async ({ page }) => {
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
  // Third correct pick auto-burns: the panel gives way to the toast, no BURN tap needed.
  await page.keyboard.press(String(lanes[lanes.length - 1]! + 1));
  await expect(toast).toHaveAttribute("data-outcome", "burn", { timeout: 10_000 });
  await expect(toast).toHaveAttribute("data-charge", "3");
  await expect(toast).toContainText("FULL BURN");
  await expect(page.getByTestId("warp")).toBeAttached();
  await shot(page, "09-full-burn");
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

function wrongOf(index: number): number {
  return (answerOf(index) + 1) % 4;
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
