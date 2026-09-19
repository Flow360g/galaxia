import { expect, test, type Page } from "@playwright/test";
import round from "../content/rounds/2026-09-18.json";
import { launch } from "./helpers";

/**
 * Sound is synthesised, not sampled, so there is no file to assert on. What
 * this checks instead is the signal itself: an analyser is spliced in front
 * of the destination before the page loads, and the tests read the peak
 * amplitude coming out of it.
 *
 * Peaks are compared against the idle bed (engine drone plus music), never
 * against a fixed level, since the bed rides the ship's speed.
 */

declare global {
  interface Window {
    __peak: number;
    /** Brightness of the mix right now, as a spectral centroid in hertz. */
    __centroid: number;
    /** Brightest the mix has been since the last reset. */
    __brightest: number;
    __audioState: () => string;
  }
}

/** Splice an analyser in front of the destination and track its peak. */
function probe(): void {
  const connect = AudioNode.prototype.connect;
  window.__peak = 0;
  window.__brightest = 0;
  window.__audioState = () => "none";

  AudioNode.prototype.connect = function (
    this: AudioNode,
    destination: AudioNode | AudioParam,
    ...rest: number[]
  ) {
    const context = (destination as AudioNode).context;
    if (!context || destination !== context.destination) {
      return (connect as (...args: unknown[]) => AudioNode).call(this, destination, ...rest);
    }

    const tapped = context as AudioContext & { __tap?: AnalyserNode };
    if (!tapped.__tap) {
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      connect.call(analyser, context.destination);
      tapped.__tap = analyser;
      window.__audioState = () => context.state;

      const samples = new Float32Array(analyser.fftSize);
      const spectrum = new Float32Array(analyser.frequencyBinCount);
      setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        window.__peak = Math.max(window.__peak, peak);

        // Spectral centroid: where the energy sits. It is the one number
        // that separates a bright crack from a low rumble.
        analyser.getFloatFrequencyData(spectrum);
        let weighted = 0;
        let total = 0;
        for (let i = 0; i < spectrum.length; i += 1) {
          const magnitude = Math.pow(10, spectrum[i]! / 20);
          weighted += (magnitude * i * context.sampleRate) / (2 * spectrum.length);
          total += magnitude;
        }
        window.__centroid = total > 0 ? weighted / total : 0;
        window.__brightest = Math.max(window.__brightest, window.__centroid);
      }, 40);
    }
    return (connect as (...args: unknown[]) => AudioNode).call(this, tapped.__tap, ...rest);
  } as typeof AudioNode.prototype.connect;
}

/** Highest amplitude seen over `ms`, measured from a clean slate. */
async function peakOver(page: Page, ms: number): Promise<number> {
  await page.evaluate(() => {
    window.__peak = 0;
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => window.__peak);
}

test("sound: the flight has a bed, a hit rises above it, and mute silences it", async ({
  page,
}) => {
  await page.addInitScript(probe);
  await page.goto("/play?replay=1");

  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 20_000 });
  // Browsers hold a context suspended until a gesture; the toggle is one.
  // Off and straight back on leaves the run where it started, sound on.
  const toggle = page.getByTestId("sound");
  await expect(toggle).toHaveAttribute("data-muted", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-muted", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-muted", "false");
  await expect.poll(() => page.evaluate(() => window.__audioState())).toBe("running");

  // The engine drone and the music: always there, never loud.
  const bed = await peakOver(page, 1200);
  expect(bed).toBeGreaterThan(0.01);
  // Headroom, not a level. The bed peaks a little either side of 0.5 depending
  // on where the music loop's bass note lands inside the sampling window, so a
  // bound ON 0.5 fails about one run in four under load and says nothing about
  // the mix. What matters is that the bed leaves room for the hit below, which
  // must still clear it by half again and stay under clipping.
  expect(bed).toBeLessThan(0.6);

  // A collision: the loudest thing that can happen to the hull, and clearly
  // above the bed it lands on.
  // Measured across the whole encounter rather than after it: the slam is a
  // transient, and a window opened once the toast is up has already missed it.
  await page.evaluate(() => {
    window.__peak = 0;
    window.__brightest = 0;
  });
  await page.getByTestId(`option-${wrongLaneOf(0)}`).click();
  await expect(page.getByTestId("toast")).toHaveAttribute("data-outcome", "collision", {
    timeout: 10_000,
  });
  await page.waitForTimeout(700);
  // The crack is over in under a tenth of a second, far quicker than a poll
  // can be aimed at it, so the onset is taken as the brightest moment of the
  // whole encounter rather than a reading at one instant.
  const onset = await page.evaluate(() => window.__brightest);
  const hit = await page.evaluate(() => window.__peak);
  expect(hit).toBeGreaterThan(bed * 1.5);
  // Nothing anywhere in the mix may clip.
  expect(hit).toBeLessThan(1);

  // A crash is a shape, not a level: bright contact collapsing into a low
  // tail of hull and debris. A beep would hold its brightness instead.
  const tail = await page.evaluate(() => window.__centroid);
  expect(onset).toBeGreaterThan(2500);
  expect(tail).toBeLessThan(onset * 0.6);

  // Muted: the master fades to silence and stays there.
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-muted", "true");
  await page.waitForTimeout(600);
  expect(await peakOver(page, 1000)).toBeLessThan(0.005);

  // And the choice survives a reload.
  await page.goto("/play?replay=1");
  await launch(page);
  await expect(page.getByTestId("sound")).toHaveAttribute("data-muted", "true", {
    timeout: 20_000,
  });
});

function wrongLaneOf(index: number): number {
  const question = round.questions[index];
  if (!question || question.type !== "cluster") throw new Error(`no cluster at ${index}`);
  const answers = question.answers as number[];
  const lane = question.options.findIndex((_, i) => !answers.includes(i));
  if (lane < 0) throw new Error(`no wrong lane at ${index}`);
  return lane;
}
