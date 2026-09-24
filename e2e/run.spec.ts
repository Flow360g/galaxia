import { expect, test, type Page } from "@playwright/test";
import round from "../content/rounds/2026-09-18.json";
import { pickSites } from "../lib/content/sites";
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
  // No `?replay=1`: this is the path a player takes, where finishing saves the
  // run. The hatch never reads storage, and it hid the engine being torn down
  // (sound and all) the moment a real run's tally came up.
  await page.goto("/play?round=2026-09-18");
  // A fresh profile has not heard today's Mayday.
  await expect(page.getByTestId("transmission")).toContainText(/mayday/i, { timeout: 20_000 });
  await acknowledge(page);

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
  // Nothing to bank yet, so nothing is pointing at the dial.
  await expect(page.getByTestId("bank-nudge")).toHaveCount(0);
  await shot(page, "01-cluster");
  const [right1, right2] = answersOf(0);
  await page.getByTestId(`option-${right1}`).click();
  await expect(page.getByTestId(`option-${right1}`)).toHaveAttribute("data-got", "true", {
    timeout: 5_000,
  });
  await expect(page.getByTestId("reactor")).toHaveAttribute("data-charge", "1");
  await expect(page.getByTestId("burn")).toBeEnabled();
  // First plasma of the run's first cluster: the callout comes up over the
  // dial, because nothing else says the dial has to be pressed.
  await expect(page.getByTestId("bank-nudge")).toBeVisible();
  await expect(page.getByTestId("bank-nudge")).toContainText("TAP TO BANK");
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
  // The callout was for the first cluster only. It does not come back.
  await expect(page.getByTestId("bank-nudge")).toHaveCount(0);
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
  // The next phase in a few short lines, counted off the round.
  await expect(page.getByTestId("waypoint-rules")).toContainText("2 questions.");
  await expect(page.getByTestId("waypoint-rules")).toContainText(/always a number/i);
  await shot(page, "06-waypoint-entering");
  // The finer print and the scoring are behind a button, shut. Opening it
  // must not count as the tap that moves the run on.
  const scoringToggle = page.getByTestId("scoring-toggle");
  await expect(scoringToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("tap-prompt")).toBeVisible({ timeout: 15_000 });
  await scoringToggle.click();
  await expect(page.getByTestId("scoring")).toContainText("WITHIN 5%");
  await expect(page.getByTestId("more-detail")).toContainText(/wins back a shield/i);
  await expect(waypoint).toBeVisible();
  await shot(page, "06b-waypoint-scoring");
  // The stage card waits to be tapped on too, banner included.
  await advance(page, "banner");

  // Encounter 3: vector. Aim dead on. DIRECT HIT. Every shield is still up,
  // so the salvage is a NOVA rather than a shield.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("GUESS THE NUMBER").first()).toBeVisible();
  // The slider opens in the middle with its figure showing, a point of
  // reference before the first touch.
  await expect(page.getByTestId("aim-value")).toHaveText(rulerText(2, 50));
  await page.getByTestId("aim").fill(String(notchOf(2)));
  await expect(page.getByTestId("aim-value")).toHaveText(rulerText(2, notchOf(2)), { timeout: 5_000 });
  await expect(page.getByTestId("lock")).toBeEnabled();
  await shot(page, "07-vector-aim");
  await page.getByTestId("lock").click();
  await expect(toast).toHaveAttribute("data-outcome", "slingshot", { timeout: 10_000 });
  await expect(toast).toContainText("DEAD ON");
  await expect(page.getByTestId("toast-points")).toHaveText(/\+200/);
  await expect(page.getByTestId("ruler")).toHaveAttribute("data-guess", String(notchOf(2)));
  await expect(page.getByTestId("salvage")).toContainText("+1 HINT");
  await shot(page, "08-direct-hit");
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "3");
  await advance(page);

  // Encounter 4: vector, aim at the far end, more than 40 steps from the
  // answer. The ship never fires: the scout does, and the screen says the
  // hull wore it.
  await expect(question).toBeVisible({ timeout: 15_000 });
  expect(100 - notchOf(3)).toBeGreaterThan(40);
  await page.getByTestId("aim").fill("100");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("damage")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("pulse")).toHaveAttribute("data-kind", "damage");
  await shot(page, "09-damage");
  await expect(toast).toHaveAttribute("data-outcome", "collision", { timeout: 10_000 });
  await expect(toast).toContainText("WAY OFF");
  await expect(page.getByTestId("toast-points")).toHaveText(/-25/);
  await expect(page.getByTestId("shield")).toHaveAttribute("data-shields", "2");
  await shot(page, "09-miss");
  await advance(page);

  // Waypoint: Alien Contact rated, then OPEN SKY as phase 3.
  await expect(waypoint).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rating")).toBeVisible({ timeout: 5_000 });
  await expect(waypoint).toContainText("PHASE 3", { timeout: 6_000 });
  await expect(waypoint).toContainText("OPEN SKY");
  await expect(waypoint).toContainText("PICK ONE");
  // The card shows the band it is about to open, BOOST pointed at, before
  // the clock is running.
  await expect(page.getByTestId("boost-demo")).toContainText("TAP HERE FIRST");
  await shot(page, "09b-waypoint-open-sky");
  // The sample band makes this card tall enough to cover the middle of the
  // screen, so it is tapped on the card itself.
  await advance(page, "banner");

  // Encounter 5: NOVA then correct with boost. SLINGSHOT, and full marks:
  // 100 at x1, since the miss before it reset the streak.
  await expect(question).toBeVisible({ timeout: 15_000 });
  // The first PICK ONE of the run points at BOOST and says it goes first.
  await expect(page.getByTestId("boost-nudge")).toBeVisible();
  await expect(page.getByTestId("boost-nudge")).toContainText("TAP BOOST FIRST");
  await shot(page, "10a-boost-nudge");
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
  // Armed: the callout has done its job.
  await expect(page.getByTestId("boost-nudge")).toHaveCount(0);
  await page.getByTestId(`option-${answerOf(4)}`).click();
  await expect(page.getByTestId("pulse")).toHaveAttribute("data-kind", "plasma", {
    timeout: 5_000,
  });
  await expect(toast).toHaveAttribute("data-outcome", "slingshot", { timeout: 10_000 });
  await expect(page.getByTestId("toast-points")).toHaveText(/\+200/);
  await shot(page, "10-slingshot");
  await advance(page);

  // Encounter 6: let the six seconds run out. TOO SLOW. The BOOST callout
  // was for the first PICK ONE only.
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("boost-nudge")).toHaveCount(0);
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
  // The panel opens on Sergeant Soap and nothing else. The order is the one
  // thing at the top now: the tag, the phase number, a second title and a hint
  // count all stacked up here once and pushed the picture down the screen.
  const order = page.getByTestId("station-order");
  await expect(order).toBeVisible();
  // He is talking and the feed is held behind him, which means the answer
  // clock is too: nobody is timed on reading.
  await expect(page.getByTestId("site-answer")).toBeDisabled();
  await shot(page, "13b-station-hail");
  await expect(order).toContainText(/so we can send reinforcements/i, { timeout: 20_000 });
  // Then the feed comes up on its own, a beat after the last word.
  await expect(page.getByTestId("hail-catcher")).toHaveCount(0, { timeout: 20_000 });
  // The hint count is said once now, on the button that sells them: a tester
  // once played the whole phase without knowing hints existed.
  await expect(page.getByTestId("request-intel")).toContainText(/hints left/i);
  await expect(question).toHaveCount(0);
  await shot(page, "14-station");

  // Read the pair rather than naming it: the sites are drawn from the pool by
  // date, so hard-coding two names makes any change to that pool look like a
  // broken run. Every site's own name is one of its accepted answers.
  const pair = pickSites("2026-09-18").map((s) => s.name);
  for (const [index, site] of pair.entries()) {
    // The clock is held until the imagery settles, so the box is disabled
    // until the feed is up. The grace timeout guarantees it opens regardless.
    const box = page.getByTestId("site-answer");
    await expect(box).toBeEnabled({ timeout: 20_000 });
    // The order is said once, on arrival: the second site of the dock picks up
    // where the first was answered and is not hailed again.
    await expect(page.getByTestId("hail-catcher")).toHaveCount(0);

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
    if (index === 1) {
      // A country is not an answer, and is not marked wrong either: the box
      // says so and the site stays open. "Morocco" for Marrakesh lost a site
      // once when nothing on screen had said a city was wanted.
      await expect(page.getByTestId("site-ask")).toContainText(/not the country/i);
      await box.fill("Morocco");
      await page.getByTestId("site-submit").click();
      await expect(page.getByTestId("site-ask")).toContainText(/that is a country/i);
      await expect(page.getByTestId("next-site")).toHaveCount(0);
      await expect(box).toBeEnabled();
    }
    if ((await box.count()) > 0) {
      await box.fill(site);
      await page.getByTestId("site-submit").click();
    }
    if (index === 0) {
      await expect(page.getByTestId("next-site")).toBeVisible({ timeout: 60_000 });
    } else {
      // What the site was worth, in the middle of the screen. The panel says
      // the word at the foot of a scroll region under a photograph and five
      // bought hints, which is where a tester read the answer and never saw
      // what it scored, so the figure is said here and only here. Asserted on
      // site 1, the one played straight: site 0 is allowed to time out.
      const verdict = page.getByTestId("site-verdict");
      await expect(verdict).toContainText("CORRECT");
      await expect(verdict).toContainText(/\+\d+ POINTS/);
      await shot(page, "15b-station-verdict");
      await expect(station).toContainText(/correct/i);
      // And it clears itself. NEXT PLACE is under it and the thumb has to
      // reach it, which is why it never takes a tap to get rid of.
      await expect(verdict).toHaveCount(0, { timeout: 15_000 });
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
  // The flight engine outlives the run: it plays the tally's sound and keeps
  // flying under the share card.
  await expect(page.getByTestId("stage").locator("canvas")).toHaveCount(1);
  // The run is named by how well it went, and the screen says which.
  await expect(tally).toHaveAttribute("data-tier", /^(perfect|legendary|great|good|complete)$/);
  await expect(page.getByTestId("tally-continue")).toHaveText("TAP TO CONTINUE", {
    timeout: 10_000,
  });
  await expect(page.getByTestId("tally-tier")).toBeVisible();
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

test("a vector graze: points on the ruler, no damage, and the streak holds", async ({ page }) => {
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

  // Aim 18 steps high: past a hit, well short of a wild shot. Every step
  // costs 5 of the 200, so it pays 110.
  await expect(page.getByTestId("question")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("aim").fill(String(notchOf(2) + 18));
  await page.getByTestId("lock").click();
  await expect(toast).toHaveAttribute("data-outcome", "graze", { timeout: 10_000 });
  await expect(toast).toContainText("WITHIN 25%");
  await expect(page.getByTestId("toast-points")).toHaveText(/^\+110 POINTS$/);
  // Off by, in the question's own units, not a percentage of the answer.
  await expect(page.getByTestId("wide-by")).toHaveText(
    `${rulerText(2, notchOf(2) + 18, answerValueOf(2))} off`,
  );
  await expect(page.getByTestId("ruler")).toHaveAttribute("data-answer", String(notchOf(2)));
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

function vectorAt(index: number): { min: number; max: number; answer: number; unit?: string } {
  const question = round.questions[index];
  if (!question || question.type !== "vector") throw new Error(`no vector at ${index}`);
  return question as unknown as { min: number; max: number; answer: number; unit?: string };
}

/** The ruler notch (0..100) a vector's answer rounds to. */
function notchOf(index: number): number {
  const { min, max, answer } = vectorAt(index);
  return Math.round(((answer - min) / (max - min)) * 100);
}

function answerValueOf(index: number): number {
  return vectorAt(index).answer;
}

/**
 * What the ruler prints for `notch`, the way the HUD prints it: to as many
 * decimals as one step needs, with the unit. With `from`, the distance from
 * that value instead, which is how the "off by" line reads.
 */
function rulerText(index: number, notch: number, from?: number): string {
  const { min, max, unit } = vectorAt(index);
  const step = (max - min) / 100;
  const decimals = Math.min(3, (String(Math.round(step * 1e9) / 1e9).split(".")[1] ?? "").length);
  const value = min + step * notch;
  const shown = from === undefined ? value : Math.abs(value - from);
  const text = shown.toLocaleString("en-AU", { maximumFractionDigits: decimals });
  return unit ? `${text} ${unit}` : text;
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
