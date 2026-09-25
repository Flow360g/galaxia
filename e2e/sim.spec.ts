import { expect, test } from "@playwright/test";
import { launch } from "./helpers";

/**
 * The simulation mode: `/dev`, and a coming day's real round flown off it.
 *
 * Three things have to hold. The day flown is the day picked, not today. The
 * NOTES tab freezes the run, clock included, so a tester is never timed out of
 * writing a note. And nothing about the run is written down anywhere a
 * player's record lives: only the notes, under their own key.
 */

test("a coming day flies, pauses for a note, and records no run", async ({ page }) => {
  await page.addInitScript(`try { localStorage.setItem('galaxia:flown', '3'); } catch (error) {}`);

  await page.goto("/profile?debug=1");
  await page.getByTestId("profile-sim").click();
  await expect(page.getByTestId("sim-days")).toBeVisible({ timeout: 20_000 });

  // Tomorrow is the second row: today leads the list.
  const tomorrow = page.locator('[data-testid^="sim-fly-"]').nth(1);
  const href = (await tomorrow.getAttribute("href")) ?? "";
  const date = /round=(\d{4}-\d{2}-\d{2})/.exec(href)?.[1] ?? "";
  expect(date).not.toBe("");
  await tomorrow.click();
  await expect(page).toHaveURL(new RegExp(`/play\\?round=${date}&sim=1$`), { timeout: 20_000 });

  // No Mayday on a simulated day, straight to the launch card.
  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 25_000 });

  // The clock stands still while the sheet is up.
  const clock = page.getByTestId("clock");
  await page.getByTestId("sim-pause").click();
  await expect(page.getByTestId("sim-sheet")).toBeVisible();
  const before = await clock.innerText();
  await page.waitForTimeout(2_500);
  expect(await clock.innerText()).toBe(before);

  await page.getByTestId("sim-flag-1").click();
  await page.getByTestId("sim-note-1").fill("Two of the decoys are arguable.");
  await expect(page.getByTestId("sim-issue")).toHaveAttribute(
    "href",
    /github\.com\/Flow360g\/galaxia\/issues\/new\?title=.*arguable/,
  );
  await page.getByTestId("sim-resume").click();
  await expect(page.getByTestId("sim-sheet")).toHaveCount(0);

  const record = await page.evaluate(
    (day) => ({
      flown: localStorage.getItem("galaxia:flown"),
      runs: Object.keys(localStorage).filter((key) => key.startsWith("galaxia:run:")),
      mayday: localStorage.getItem("galaxia:mayday"),
      notes: localStorage.getItem(`galaxia:sim:${day}`),
    }),
    date,
  );
  expect(record.flown).toBe("3");
  expect(record.runs).toEqual([]);
  expect(record.mayday).toBeNull();
  expect(record.notes).toContain("arguable");

  // The day list says the day has notes, and the review page has them.
  await page.goto("/dev");
  await expect(page.getByTestId(`sim-day-${date}`)).toContainText(/1 noted · 1 flagged/, {
    timeout: 20_000,
  });
  await page.getByTestId(`sim-notes-${date}`).click();
  await expect(page.getByTestId("sim-note-1")).toHaveValue("Two of the decoys are arguable.");
});
