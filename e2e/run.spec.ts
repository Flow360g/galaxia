import { expect, test, type Page } from "@playwright/test";
import round from "../content/rounds/2026-09-18.json";

const SHOTS = process.env.SHOT_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("a full run: thread, slingshot, collide, scan, share", async ({ page }) => {
  await page.goto("/play?replay=1");

  const question = page.getByTestId("question");
  const toast = page.getByTestId("toast");

  // Encounter 1: correct, plain. THREADED.
  await expect(question).toBeVisible({ timeout: 20_000 });
  await shot(page, "01-encounter");
  await page.getByTestId(`option-${answerOf(0)}`).click();
  await expect(toast).toHaveAttribute("data-outcome", "thread", { timeout: 10_000 });
  await shot(page, "02-thread");

  // Encounter 2: NOVA then correct with boost. SLINGSHOT.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("nova").click();
  await expect(page.getByTestId("nova-result")).toBeVisible();
  await page.getByTestId("boost").click();
  await expect(page.getByTestId("boost")).toHaveAttribute("aria-pressed", "true");
  await shot(page, "03-nova-boost");
  await page.getByTestId(`option-${answerOf(1)}`).click();
  await expect(toast).toHaveAttribute("data-outcome", "slingshot", { timeout: 10_000 });
  await shot(page, "04-slingshot");
  const velocityAfterSlingshot = await readVelocity(page);
  expect(velocityAfterSlingshot).toBeGreaterThan(4000);

  // Encounter 3: wrong. COLLISION, streak lost, velocity collapses.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`option-${wrongOf(2)}`).click();
  await expect(toast).toHaveAttribute("data-outcome", "collision", { timeout: 10_000 });
  await shot(page, "05-collision");
  await expect(page.getByTestId("streak")).toHaveText(/^\s*$/);
  expect(await readVelocity(page)).toBeLessThan(velocityAfterSlingshot);

  // Encounter 4: wrong with boost. WRECKED.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("b");
  await page.keyboard.press(String(wrongOf(3) + 1));
  await expect(toast).toHaveAttribute("data-outcome", "wreck", { timeout: 10_000 });

  // Encounter 5: correct via keyboard.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press(String(answerOf(4) + 1));
  await expect(toast).toHaveAttribute("data-outcome", "thread", { timeout: 10_000 });

  // Encounter 6: let thrust run out. THRUST OUT.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(toast).toHaveAttribute("data-outcome", "timeout", { timeout: 30_000 });
  await shot(page, "06-timeout");

  // Encounter 7: the anomaly. No API key, so the local scorer marks it.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("AI ANOMALY")).toBeVisible();
  await shot(page, "07-anomaly");
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

async function readVelocity(page: Page): Promise<number> {
  const text = await page.getByTestId("velocity").innerText();
  return Number(text.replace(/[^0-9]/g, ""));
}

function answerOf(index: number): number {
  const question = round.questions[index];
  if (!question || question.type !== "mcq") throw new Error(`no mcq at ${index}`);
  return question.answer;
}

function wrongOf(index: number): number {
  return (answerOf(index) + 1) % 4;
}
