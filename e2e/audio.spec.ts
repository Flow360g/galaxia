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
    /** The engine's audio, exposed under ?debug=1 for tuning and for this. */
    galaxiaAudio: {
      musicBus: GainNode;
      pick?: unknown;
    };
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

/** Highest amplitude and brightness over `ms`, measured from a clean slate. */
async function measure(page: Page, ms: number): Promise<{ peak: number; brightest: number }> {
  await page.evaluate(() => {
    window.__peak = 0;
    window.__brightest = 0;
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => ({ peak: window.__peak, brightest: window.__brightest }));
}

test("sound: the flight has a bed, a hit rises above it, and mute silences it", async ({
  page,
}) => {
  await page.addInitScript(probe);
  // ?debug=1 puts the audio engine on the window, which is the only way to
  // ask what one layer of the mix is contributing.
  await page.goto("/play?replay=1&debug=1&round=2026-09-18");

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
  const bed = (await measure(page, 1200)).peak;
  expect(bed).toBeGreaterThan(0.01);
  // Headroom, not a level. The bed peaks a little either side of 0.5 depending
  // on where the music loop's bass note lands inside the sampling window, so a
  // bound ON 0.5 fails about one run in four under load and says nothing about
  // the mix. What matters is that the bed leaves room for the hit below, which
  // must still clear it by half again and stay under clipping.
  expect(bed).toBeLessThan(0.6);

  // The music is half the bed, not a rumour under it. It went inaudible once
  // by being mixed at a twentieth of the engine and by having its bass
  // routed off its own bus, and neither shows up in a test of the total.
  const musicLevel = await page.evaluate(() => window.galaxiaAudio.musicBus.gain.value);
  await page.evaluate(() => {
    window.galaxiaAudio.musicBus.gain.value = 0;
  });
  const engineOnly = await measure(page, 1600);
  expect(engineOnly.peak).toBeLessThan(bed * 0.8);

  // Choosing a lane makes no sound of its own: the verdict riding in is the
  // sound, and a click on top of it was noise.
  expect(await page.evaluate(() => typeof window.galaxiaAudio.pick)).toBe("undefined");

  // A collision: the loudest thing that can happen to the hull, and clearly
  // above the bed it lands on.
  //
  // Measured across the whole encounter rather than after it, because the
  // slam is a transient and a window opened once the toast is up has already
  // missed it, and measured with the music still down, so the shape below is
  // the cue's own and not the loop's hats and sparkle.
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
  // can be aimed at it, so both readings are taken as the loudest and the
  // brightest moment of the whole encounter rather than at one instant.
  const onset = await page.evaluate(() => window.__brightest);
  const hit = await page.evaluate(() => window.__peak);
  expect(hit).toBeGreaterThan(engineOnly.peak * 2);
  // Nothing anywhere in the mix may clip.
  expect(hit).toBeLessThan(1);

  // A crash is a shape, not a level: contact is a bright transient, far
  // brighter than anything the bed does, where a beep would sit at one
  // brightness for as long as it lasts. (How fast it then decays is not
  // asserted here: the next encounter is called a beat later and its own cue
  // lands inside any window long enough to measure the tail.)
  expect(onset).toBeGreaterThan(2500);
  expect(onset).toBeGreaterThan(engineOnly.brightest * 1.4);

  await page.evaluate((level) => {
    window.galaxiaAudio.musicBus.gain.value = level;
  }, musicLevel);

  // Muted: the master fades to silence and stays there.
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-muted", "true");
  await page.waitForTimeout(600);
  expect((await measure(page, 1000)).peak).toBeLessThan(0.005);

  // And the choice survives a reload.
  await page.goto("/play?replay=1&round=2026-09-18");
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
