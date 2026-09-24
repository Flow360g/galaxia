import { expect, test, type Page } from "@playwright/test";
import { launch } from "./helpers";

/**
 * The practice run: `/profile?debug=1` and the `?shuffle=` hatch behind it.
 *
 * A dev and QA hatch, not a mode. Two things have to hold or it stops being
 * one: a player must not be able to reach it, and flying it must leave no
 * trace, because the daily run is worth exactly one score a day and a round
 * you can reroll would quietly undo that.
 *
 * These stop at the first question on purpose. Flying a whole run is
 * `run.spec.ts`'s job and takes two minutes; what is unproven elsewhere is
 * which questions come up and what is written down.
 */

/** Pretend this device has flown a few runs, so nothing is briefed at us. */
async function seedFlown(page: Page, runs = 3) {
  await page.addInitScript(`try {
    localStorage.setItem('galaxia:flown', '${runs}');
    localStorage.setItem('galaxia:briefed', 'true');
  } catch (error) {}`);
}

/** The first prompt of the round, once the launch card has been pressed. */
async function firstPrompt(page: Page, url: string): Promise<string> {
  await page.goto(url);
  await launch(page);
  const question = page.getByTestId("question");
  await expect(question).toBeVisible({ timeout: 25_000 });
  return question.innerText();
}

test("the practice run is behind ?debug=1, and nowhere else", async ({ page }) => {
  await seedFlown(page);

  await page.goto("/profile");
  await expect(page.getByTestId("profile-play")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("profile-shuffle")).toHaveCount(0);

  await page.goto("/profile?debug=1");
  const practice = page.getByTestId("profile-shuffle");
  await expect(practice).toBeVisible({ timeout: 20_000 });
  // Said plainly, on the page, so nobody has to guess what it costs them.
  await expect(page.getByTestId("profile-play").locator("..")).toContainText(
    /not saved and does not count/i,
  );

  // It carries a seed of its own, so the round it opens can be opened again.
  await practice.click();
  await expect(page).toHaveURL(/\/play\?shuffle=[^&]+&debug=1/, { timeout: 20_000 });
});

test("practice can fly any hull, locked ones included, and stores none", async ({ page }) => {
  await seedFlown(page, 0);
  await page.goto("/profile?debug=1");
  await expect(page.getByTestId("profile-shuffle")).toBeVisible({ timeout: 20_000 });

  // The limited edition is never unlocked on a fresh device, and still flies.
  await page.getByTestId("practice-ship-seraph").click();
  await page.getByTestId("profile-shuffle").click();
  await expect(page).toHaveURL(/\/play\?shuffle=[^&]+&debug=1&ship=seraph/, {
    timeout: 20_000,
  });
  expect(await page.evaluate(() => localStorage.getItem("galaxia:ship"))).toBeNull();
});

test("a seed rebuilds its round, and two seeds are two rounds", async ({ page }) => {
  await seedFlown(page);

  const first = await firstPrompt(page, "/play?shuffle=alpha");
  const again = await firstPrompt(page, "/play?shuffle=alpha");
  const other = await firstPrompt(page, "/play?shuffle=bravo");

  expect(again).toBe(first);
  expect(other).not.toBe(first);
});

test("the practice button deals from one deck, a run at a time", async ({ page }) => {
  await seedFlown(page);

  // Each press is the next deal from this device's deck, so a tester works
  // through the pool instead of meeting the same questions every few runs.
  const deal = async () => {
    await page.goto("/profile?debug=1");
    await page.getByTestId("profile-shuffle").click();
    await expect(page).toHaveURL(/\/play\?shuffle=[a-z0-9]+\.\d+&debug=1/, { timeout: 20_000 });
    return new URL(page.url()).searchParams.get("shuffle") ?? "";
  };
  const [deck, first] = (await deal()).split(".");
  const [again, second] = (await deal()).split(".");

  expect(again).toBe(deck);
  expect(Number(second)).toBe(Number(first) + 1);
});

test("a practice run writes nothing down", async ({ page }) => {
  await seedFlown(page, 3);

  // Today's real run is on file, and must still be there afterwards.
  await page.addInitScript(`try {
    localStorage.setItem('galaxia:best', JSON.stringify({
      score: 1800, maxScore: 1800, distance: 99999,
      date: '1999-01-01', roundNumber: 1,
    }));
  } catch (error) {}`);

  await firstPrompt(page, "/play?shuffle=charlie");

  const record = await page.evaluate(() => ({
    flown: localStorage.getItem("galaxia:flown"),
    runs: Object.keys(localStorage).filter((key) => key.startsWith("galaxia:run:")),
    best: localStorage.getItem("galaxia:best"),
  }));

  // The flight log is what unlocks hulls; a hatch that could farm it is a
  // hatch that changes the game.
  expect(record.flown).toBe("3");
  expect(record.runs).toEqual([]);
  expect(record.best).toContain("1999-01-01");
});
