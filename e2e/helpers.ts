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

/**
 * Stand in for the satellite tiles and the Commons photographs.
 *
 * Both come off public hosts, and a suite that needs the open internet to
 * pass is a suite that fails on a laptop in a tunnel and in any sandboxed CI.
 * Worse, the station's geometry assertion depends on the two ground photos
 * actually arriving: without them the intel stack fits without scrolling and
 * the test proves nothing. So every request to either host gets the same
 * small JPEG, generated once in the browser. The feed still goes through its
 * real load path: the tiles settle, the clock starts, the photos take height.
 */
export async function stubImagery(page: Page) {
  let jpeg: Buffer | null = null;
  const render = async () => {
    if (jpeg) return jpeg;
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#3a5a40";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#8a9a7b";
      for (let i = 0; i < 256; i += 32) ctx.fillRect(i, 0, 8, 256);
      return canvas.toDataURL("image/jpeg", 0.7);
    });
    jpeg = Buffer.from(dataUrl.split(",")[1]!, "base64");
    return jpeg;
  };
  // `upload.wikimedia.org` is the road the prefetch actually takes (see
  // `thumbUrl`); `commons.wikimedia.org` is only the fallback. Stubbing the
  // fallback alone left the open internet deciding whether the photographs
  // arrived as blobs, which is exactly what the blob assertion is there to
  // check, so both hosts are stood in for here.
  await page.route(
    /https:\/\/(tiles\.maps\.eox\.at|upload\.wikimedia\.org|commons\.wikimedia\.org)\//,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: await render(),
      });
    },
  );
}

/**
 * A cluster opens on its question alone. Tap READY to bring the lanes up;
 * the pick clock does not start until then.
 */
export async function readUp(page: Page) {
  const ready = page.getByTestId("cluster-ready");
  await expect(ready).toBeVisible({ timeout: 15_000 });
  await ready.click();
  await expect(page.getByTestId("option-0")).toBeVisible({ timeout: 5_000 });
}
