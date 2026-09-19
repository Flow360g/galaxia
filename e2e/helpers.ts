import { expect, type Page } from "@playwright/test";

/**
 * Every run opens on the launch card. Press READY; 3, 2, 1, GO then runs
 * over the engines lighting and the first prompt lands as GO clears.
 *
 * Not a test file: Playwright only collects `*.spec.ts` from here.
 */
export async function launch(page: Page) {
  const ready = page.getByTestId("ready-go");
  await expect(ready).toBeVisible({ timeout: 25_000 });
  await ready.click();
}
