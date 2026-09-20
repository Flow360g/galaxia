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

/**
 * A transmission from Earth Command is up. The first tap lands the rest of
 * the message, the second acknowledges it; under reduced motion the first
 * tap is the acknowledgement.
 */
export async function acknowledge(page: Page) {
  const transmission = page.getByTestId("transmission");
  await expect(transmission).toBeVisible({ timeout: 15_000 });
  const ack = page.getByTestId("transmission-ack");
  if ((await transmission.getAttribute("data-landed")) !== "true") {
    await ack.click();
    await expect(transmission).toHaveAttribute("data-landed", "true");
  }
  await ack.click();
  await expect(transmission).toHaveCount(0);
}
