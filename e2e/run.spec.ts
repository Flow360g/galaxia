import { expect, test, type Page } from "@playwright/test";
import round from "../content/rounds/2026-09-18.json";
import { acknowledge, launch, readUp, stubImagery } from "./helpers";

const SHOTS = process.env.SHOT_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/**
 * Nothing advances on a timer any more: a verdict or a waypoint card sits
 * there until the player taps. Wait for TAP TO CONTINUE to arm, then tap.
 *
 * Either target counts, and both are exercised below: the banner itself,
 * which is what a player aims at, and anywhere else on the screen, which is
 * the catcher behind the band.
 */
async function advance(page: Page, via: "banner" | "anywhere" = "anywhere") {
  const prompt = page.getByTestId("tap-prompt");
  await expect(prompt).toBeVisible({ timeout: 15_000 });
  if (via === "banner") await prompt.click();
  else await page.getByTestId("continue").click();
}

test("a full run: burn, cluster miss, waypoint, direct hit, miss, slingshot, timeout, dock, debrief, share", async ({
  page,
}) => {
  await stubImagery(page);
  await page.goto("/play?replay=1&round=2026-09-18");

  const question = page.getByTestId("question");
  const toast = page.getByTestId("toast");

  // Every run opens on the launch card: what Phase 1 is, and one button.
  const ready = page.getByTestId("ready");
  await expect(ready).toBeVisible({ timeout: 20_000 });
  await expect(ready).toContainText("FIND THE 3");
  // Nothing is flying behind it.
  await expect(question).toHaveCount(0);
  await shot(page, "00-ready");
  await launch(page);

  // READY, then 3, 2, 1, GO over the engines lighting.
  await expect(page.getByTestId("countdown")).toBeVisible({ timeout: 10_000 });
  await shot(page, "00-countdown");

  // Encounter 1: cluster. The question comes up on its own first, with the
  // cluster's shield count and READY!, and no lane, tool or clock to lose it
  // on. Then two correct picks and BURN at 2 plasma.
  await expect(question).toBeVisible({ timeout: 20_000 });
  // GO has cleared by the time the first prompt lands.
  await expect(page.getByTestId("countdown")).toHaveCount(0);
  await expect(page.getByTestId("cluster-read")).toBeVisible();
  await expect(page.getByTestId("cluster-shields")).toHaveText("YOU HAVE 1 SHIELD");
  await expect(page.getByTestId("option-0")).toHaveCount(0);
  await expect(page.getByTestId("nova")).toHaveCount(0);
  await expect(page.getByTestId("burn")).toHaveCount(0);
  // The read clock is its own: ten seconds, not five.
  expect(Number((await page.getByTestId("clock").innerText()).replace(/\D/g, ""))).toBeGreaterThan(
    5,
  );
  await shot(page, "01a-cluster-read");
  await readUp(page);
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
  // The verdict names the points: 2 of 3 found is 0.6 of a 200 base, 120.
  await expect(page.getByTestId("toast-points")).toHaveText(/\+120/);
  await expect(page.getByTestId("score")).toContainText("120");
  const velocityAfterBurn = await readVelocity(page);
  expect(velocityAfterBurn).toBeGreaterThan(4000);
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "3");
  // The words are a target, not just a label.
  await advance(page, "banner");

  // Encounter 2: cluster. One correct, then a wrong lane. The cluster's own
  // shield takes the boulder, so the question stays open, but the banked plasma
  // is knocked out: the reactor drops back to empty. The player banks again and
  // a second wrong lane, with no shield left, ends the cluster for zero points
  // and none of the run's three shields.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await readUp(page);
  const [firstRight, secondRight] = answersOf(1);
  await page.getByTestId(`option-${firstRight}`).click();
  await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "1", { timeout: 5_000 });
  const [wrongA, wrongB] = wrongLanesOf(1);
  await page.getByTestId(`option-${wrongA}`).click();
  // The boulder's run-in and its final strike play out first. The shield saves
  // the question, but the plasma is gone: the reactor is back to empty.
  await expect(page.getByTestId("pulse")).toHaveAttribute("data-kind", "shield", {
    timeout: 10_000,
  });
  await expect(page.getByTestId("pulse")).toContainText("PLASMA LOST");
  await expect(page.getByTestId(`option-${wrongA}`)).toHaveAttribute("data-struck", "true");
  await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "0");
  await expect(toast).toHaveCount(0);
  await shot(page, "04a-cluster-shield");
  // Play continues: bank one more, then a second wrong ends the cluster.
  await page.getByTestId(`option-${secondRight}`).click();
  await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "1", { timeout: 5_000 });
  await page.getByTestId(`option-${wrongB}`).click();
  await expect(toast).toHaveAttribute("data-outcome", "collision", { timeout: 10_000 });
  await expect(toast).toContainText("1 plasma lost");
  await shot(page, "04-cluster-miss");
  await expect(page.getByTestId("streak")).toHaveText(/^\s*$/);
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "3");
  expect(await readVelocity(page)).toBeLessThan(velocityAfterBurn);
  // A lost cluster costs velocity and the streak, never points.
  await expect(page.getByTestId("toast-points")).toHaveText(/^\+0 POINTS$/);
  await advance(page);

  // Waypoint: Stage 1 rated (3 plasma of 6: B), then ALIEN CONTACT.
  const waypoint = page.getByTestId("waypoint");
  await expect(waypoint).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rating")).toHaveText("B", { timeout: 5_000 });
  await shot(page, "05-waypoint-rating");
  await expect(waypoint).toContainText("ALIEN CONTACT", { timeout: 6_000 });
  await expect(waypoint).toContainText("PHASE 2");
  await shot(page, "06-waypoint-entering");
  // The scoring is behind a button, shut. Opening it must not count as the
  // tap that moves the run on.
  const scoringToggle = page.getByTestId("scoring-toggle");
  await expect(scoringToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("tap-prompt")).toBeVisible({ timeout: 15_000 });
  await scoringToggle.click();
  await expect(page.getByTestId("scoring")).toContainText("WITHIN 5%");
  await expect(waypoint).toBeVisible();
  await shot(page, "06b-waypoint-scoring");
  // The stage card waits to be tapped on too, banner included.
  await advance(page, "banner");

  // Encounter 3: vector. Aim dead on. DIRECT HIT. Every shield is still up,
  // so the salvage is a NOVA rather than a shield.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("GUESS THE NUMBER").first()).toBeVisible();
  await page.getByTestId("aim").fill(String(sliderOf(2)));
  await expect(page.getByTestId("aim-value")).toContainText("10,9", { timeout: 5_000 });
  await shot(page, "07-vector-aim");
  await page.getByTestId("lock").click();
  await expect(toast).toHaveAttribute("data-outcome", "slingshot", { timeout: 10_000 });
  await expect(page.getByTestId("salvage")).toContainText("+1 HINT");
  await shot(page, "08-direct-hit");
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "3");
  await advance(page);

  // Encounter 4: vector, aim at the far end. The ship never fires: the scout
  // does, and the screen says the hull wore it.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("aim").fill("1000");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("damage")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("pulse")).toHaveAttribute("data-kind", "damage");
  await shot(page, "09-damage");
  await expect(toast).toHaveAttribute("data-outcome", "collision", { timeout: 10_000 });
  await expect(toast).toContainText("WAY OFF");
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "2");
  await shot(page, "09-miss");
  await advance(page);

  // Waypoint: Alien Contact rated, then OPEN SKY as phase 3.
  await expect(waypoint).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rating")).toBeVisible({ timeout: 5_000 });
  await expect(waypoint).toContainText("PHASE 3", { timeout: 6_000 });
  await expect(waypoint).toContainText("OPEN SKY");
  await expect(waypoint).toContainText("PICK ONE");
  await shot(page, "09b-waypoint-open-sky");
  await advance(page);

  // Encounter 5: NOVA then correct with boost. SLINGSHOT, and full marks:
  // 100 at x1, since the miss before it reset the streak.
  await expect(question).toBeVisible({ timeout: 15_000 });
  const clockBefore = Number((await page.getByTestId("clock").innerText()).replace(/\D/g, ""));
  await page.getByTestId("nova").click();
  await expect(page.getByTestId("nova-result")).toBeVisible();
  // A lifeline, not a trade: the hint arrives with a second put back on the
  // clock rather than thrust taken off it.
  await expect(page.getByTestId("nova-result")).toContainText("HINT:");
  await expect(page.getByTestId("nova-result")).toContainText("+1 SEC");
  expect(Number((await page.getByTestId("clock").innerText()).replace(/\D/g, ""))).toBeGreaterThanOrEqual(
    clockBefore,
  );
  await page.getByTestId("boost").click();
  await expect(page.getByTestId("boost")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId(`option-${answerOf(4)}`).click();
  await expect(page.getByTestId("pulse")).toHaveAttribute("data-kind", "plasma", {
    timeout: 5_000,
  });
  await expect(toast).toHaveAttribute("data-outcome", "slingshot", { timeout: 10_000 });
  await expect(page.getByTestId("toast-points")).toHaveText(/\+200/);
  await shot(page, "10-slingshot");
  await advance(page);

  // Encounter 6: let the five seconds run out. TOO SLOW.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(toast).toHaveAttribute("data-outcome", "timeout", { timeout: 30_000 });
  await shot(page, "11-timeout");
  await advance(page);

  // Waypoint: Open Sky rated, then the card briefs WHERE ON EARTH as phase 4.
  await expect(waypoint).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rating")).toBeVisible({ timeout: 5_000 });
  await expect(waypoint).toContainText("PHASE 4", { timeout: 6_000 });
  await expect(waypoint).toContainText("NAME THE PLACE");
  await expect(page.getByTestId("waypoint-standby")).toBeVisible();
  await shot(page, "12-waypoint-earth");
  await advance(page, "banner");

  // Encounter 7: WHERE ON EARTH. No lanes, no clock, no tools: the station
  // comes alongside and arms the door. The score does not move for docking.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(question.getByText("NAME THE PLACE")).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveCount(0);
  await expect(page.getByTestId("thrust")).toHaveCount(0);
  await expect(page.getByTestId("option-0")).toHaveCount(0);
  await expect(page.getByTestId("nova")).toHaveCount(0);
  const enter = page.getByTestId("enter-station");
  await expect(enter).toBeDisabled();
  await expect(enter).toHaveText("CLOSING...");
  const scoreBefore = await page.getByTestId("score").innerText();
  await expect(enter).toBeEnabled({ timeout: 15_000 });
  await expect(enter).toHaveText("ENTER SPACE STATION");
  await expect(page.getByTestId("station-status")).toContainText("ALONGSIDE");
  await shot(page, "13-station-approach");
  await enter.click();

  // Aboard: the station screen owns the display; the HUD is gone under it.
  // Two sites are flown on one dock, the second starting where the first was
  // answered rather than back at the approach.
  const station = page.getByTestId("station");
  await expect(station).toBeVisible();
  await expect(station).toContainText(/satellite view/i);
  // The task and the hint count are the first things on the panel: a tester
  // once played the whole phase without knowing hints existed.
  await expect(station).toContainText(/name the place/i);
  await expect(page.getByTestId("station-hints")).toContainText(/hints to use/i);
  await expect(question).toHaveCount(0);
  await shot(page, "14-station");

  for (const [index, site] of ["Dubai", "Cape Town"].entries()) {
    // The clock is held until the imagery settles, so the box is disabled
    // until the feed is up. The grace timeout guarantees it opens regardless.
    const box = page.getByTestId("site-answer");
    await expect(box).toBeEnabled({ timeout: 20_000 });

    // The mosaic was fetched at launch too, so the optic mounts on blobs and a
    // zoom step never waits on the tile server. Nine tiles, all warm.
    const tiles = page.getByTestId("feed-tile");
    await expect(tiles).toHaveCount(9);
    await expect(tiles.first(), "the tiles were not preloaded").toHaveAttribute("src", /^blob:/);

    // Buy every rung on the first site, which is what broke in play: the two
    // photographs grew the panel until the input sat under the fold of a fixed,
    // unscrollable shell, and the screen read as frozen with the clock running.
    // Playwright does not catch that on its own, because an element outside the
    // viewport still counts as visible and `fill` still fills it. So assert the
    // geometry: the input and Send must be inside the viewport with everything
    // bought, and the feed must have absorbed the overflow by scrolling.
    if (index === 0) {
      const intel = page.getByTestId("request-intel");
      // Kept tight on purpose: this runs against the live 40 second answer
      // clock, so every extra wait in here is time taken off the question.
      // Dubai sells five rungs: clue, street, landmark, structure, territory.
      const rungs = 5;
      for (let rung = 0; rung < rungs; rung += 1) {
        await expect(intel).toBeEnabled();
        // The button counts down what is left, so the player always knows.
        await expect(intel).toContainText(new RegExp(`${rungs - rung} hints? left`, "i"));
        // `force` because the last of these clicks removes its own target:
        // Playwright's stability check retries, re-queries a button that has
        // just unmounted, and then waits out the entire test. Actionability is
        // asserted on the line above instead of relying on the implicit check.
        await intel.click({ force: true });
        if (rung === 2) {
          // The landmark rung lands on the map, so the feed scrolls back up to
          // the optic and the pin is in view. It scrolled DOWN once, to the
          // text line, and the pin was never seen.
          await expect(page.getByTestId("landmark-pin")).toBeVisible();
          await expect
            .poll(() => page.getByTestId("feed-scroll").evaluate((node) => node.scrollTop))
            .toBeLessThan(4);
        }
      }
      await expect(intel).toHaveCount(0);
      await expect(station).toContainText(/all hints used/i);

      // Both photographs were fetched at launch, six questions ago, so a bought
      // hint shows its picture at once: the figure mounts on the blob that was
      // fetched then, not on a Wikimedia address, and is already painted. The
      // timeout is tight on purpose; a picture that takes seconds here is the
      // slow tap this exists to prevent.
      const photos = page.getByTestId("ground-photo");
      await expect(photos).toHaveCount(2);
      for (const photo of await photos.all()) {
        await expect(photo, "the photograph was not preloaded").toHaveAttribute("src", /^blob:/);
        await expect
          .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), {
            message: "the preloaded photograph was not painted at once",
            timeout: 2_000,
          })
          .toBeGreaterThan(0);
      }

      // Playwright's own clicks scroll an `overflow: hidden` ancestor to bring
      // their target into view, and a thumb cannot: that is why this bug reached
      // a real phone with the suite green. Undo that scroll before measuring, so
      // what is asserted is the screen the player actually gets.
      await page.getByTestId("station").evaluate((node) => {
        for (let el: HTMLElement | null = node; el; el = el.parentElement) {
          el.scrollTop = 0;
        }
      });

      const viewport = page.viewportSize()!;
      for (const id of ["site-answer", "site-submit"]) {
        const seen = await page.getByTestId(id).boundingBox();
        expect(seen, `${id} has no box`).not.toBeNull();
        expect(seen!.y + seen!.height, `${id} is below the fold`).toBeLessThanOrEqual(
          viewport.height,
        );
        expect(seen!.y, `${id} is above the fold`).toBeGreaterThanOrEqual(0);
      }
      const overflow = await page
        .getByTestId("feed-scroll")
        .evaluate((node) => node.scrollHeight - node.clientHeight);
      expect(overflow, "the feed should be scrolling with every rung bought").toBeGreaterThan(0);
      // Last, because a screenshot is slow and the answer clock is running.
      await shot(page, "14b-station-all-intel");
    }

    // The clock has to be running, and only the engine can make it: the flight
    // is parked while this screen is up, so the run's tick comes from the
    // parked branch of the loop. It sat frozen at its full 40 once, which made
    // the timed question untimed and the timeout path dead code.
    if (index === 0) {
      const clock = page.getByTestId("feed-clock");
      const first = Number(await clock.innerText());
      expect(first).toBeGreaterThan(0);
      await page.waitForTimeout(1500);
      expect(Number(await clock.innerText()), "the answer clock is not running").toBeLessThan(
        first,
      );
    }

    // Site 0 buys every rung against the live 40 second clock, and on a loaded
    // machine the clock can win: the answer box unmounts and a verdict is
    // already up. That is a legitimate outcome of the mechanic, not a failure,
    // so it is tolerated here and the correct identification is asserted on
    // site 1, which is played straight.
    if ((await box.count()) > 0) {
      await box.fill(site);
      await page.getByTestId("site-submit").click();
    }
    if (index === 0) {
      await expect(page.getByTestId("next-site")).toBeVisible({ timeout: 60_000 });
    } else {
      await expect(station).toContainText(/correct/i);
    }
    if (index === 0) await shot(page, "15-station-site");
    await page.getByTestId("next-site").click();
  }

  // The scorecard: one line per encounter, then the total out of the perfect
  // run. It is the beat before the share card, and it waits for a tap.
  const tally = page.getByTestId("tally");
  await expect(tally).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("tally-line-0")).toContainText("2 OF 3 FOUND");
  await expect(page.getByTestId("tally-line-6")).toContainText("NAME THE PLACE");
  await expect(page.getByTestId("tally-line-7")).toContainText("NAME THE PLACE");
  // The lines land one at a time and the total lands after them. Text is in
  // the DOM the whole time, so the reveal is asserted on the class that
  // actually makes a line visible rather than on its content.
  await expect(page.getByTestId("tally-line-7")).toHaveClass(/lineIn/, { timeout: 10_000 });
  // Phases weighted 400/400/400/600 with no points multiplier: 1,800 perfect.
  await expect(page.getByTestId("tally-total")).toContainText("/ 1,800");
  await expect(page.getByTestId("tally-continue")).toHaveText("TAP TO CONTINUE");
  // The total stamps in a beat after the last line.
  await expect(page.getByTestId("tally-total")).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, "15-tally");
  const scored = Number(
    (await page.getByTestId("tally-total").innerText()).split("/")[0]!.replace(/[^0-9]/g, ""),
  );
  expect(scored).toBeGreaterThan(0);
  expect(scored).toBeLessThan(1800);
  // The station is an encounter now, not a cutscene: two sites named correctly
  // add their base on top of whatever the flight had banked.
  const beforeDock = Number(scoreBefore.split("/")[0]!.replace(/[^0-9]/g, ""));
  expect(scored).toBeGreaterThan(beforeDock);
  await page.getByTestId("tally-continue").click();

  // Both sites named: Earth Command calls back before the share card.
  await expect(page.getByTestId("transmission")).toContainText(/saved earth/i, {
    timeout: 15_000,
  });
  await shot(page, "15b-debrief");
  await acknowledge(page);

  // Share card.
  const card = page.getByTestId("share-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("share-image")).toHaveAttribute("src", /blob:|data:/, {
    timeout: 15_000,
  });
  // The score is the only figure the screen itself prints; the round, the
  // stages, the distance and the hull are all on the card image.
  const finalScore = await page.getByTestId("final-score").innerText();
  expect(Number(finalScore.replace(/[^0-9]/g, ""))).toBeGreaterThan(0);
  await shot(page, "16-share");

  // What actually travels: the round, the total, and one row of squares per
  // stage. Headless Chromium has no share sheet, so SHARE falls through to
  // the clipboard, which is the same text either way.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("share-button").click();
  await expect(page.getByTestId("share-button")).toHaveText("COPIED");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^ASTRORUN #\d{3}/);
  expect(copied).toMatch(/Total Score: [\d,]+\/[\d,]+/);
  expect(copied.split("\n").filter((line) => /[🟦⬜]/u.test(line))).toHaveLength(4);
  expect(copied).toContain("www.astrorun.io");

  // The run is persisted: a reload shows the card, not a fresh run.
  await page.goto("/play?round=2026-09-18");
  await expect(page.getByTestId("share-card")).toBeVisible({ timeout: 15_000 });
  await page.goto("/?round=2026-09-18");
  await page.getByTestId("view-profile").click();
  await expect(page.getByTestId("today-run")).toContainText("KM");
  await expect(page.getByTestId("runs-played")).toHaveText("1");

  // And the flight log counted it, which is what earns a hull in the bay.
  expect(await page.evaluate(() => localStorage.getItem("galaxia:flown"))).toBe("1");
});

test("all three lanes: MAXIMUM THRUST", async ({ page }) => {
  await page.goto("/play?replay=1&round=2026-09-18");
  const toast = page.getByTestId("toast");

  await launch(page);
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 20_000 });
  // Enter is READY on the read screen, like it is everywhere else a tap is.
  await expect(page.getByTestId("cluster-ready")).toBeVisible();
  await page.keyboard.press("Enter");
  // The HUD samples the run at about 12Hz, so give the lanes a beat to land
  // before the number keys start: a key on a stale phase is ignored.
  await expect(page.getByTestId("option-0")).toBeVisible({ timeout: 5_000 });
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
  await expect(page.getByTestId("burn")).toContainText("FIRE");
  await shot(page, "14-gauge-full");
  await page.getByTestId("burn").click();
  await expect(toast).toHaveAttribute("data-outcome", "burn", { timeout: 10_000 });
  await expect(toast).toHaveAttribute("data-charge", "3");
  await expect(toast).toContainText("ALL 3 FOUND!");
  // The full-screen treatment only a full reactor gets: hazard placard, speed
  // lines, and the shell shaking under both.
  await expect(page.getByTestId("max-thrust")).toBeVisible();
  await expect(page.getByTestId("warp")).toBeAttached();
  // Full charge: all 3 found is the whole 200 base for the encounter.
  await expect(page.getByTestId("toast-points")).toHaveText(/\+200/);
  await expect(page.getByTestId("score")).toContainText("200");
  await shot(page, "09-max-thrust");
  expect(await readVelocity(page)).toBeGreaterThan(6000);
  await expect(page.getByTestId("streak")).toHaveText("STREAK x1");
});

test("a vector graze: no points, no damage, and the streak holds", async ({ page }) => {
  await page.goto("/play?replay=1&round=2026-09-18");
  const toast = page.getByTestId("toast");

  await launch(page);
  // Two clusters, one plasma banked on each, so the streak into the vector is 2.
  for (const index of [0, 1]) {
    await expect(page.getByTestId("question")).toBeVisible({ timeout: 20_000 });
    await readUp(page);
    await page.getByTestId(`option-${answersOf(index)[0]}`).click();
    await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "1", { timeout: 5_000 });
    await page.getByTestId("burn").click();
    await expect(toast).toHaveAttribute("data-outcome", "burn", { timeout: 10_000 });
    await advance(page);
  }
  await expect(page.getByTestId("waypoint")).toBeVisible({ timeout: 15_000 });
  await advance(page);

  // Aim 12% high: inside the graze band, outside the close one.
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("aim").fill(String(sliderOf(2, 1.12)));
  await page.getByTestId("lock").click();
  await expect(toast).toHaveAttribute("data-outcome", "graze", { timeout: 10_000 });
  await expect(toast).toContainText("NEAR MISS");
  await expect(page.getByTestId("toast-points")).toHaveText(/^\+0 POINTS$/);
  await expect(page.getByTestId("wide-by")).toContainText(/1[12](\.\d)?% off/);
  await shot(page, "17-graze");
  // Nothing taken: every shield still up, no damage banner, streak as it was.
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "3");
  await expect(page.getByTestId("damage")).toHaveCount(0);
  await expect(page.getByTestId("streak")).toHaveText("STREAK x2");
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

/**
 * Slider position (0..1000) that lands on a vector's answer, or on `scale`
 * times it: 1.12 aims 12% high.
 */
function sliderOf(index: number, scale = 1): number {
  const question = round.questions[index];
  if (!question || question.type !== "vector") throw new Error(`no vector at ${index}`);
  const { min, max } = question as { min: number; max: number; answer: number };
  const answer = (question as { answer: number }).answer * scale;
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

/** The wrong lanes of a cluster, in lane order. There are always three. */
function wrongLanesOf(index: number): number[] {
  const question = round.questions[index];
  if (!question || question.type !== "cluster") throw new Error(`no cluster at ${index}`);
  const answers = question.answers as number[];
  const lanes = question.options.map((_, i) => i).filter((i) => !answers.includes(i));
  if (lanes.length < 2) throw new Error(`not enough wrong lanes at ${index}`);
  return lanes;
}
