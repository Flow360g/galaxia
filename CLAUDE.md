@AGENTS.md

# Galaxia (shipped as Astro Run)

The player-facing name is **Astro Run**: the title screen carries the logo
in `public/astro-run-logo.png`, and the share text, share card, page titles
and bay stencils say ASTRO RUN. Galaxia stays as the working name for the
repo, the package, the localStorage keys (`galaxia:*`) and the debug
globals; renaming a storage key would wipe every player's flight log.

A daily quiz flight. Eight encounters, one run a day, scored out of a fixed
total (1,800 as tuned). Distance is still flown and still tracked; the score
is what the run is played for. Every answer is a lane: tap a square, the ship veers into
that lane, and the verdict rides in on it. A right lane sends a plasma pod
the ship flies through and accelerates; a wrong lane sends a boulder that
strikes the hull and kills its momentum. Built with Next.js 16 (App Router,
React 19) and three.js 0.180. TypeScript strict throughout. This file is the
working brief for anyone changing the code; the README is longer but parts
of it predate the lane rebuild, so trust the code and this file where they
disagree.

## What this product is

Galaxia is a **mobile-first, share-first daily game** in the lineage of
Wordle, krillio.io, maptap.gg and gnarlyq. The whole design leans on the
things that make those games sticky:

- **One run a day, everyone gets the same round.** Scarcity is the hook.
  Today's run is stored and replayed as the share card on revisit; the
  player cannot grind. Do not add unlimited replays to the main path
  (`?replay=1` is a dev and QA escape hatch, not a feature). The **practice
  run** is the same kind of hatch and is held to the same line: a round drawn
  from the whole pool (`getShuffledRound`), reachable only from
  `/profile?debug=1`, and never written down, so it cannot overwrite today's
  run, lift the best or count towards the flight log that unlocks hulls. It
  exists so that building the game does not mean answering the same eight
  questions until they are memorised. The same page picks the hull a practice
  run flies, any hull in the catalogue, locked or not, carried on the URL
  (`&ship=`) and never stored, so seeing a ship in flight never touches the
  player's selection, unlocks or purchases. Do not put it on a player's path.
- **Two to three minutes, one thumb.** A run has to fit a bus stop. Every
  interaction is a single tap. Nothing requires precision, reading a manual,
  or two hands.
- **A score you can hold in your head.** Every encounter is worth the same
  base, so the four phases weight evenly: 400, 400, 400, and WHERE ON EARTH
  the 600 finale, 1,800 in all. The streak lifts the ship's speed, not the
  score (it used to multiply points, which quietly made the phases worth
  200/400/600 by position), and most wrong answers score nothing: points come
  off only where the player chose the stake, a boosted lane or a wild shot at
  the scout. A run is quoted out of what a perfect run would have scored, so
  "1,240 of 1,800" means the same to everyone comparing. The first test player
  finished on zero under flat docks for every miss; do not bring them back.
  Distance is a
  speedometer reading and makes a poor anchor: nobody knows whether 12,000 km
  is a good day. See `SCORE` in `Tuning.ts` and `lib/game/Score.ts`; the end
  of the run tallies it line by line before the share card. The rules are
  explained in one place, `lib/game/phases.ts`, and the briefing, the launch
  card and the waypoint card all read from it, so a retune can never leave
  the game lying about itself. Two rules worth knowing when tuning: a
  general knowledge answer is worth the full base only with Boost pressed
  first (the perfect run assumes it was; unboosted it is half, and a wrong
  boosted answer is the one lane that docks points), and a Vector is scored on
  a ruler: the slider is `VECTOR.notches` steps from `min` to `max`, and every
  step between the guess and the answer costs the same (200 - 5 a step as
  tuned, see `vectorShare`). Past `VECTOR.wildBeyond` steps it is a wild
  shot, the flat dock and a shield. Between a hit and a wild shot it is a
  `graze`: still points, but no damage and the streak untouched. It used to
  score against the ANSWER ("33% off"), which made a wide range harder
  instead of more forgiving and made every calendar year a free hit; do not
  bring that back.
- **The player says when to move on.** Nothing advances on a timer once a
  verdict is up. The outcome toast and the waypoint card carry the right
  answer and a fact, and they sit there until the screen is tapped. Only the
  answer itself is timed.
- **Tension, then release.** The clock is five seconds per pick, drawn as
  thrust draining and a countdown, and it refills for every decision. A
  cluster opens on its question alone (`reading` phase): no lanes, a ten
  second read clock and a READY! button, so nobody is timed on reading. Its
  first pick then gets two seconds more for the six options. A PICK ONE question gets a second
  and a half more (`ENCOUNTER.mcqBonusSeconds`), for reading and the BOOST
  decision. A GUESS THE NUMBER slider opens with its thumb in the middle and
  that figure showing, so there is a point of reference before the first
  touch; it used to open empty, and under the clock that gave nothing to aim
  against. Each cluster
  carries one shield of its own: the first wrong lane costs the shield and the
  banked plasma but lets you keep answering, the second loses the cluster for
  zero, and the run's shields are never touched by a cluster. NOVA puts a second back on the
  clock rather than spending thrust; a lifeline that costs time is not one.
  Streaks lift the cruise floor so a miss is a visible fall from screaming
  to crawling. The Cluster is push-your-luck: every right lane winds the
  boost gauge in the bottom left corner up a notch, and the player either
  fires it now, on the dial in the opposite corner, or picks again for more
  and risks a boulder. Fill it and the clock stops: the biggest
  burst in the game is spent on a tap, never taken away on a timer. Boost is confidence as a button. Three
  shields per run; each wrong lane costs one, and at zero every miss is a
  wreck. Keep every new mechanic inside this frame: a decision with a
  visible stake, a fast verdict, a consequence you can feel.
- **The share is the product.** The end of every run is a 1080x1350 share
  card and a Wordle-style text block, and they say the same thing: the logo,
  the score out of a perfect run, then one row per stage of the run with that
  stage's points drawn as filled squares. Four rows, four emoji, one figure
  each, and the hull that flew it. Both are built from the same `stageRows`
  in `share.ts`, so a screenshot and a paste of the same run can never
  disagree. It used to lead with a velocity chart, marker shapes and five
  stat cells, and a friend had to study it to learn whether you had a good
  day; if a new element on the card cannot be read in one second, it does not
  belong on it. A shared link should land a new player on the title screen one
  tap from flying. Anything that makes the result more comparable, more
  braggable or more legible in a group chat is on-mission. Saving a run
  stamps two things on it (`saveRun` in `storage.ts`): the **day streak**,
  days in a row with a completed run, walked back through the stored runs
  rather than counted so a QA flight of another date cannot reset it; and
  **NEW BEST**, only when there was a best to beat. The tally, the card and
  the text all read the stamp, so a revisit says what the day said. A
  perfect run gets the gold card. The link a card points at unfurls into
  `app/opengraph-image.tsx`, and the home screen icon and manifest sit
  beside it; all of it is drawn at build from `lib/brand/art.tsx`.
- **Same help for everyone.** NOVA picks are seeded per question so friends
  comparing runs got identical assistance. Never introduce randomness that
  makes two players' runs on the same day non-comparable.
- **Reveal, don't punish.** Wrong answers still show the right answer and a
  fact. The tone is arcade, not exam.
- **The scene never leaks the answer.** Nothing is in the sky while a
  question is open. Only after a pick does exactly one object come down
  the chosen lane. Do not add anything that hints at which lanes are right.

When weighing a feature, ask: does it make the daily run tighter, the
verdict more dramatic, or the share more shareable? If not, it probably
belongs in "deliberately not done" below.

## Mobile first: rules for anything on screen

The game is played in **portrait on a phone**, usually one-handed. Desktop
works, but it is the fallback, not the target. Test on a real phone
(`npm run dev -- -H 0.0.0.0`, open the LAN address), not just an emulator.

The screen has two zones. Respect them:

- **Top band: the whole HUD.** Readouts (score, velocity, streak, shield
  pips; distance is tracked but not shown until the results), then the
  question panel: tag and countdown, prompt, thrust bar, the row of answer
  squares, the tools (HINT, and BOOST or FIRE; a Cluster's own two controls
  are in the corners, below). The
  outcome toast lands here too. The band is sized by its contents and
  capped at roughly 60vh so it can never creep down over the ship. Padded
  by `env(safe-area-inset-top)` for notches and Dynamic Island.
- **Everything below the band: the ship's.** The camera aims above the hull
  so the ship flies in the lower third, and the pod or boulder comes down
  the lane toward it. **Nothing may sit in this region.** No modals,
  banners, tooltips, buttons, or sticky elements over the lower half while
  a run is live. There are two exceptions, and they are the whole list.
  The first is the pulse (PLASMA COLLECTED, SHIELD
  LOST), a short one-shot flash at about 64% down that is `pointer-events:
  none` and fades in 1.4 seconds. The second is the Cluster's cockpit
  corners: the boost gauge in the bottom left and the round arcade push
  button that fires it in the bottom right (a bezel with a domed cap that
  stands proud of it and travels on a press), out at the edges either side of the ship rather
  than over it, and only while a Cluster is live. They are deliberate: the
  charge is the most dramatic thing in the run and the band had no room left
  to dramatise it, and a thumb reaches a bottom corner without crossing the
  screen. The gauge takes no taps at all; the dial is the only button the
  run draws below the band. On the run's FIRST Cluster only, once there is
  something to bank, a flashing TAP TO BANK / OR KEEP GOING callout and an
  arrow sit on top of the dial and it starts breathing: testers read the dial
  as a readout rather than a control and kept picking until a boulder took
  the lot. The callout is part of that corner, not a third element, so it is
  drawn off the dial's own `--dial` size, takes no pointer events, and never
  appears again after the first Cluster resolves. Testers also could not tell
  whether BOOST went before the answer or after it; the OPEN SKY phase card
  answers that, while nothing is timed: its worked example (`PhaseDemo`) taps
  BOOST and then the answer, and then shows a boosted wrong answer losing
  points, a picture with no pointer events so the card's tap still lands. It is not
  repeated in flight: a callout under BOOST on the first PICK ONE was tried and
  read as clutter over the question. The corners hug `env(safe-area-inset-*)`. Do not read
  them as licence for a third: anything else new goes in the band. The tap-to-continue catcher covers the whole screen but is drawn
  nowhere and only exists while the run is parked on a verdict; the visible
  TAP TO CONTINUE prompt lives in the band like everything else.
- **The answer row is the lane map.** The squares sit in one horizontal
  row in lane order, and the row measures its own layout and hands the
  engine each square's horizontal screen fraction, so tapping square 3
  veers the ship to a point genuinely under square 3 at any aspect ratio.
  Never reorder, wrap, or stagger the squares, and never change their
  container without keeping that measurement intact.

Concrete constraints when building or changing a component:

- Tap targets are at least 44px tall (lanes are 44 to 54px depending on
  viewport). Six squares share one row on a 360px-wide phone, so lane text
  is short and truncation is handled, never overflow. Words wrap only at
  spaces: `fitLabels` in `Hud.tsx` shrinks a label whose longest word does
  not fit its square, and only below 7px may a word break.
- The page never scrolls. `body` has `overflow: hidden` and
  `overscroll-behavior: none`, and the viewport disables user zoom because
  pinch and pull-to-refresh fight the game surface. Do not add content that
  needs scrolling inside the HUD; shorten it instead. The station's satellite
  feed is the one place anything scrolls, and it scrolls INSIDE its own panel
  (`StationFeed`'s `.scroll`, with `overscroll-behavior: contain`), never the
  page. It earns that because an optic, a growing intel stack and a text input
  cannot all fit a phone: capped instead, the input went under the fold of a
  `position: fixed` shell and the screen read as frozen with the clock still
  running. Any panel that can grow needs the same treatment, which means the
  control the player must reach sits OUTSIDE the scrolling part.
- The HUD wrapper is `pointer-events: none`; only the panel and toast opt
  back in. Keep it that way so touches fall through to the scene elsewhere.
- Type is legible on a 5.5 inch screen: prose 14 to 16px, arcade pixel
  type never below 9px, tabular figures for any number that changes so the
  counters do not jitter.
- Inputs use `font-size: 16px` so iOS does not zoom on focus. The one text
  input in the game is the station's answer field. A `position: fixed` screen
  cannot be scrolled clear of the software keyboard, so `Station.tsx` measures
  `window.visualViewport` and lifts the band by whatever the keyboard has
  taken; that is what keeps the field and Send visible. Any new input on a
  fixed screen needs the same, and never a layout that assumes the keyboard
  is closed.
- Check the `@media (max-width: 720px)` and `(max-height: 620px)` blocks in
  `components/Hud.module.css` when adding HUD elements. Short phones are the
  binding constraint, not narrow ones: every new row in the band pushes the
  cap and steals from the ship.
- Keyboard shortcuts (1 to 6, Enter, B, N) are a desktop convenience. Never
  make a feature keyboard-only, and never rely on hover states for meaning.
- Motion respects `prefers-reduced-motion`: the engine damps shake and
  parallax, the CSS kills the warp overlay and pulse ring. New effects need
  the same fallback.
- Performance is a design constraint on mobile. See the budget below. A
  HUD re-render at 60fps costs more than the scene, which is why React
  samples engine state at about 12Hz.

## Copy: plain English, always

Every word a player reads is written for a 10 year old who has never seen
the game. This is the rule that has been broken most often, and it is the
one to check before any other when writing or changing copy.

- **No made-up terms in explanations.** Thrust, Boost, Cluster, Plasma,
  Vector, NOVA, encounter, sector, lane and dock are the code's words. On a
  screen that explains the game (the title screen, the profile, the briefing,
  a phase card, the read screen, a verdict) only Plasma, Shield and Boost
  survive, and each is defined in plain words the first time it appears with
  that definition still in view. "8 asteroids, one run a day. Answer fast to
  keep your thrust, arm Boost when you are sure" is what not to write: a new
  player does not know what thrust or Boost are.
- **Define on first use, in the same sentence.** "If it is correct you
  collect plasma, which speeds your ship up and is worth points." Say what
  it is, what it does for the player and what it is worth, in that order,
  in one breath.
- **The vocabulary, on screen.** The four games are FIND THE 3, GUESS THE
  NUMBER, PICK ONE and NAME THE PLACE (`lib/game/phaseTitles.ts`, read by
  the cards, the HUD tag and the tally alike). The stage names (Cluster
  Belt, Alien Contact, Open Sky, Where on Earth) are places, not
  explanations, and stay. NOVA is HINT wherever a player reads it; the
  identifiers (`nova`, `novaLeft`, `useNova`, the `NOVA` constants, the
  `nova` test ids) keep their names. An answer is "correct" or "wrong",
  never "right", because "right" is also a side of the lane row. Intel is a
  hint, optics is zoom, a notch is a step, a wild shot is way off, an
  encounter is a question, a sector is a topic.
- **Every score figure says POINTS.** The run also counts speed and
  distance, so a bare +100 could be either. The toast, the tally and every
  scoring table row spell it out; the one abbreviation allowed is PTS on a
  chip too small for the word (the FIRE dial).
- **A figure appears once.** What the last answer was worth is in the
  verdict toast and nowhere else. It used to be under the score in the top
  band as well, and the same number in two places on one screen reads as two
  different numbers. Before adding a readout, check nothing else already
  says it.
- **Kilometres are for the results.** During a run the only speed figure is
  the velocity readout in the top band. The verdict toast, the waypoint card
  and the FIRE dial quote points, never km or km/h. Distance comes back on
  the tally, the share card and the profile, where it is a fun extra.
- **Plain verdict first, flavour second.** The headline of a toast or a
  pulse is CORRECT, WRONG, TOO SLOW, WAY OFF or ALL 3 FOUND, and for a
  number the step verdict: DEAD ON, WITHIN 5%, 10%, 25% or 40%, each a share
  of the ruler, with the ruler itself drawn under it (`VECTOR.verdicts`). The arcade line (+1 PLASMA · SPEED UP, SHIELD USED · 2 LEFT, the
  MAXIMUM THRUST overlay) is the second line or the celebration, never the
  thing that explains what happened.
- **One fact per line.** A verdict lists the correct answer, the guess, the
  bonus and the streak on separate lines. Chaining them with middle dots
  reads as an equation to a first-time player.
- **Prefer the everyday word.** Questions, not encounters. Topic, not sector.
  Correct and wrong, not clear and struck. Runs played, not flights logged.
  Not played yet, not NOT FLOWN. A phase name says what the player does in
  it, in words they already own.
- **The test.** Read the line aloud to someone who has not played. If they
  ask what a word means, the word is wrong or the definition is missing.

## Design language

Arcade cabinet meets editorial. Structure and type carry emphasis; colour is
signal, never decoration. Tokens live in `app/globals.css` and are mirrored
for three.js in `COLOR` inside `lib/game/Tuning.ts`. Keep them in sync.

- Background and fog: `--space` `#071122`. Panels: near-black at about 86%
  alpha with hairline borders (`--rule-dark`), 4px radius, a light
  backdrop blur, no drop shadows except glows.
- Signal colours: yellow `#ffe03d` (score, slingshot), cyan `#4ff1ff`
  (streak, lane clear, NOVA, plasma pods), orange `#ff8a1f` (Boost, BURN),
  violet `#b28cff` (contact: the alien scout and Wikiplanet Station, and
  nothing else), red `#ff6b5c` for damage and boulders. Each colour means
  one thing. Do not reuse violet for anything that is not contact, or cyan
  for a warning.
- Type: Press Start 2P (`.arcade`, always uppercase, tracked) for titles,
  figures, buttons and outcome labels. The sans stack for prompts and
  prose. The mono stack for units.
- Buttons are square-cornered. Active state inverts to yellow on ink. The
  one round button is the Cluster's FIRE dial in the bottom right corner,
  and it is round because it is a cabinet push button, not a panel tool: a
  metal bezel, a domed cap raised on a hard skirt, and a real travel on
  `:active`. Nothing else gets that treatment.
- Copy is short, loud, present tense, in the game's voice: LANE CLEAR,
  SLINGSHOT!, WRECKED, TOO SLOW, FULL BURN!, PLASMA COLLECTED. No em
  dashes anywhere in UI copy or share text; use a middle dot, comma or
  full stop.

## Sound

All of it is synthesised at runtime in `lib/game/Audio.ts`. No audio file
ships, and every level, length and frequency is a constant in `AUDIO` inside
`Tuning.ts` like the rest of the feel. Sound is off-limits to the rest of the
codebase: the engine calls cues, nothing else makes a noise.

- **Layers, not waveforms.** A crash is a crack, a mass, the hull ringing on
  inharmonic partials and debris scattering, each with its own envelope. One
  oscillator per event is what makes a game sound cheap. A new cue gets the
  same treatment or it does not go in.
- **Space and glue.** One convolution reverb, fed by a send from every cue,
  and a limiter across the master. Dry one-shots sound like a browser making
  beeps however well they are synthesised. Impacts also duck the music and
  engine for about half a second so they land in a hole of their own.
- **Movement.** Anything passing the ship sweeps its filter up and back down
  and crosses the stereo field with it, so it reads as a thing going by.
- **The bed rides the flight.** The engine drone, the rushing-air noise and
  the music tempo all track the same 0..1 speed ratio the FOV and the
  streaks use, so the ship sounds as fast as it looks.
- **Music and engine are partners.** The drone is wide-band noise and will
  swamp a melody at anything like equal gain, so it sits well under the
  music bus. The loop's parts are pitched an octave or two above where the
  theory wants them, because a phone speaker reproduces almost nothing below
  about 400Hz: a bass at 55Hz is a bass nobody hears. Check a mix change by
  muting one bus and measuring the other, not by ear on a laptop.
- **The ending turns the music.** `ending(sites)` switches the loop to the
  `victory` mood (C major, I IV V I, a march) under a bugle call landing on
  the finale's chord, or to `invasion` (E and F grinding a semitone apart,
  slow and heavy) under the scout's arrival, a clashing brass stab and an
  air-raid siren. The loop keeps going under the tally.
- **The finale scales with the run.** `finish(tier)`, fired as the tally
  opens after the ending (`Engine.finale`), is a riser timed to
  `FINALE.introMs`, an impact as the tally slams RUN COMPLETE in, and a chord
  that grows with the tier (`finaleTier` in `Score.ts`). The tally then plays
  its own read-out through `Engine.tallyCue`: a note per line climbing a
  scale, a chord per stage subtotal, ticks under the running total, and
  `tallyTotal(tier)` on the stamp. The sound and the tally screen read the
  same tier, so they cannot disagree about how the run went.
- **Tapping a lane is silent.** The verdict riding in is the sound of a
  choice. A click on top of it was noise, and it is not coming back.
- **Never load-bearing.** Browsers hold the context suspended until a
  gesture, some devices have no output and `AudioContext` can throw. Every
  entry point is a no-op without a context, and a run plays out in silence
  rather than failing. The SOUND toggle lives in the top band and the choice
  is remembered in localStorage.
- **Auditioning.** `?debug=1` puts the audio engine on `window.galaxiaAudio`,
  so a cue can be fired from the console while tuning it.

## Architecture in one screen

```
app/                  routes: / (title), /play, /hangar (ship bay), layout, globals.css
components/           GameCanvas (React/three.js boundary), Hud, ScoreTally, ShareCard,
                      BestRun, Briefing (first-flight explainer), Hangar (ship bay),
                      Station (aboard Wikiplanet Station), TitleMenu, DebugStats
lib/game/Run.ts       pure state machine: intro -> approach -> collecting -> resolving -> aftermath,
                      then station -> docked -> finished for WHERE ON EARTH
lib/game/Flight.ts    pure velocity model: cruise, streak floor, impulse, collision retain
lib/game/Score.ts     pure scoring: base per encounter, streak multiplier, penalties, tally
lib/game/Engine.ts    three.js shell; subscribes to Run via RunHooks, owns the canvas and loop
lib/game/ShipBay.ts   the hangar's own tiny shell: one hull on a lit pad, and the drag
lib/game/bayTextures.ts  the bay's concrete, plating and markings, drawn into canvases
lib/game/Station.ts   the station on the flight: comes up dead ahead, arms the door
lib/game/Orbit.ts     the station screen's own tiny shell: the station over Earth,
                      and the run's ending (`reinforce`: the pull back, Earth turned to land)
lib/game/Fleet.ts     the ending's fleet, ours or theirs: instanced hulls, trails, lights, beams
lib/game/ships.ts     the hangar's rules: what is unlocked, what is selected, what is bought
lib/game/Tuning.ts    every constant that decides how the game feels (FLIGHT, ENCOUNTER,
                      CLUSTER, LANE, SHIELDS, NOVA, FX, CAMERA, SHIP, SHIPS, HANGAR, ...)
lib/game/Incoming.ts  the one pod or boulder that comes down a picked lane
lib/game/Audio.ts     all sound, synthesised: engine bed, music loop, one-shot cues
lib/game/*            Ship, EncounterAsteroid, Debris, Shield, Exhaust, Camera, Backdrop,
                      AsteroidField, Starfield, quality, nova, share (card + text),
                      storage (localStorage), gltf (GLB loader + merge), format, types,
                      feed (tile maths + photo addresses), prefetch (feed imagery), md5
lib/content/round.ts  round loader with build-time validation
lib/content/difficulty.ts  how hard a question may be; read by the loader and the audit
content/rounds/       one JSON per daily round: 2 cluster + 2 vector + 2 mcq + 2 earth
e2e/run.spec.ts       Playwright: flies a whole run on a Pixel 7 profile
e2e/audio.spec.ts     Playwright: taps the master output and asserts on the signal
e2e/onboarding.spec.ts  Playwright: the briefing and the ship bay, unlocks included
e2e/practice.spec.ts  Playwright: the ?shuffle= hatch, and that it records nothing
scripts/ship-stills.mjs  renders public/ships/*.png off the /hangar?shot= hatch
public/ships/         one still per hull, drawn on the results card
```

Rules that fall out of this:

- **Pure core, imperative shell.** `Run.ts`, `Flight.ts` and `Score.ts` import
  neither three.js nor React. Game rules go there so they can be stepped with a
  fake clock. Visuals go in `Engine.ts` and the scene modules. The HUD is
  a view of `GameState` plus method calls on the engine (`answer`, `pick`,
  `burn`, `toggleBoost`, `useNova`, `enterStation`, `endTransmission`, `confirm`,
  `setLaneFractions`).
- **Every answer is a lane.** MCQ and Cluster both go through the same
  pick -> veer -> incoming -> verdict flow, so the run reads one way. The
  camera stops tracking laterally for `LANE.lockSeconds` after a pick so
  the ship actually arrives under the tapped square.
- **React owns the DOM, three.js owns the canvas.** The engine creates its
  own canvas inside a container div. Never hand it a React-rendered canvas
  (StrictMode remount plus `forceContextLoss()` poisons it).
- **Treadmill world.** The ship never moves on Z. The world is translated
  past it, geometry is recycled from fixed pools, and distance is a scalar
  the run owns. Do not move the ship or camera forward.
- **No magic numbers outside `Tuning.ts`.** If a change alters feel
  (timers, speeds, offsets, shake, colours, counts), it is a change to
  `Tuning.ts` and nothing else. Read the doc comments there before tuning.
- **`GameState` stays flat and primitive.** It is emitted every frame and
  sampled at 12Hz; do not put objects with identity or methods in it. A
  one-shot `Pulse` carries a fresh `id` each time so the HUD can replay
  the animation.
- **The station is a screen, not an engine mode.** WHERE ON EARTH's dock
  hands the display to `components/Station.tsx`, which has its own tiny
  shell (`Orbit.ts`) like the hangar does. The flight engine parks under it
  and never draws again that run; it keeps the sound bed going and nothing
  else. The run's last state is `finished`, not `docked`, so `GameCanvas`
  remembers the run was aboard and keeps the station up for the ending, the
  tally and the share card. Docking hands over to the feed:
  two sites, drawn from `lib/content/sites.ts` and played through
  `Run.feedArrived`, `buyIntel`, `setOptics`, `submitSite` and `nextSite`.
  Arrival on the approach is a timer (`STATION.approachSeconds`), never an
  asset: the door arms on the same beat whether or not the model has loaded,
  and by the same rule the answer clock does not start until the imagery has
  settled or `STATION.feedGraceMs` has passed. Never gate the clock on a
  ground photograph, only on the tiles. It waits on Sergeant Soap as well: the
  panel opens on his standing order and nothing else, typed in the way his
  transmissions are, and the feed comes up `STATION.hailHoldSeconds` after the
  last word or on a tap. `Station.tsx` holds `feedArrived` back until then,
  which is the whole of that mechanism; the feed is mounted and merely hidden
  underneath, so the tiles settle while he talks. Nobody is timed on reading,
  here or on a cluster's read screen.
- **The verdict aboard is a radio call.** A site is named on a screen with no
  lane and no hull, so nothing reaches `onLock` or `onContact` and the flight's
  contact cues would be describing something that never happened. `submitSite`
  announces itself through `onSiteCalled` and the engine answers it with
  `audio.site()`: keyed up both times, then confirmed or refused. It shipped
  silent once, and a verdict with no sound on it read as a dropped tap.
- **What a site scored is said in the middle of the screen.** CORRECT and the
  figure, big, over everything, for `STATION.verdictSeconds` and then gone on
  its own (`SiteVerdict` in `Station.tsx`). The panel says the verdict too, but
  it says it at the foot of a scroll region under a photograph and five bought
  hints, and a tester read the answer there without ever seeing what it was
  worth. The pop is the one place the figure appears: the panel's line under
  the answer carries what was SPENT (hints; zooming is free) and no points at all. It
  takes no tap and blocks none, because NEXT PLACE is underneath it.
- **The feed's imagery is fetched at launch, not on the tap.** A hint is
  bought and a zoom step taken against a running clock, and a photograph
  asked for on the tap took three seconds to arrive (Commons'
  `Special:FilePath` answers with two uncacheable redirects before the
  picture) while a zoom step waited on nine fresh tiles. `lib/game/prefetch.ts`
  fetches both sites' photographs and their 3x3 mosaics at every step of the
  zoom dial into blobs when the run launches (`preloadFeed`, from
  `GameCanvas`), and the view mounts on the blob (`groundUrl`, `warmUrl`).
  It can fetch them because both sources are one CORS-readable hop: the tile
  server, and `thumbUrl` in `feed.ts`, which builds the thumbnail's own
  address on upload.wikimedia.org the way a Wikipedia article embeds it;
  that needs an MD5 of the filename (`lib/game/md5.ts`) and a width from
  Wikimedia's fixed list (`STATION.groundWidth`, 640 is refused). The
  figure falls back to the direct address and then the slow road on error,
  so a file renamed on Commons still loads; a tile that was not warmed loads
  from the network as before. The optic and the prefetch share
  `tilesAround` and `opticZoom` so they cannot disagree about which tiles a
  zoom needs. The e2e asserts the mounted photos and tiles are blobs.
- **Storage is best effort.** localStorage can be missing or full; every
  read and write is wrapped and a failure must never break play.

## The briefing and the ship bay

Two screens wrap the run, plus the rulebook. Neither is part of it, and neither may slow the
path from a shared link to flying.

- **Rules arrive a phase at a time.** Each day's first run opens on the **mission
  transmission** (a Mayday from Earth Command, `components/Transmission.tsx`,
  remembered by date in `galaxia:mayday`) and then the launch card, and
  nothing else: no rulebook up front. The ship is already flying behind both:
  the engine mounts in standby (`Run.standby`, nothing stepped, no clock, no
  distance), the Mayday drops in as a banner across the top band, and READY
  launches the run on the live engine rather than mounting one. It used to play once per device, ever,
  which testers read as Sergeant Soap sometimes turning up and sometimes not. Six pages
  of rules before the first question was what testers called too much text.
  Each phase explains itself on its own card just before it is played, in
  the two or three lines you would text your mum (`rules` in
  `lib/game/phases.ts`). Every run just flown ends on the **ending**, before
  the tally (`endingFor`): the station screen pulls back to Earth and the
  fleet the landing sites bought flies in, with Sergeant Soap as a banner
  over it. Both sites named sends the armada ("You saved Earth today"), one
  sends a squadron, none lets sixteen dark alien scouts in, a few of them
  firing red beams at the surface, and Soap calls that one in as a Mayday.
  The music turns with it (`victory` or `invasion`, see Sound). A tap
  anywhere skips it, and so does SKIP on the banner while Soap is still
  talking: it is a moment, not a wait. The tally follows, then the share
  card. `?replay=1` skips the Mayday along with today's stored run.
- **Every phase is shown, not told.** The launch card and each waypoint card
  play their phase as a worked example (`PhaseDemo`, scripted as `demo` on
  the phase in `phases.ts`, timed by `DEMO` in `Tuning.ts`): a sample
  question, a finger tapping through it, and one caption per step. Each step
  types its caption in first, fast, and only then moves the finger, so the
  eye goes to the words and is led from them to the action; a caption sitting
  still beside a moving finger read as too quick to read and too slow to
  watch. It is a picture with no pointer events; the rules stay on the card
  as screen reader text. The waypoint card is taller for it and reaches the
  middle of the screen, so the e2e taps the card itself to move on.
- **Every phase card carries the rest, shut.** The launch card and the
  waypoint card both read `phaseGuide(type, round)` and render
  `ScoringDisclosure`: a MORE DETAIL button, collapsed by default, that opens
  the phase's finer print (`details`: clock, shields, hints, what a wrong
  answer really costs) and its scoring table, in a box that scrolls inside
  itself so the band cannot grow over the ship. The button swallows its tap
  so opening it never advances the run. Keep `rules` short; anything a
  first-time player does not need to play the phase belongs in `details`.
- **HOW TO PLAY** on the title screen (`components/Briefing.tsx`) is the whole
  rulebook end to end: a welcome page with the phases and what each is worth,
  then one page per phase with its rules, details and table. Plain words, no
  flight-model figures. Every figure comes through `phases.ts` from
  `Tuning.ts` and every count from the round, so retuning cannot leave it
  lying: add a number to it the same way.
- **The ship bay** (`/hangar`) is a launch bay inside the carrier the run
  deploys from: a concrete pad, plated walls, floodlit ceiling, and the bay
  door open onto the game's own sky. One hull stands on the pad, turning.
  `SHIPS` in `Tuning.ts` is the whole catalogue: name, blurb, model, scale,
  yaw, nozzles and how it unlocks (`default`, `runs`, or `purchase`).
  Adding a hull is one entry there, a GLB in `public/models`, and a still in
  `public/ships`.
- **The hull's still is rendered, not drawn.** The results card shows the ship
  that flew the run, and a 2D canvas on a phone cannot stand up a second WebGL
  context to photograph one. `/hangar?shot=<shipId>` is the hatch: the bay
  with the room, the overlay and the turntable's motion taken away, the hull
  parked at `HANGAR.shotYaw` on a transparent clear, lit by the bay's own rig
  so the still and the bay agree. `npm run ship-stills` drives it over the
  whole catalogue and writes `public/ships/<id>.png`, cropped to the hull.
  Run it after adding a hull and commit the PNG; never run it in a build.
- **The bay is full bleed and the text floats over it.** The canvas is pinned
  to the viewport and the name, price and buttons sit on a scrim over the
  bottom. That is not only a look: as a flex sibling of the text the canvas
  took whatever height the text left, so a hull with a longer name resized it
  and re-framed the camera mid-switch. Do not put the canvas back in the flow.
  React measures the overlay and hands the bay `setSafeArea`, which frames the
  hull into the clear band rather than the raw canvas.
- **The bay renders sharper than the flight, on purpose.** Its pixel ratio is
  `HANGAR.dprCap` against the device, not `dprForTier`, and antialiasing is
  always on. The tier decides detail COUNTS (ribs, floodlights, texture size)
  and nothing else. A hull the player is being asked to buy cannot be the
  blurriest thing in the game. It costs about eighteen draw calls.
- **Light it neutral.** The key and fill are white, the ambient hemisphere is
  a cool grey and the cyan rim is a trace. The rig before it had a saturated
  blue hemisphere ground and a strong cyan rim, which turned every pale panel
  pink. If a hull looks wrong, check the rig before blaming the model.
- **Surfaces are painted, not shipped.** `lib/game/bayTextures.ts` draws the
  concrete, the deck markings, the wall plating and the fake contact shadow
  into canvases at load, in the style `share.ts` draws the share card. Every
  colour map there must set `SRGBColorSpace` or it renders washed out.
- **Drag turns the hull**, and the slow revolution eases back in a beat after
  the thumb lifts. A hull is stood on the pad by its own underside, never by
  its bounding centre: the Seraph's centre is dragged up by a spire and the
  Cinder's sits mid-fuselage. It is measured on a rig of its own before it
  goes on the turntable; measured in place, the box is in world space and
  carries the last hull's height and the bob, and every page sank the hull.
- **The camera is a fixture of the room.** It frames `HANGAR.frameRadius`
  and aims at `HANGAR.aimY` over the pad, whatever hull is up, so paging the
  catalogue changes the ship and nothing else. A hull larger than the
  constant still fits; read `debugState().hullRadius` when adding one.
- **A hull is cosmetic, always.** Every ship has the same flight model. The
  daily round has to stay comparable between two players, so a ship must
  never touch speed, thrust, shields or scoring.
- **Unlocks are counted, not derived.** `galaxia:flown` counts runs actually
  completed, one per date, so the escape hatch cannot farm an unlock and
  clearing today's run cannot undo one.
- **A selection never blocks a run.** It is a string in localStorage, so it
  can name a hull that is gone or was never unlocked; `selectedShip()` falls
  back to standard issue rather than failing to fly.
- **The limited edition has no provider behind it yet.** `purchaseShip()` in
  `ships.ts` records the entitlement locally and is the seam: a real
  checkout takes the money server-side, stores the entitlement against an
  account, and has that function read it instead. Until then the bay says so
  in as many words, and the hull is honour-system on the device.
- **A many-part GLB is merged on load.** `gltf.ts` collapses an untextured
  model of more than `PERF.mergeMeshesAbove` meshes into one, baking each
  part's colour into vertices. The limited edition hull is 65 parts, which
  unmerged is 65 of the scene's 60 draw calls.

## Commands

```bash
npm run dev            # http://localhost:3000
npm run dev -- -H 0.0.0.0   # then open http://<lan-ip>:3000 on a phone
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (flat config, next core-web-vitals + typescript)
npm run build          # production build; a malformed round fails here
npm run test:e2e       # playwright, builds and serves on :3100, SwiftShader WebGL
npm run audit:rounds   # the pool's difficulty, vector geometry and lane spread
npm run ship-stills    # re-render public/ships/*.png; needs a built app on :3100
```

Run typecheck and lint before committing. Run the e2e test after any change
to `Run.ts`, `Flight.ts`, the HUD, or a round file; it asserts flow and
state (every outcome kind, shields, pulses, the share card, persistence),
never performance. `/play?replay=1` skips today's stored run and
`?round=YYYY-MM-DD` flies any round in the pool. `/play?shuffle=<seed>` flies
a practice round built from the whole pool, reachable from `/profile?debug=1`
and recorded nowhere; the seed is on the URL rather than made up server side
so the same round can be opened twice and reported against. `/dev` is the
simulation mode, linked from the same page: the coming days' real rounds,
each flown ahead of its date through `/play?round=YYYY-MM-DD&sim=1`, recorded
nowhere like practice. A NOTES tab on the left edge pauses the engine
(`Engine.pause`, clock included) and opens a flag and a note per question,
kept in localStorage under `galaxia:sim:<date>` and sent on as a prefilled
GitHub issue or copied text (`lib/game/simFeedback.ts`). `?debug=1`
overlays FPS, draw calls, triangles, tier, bloom and DPR on the flight, and
with it `?tier=0|1|2` pins the quality tier and stops it stepping down: a
headless browser detects as a low-end phone, and bloom cannot be looked at
otherwise. On `/hangar` it puts the bay on `window.galaxiaBay` so its angle and draw count can
be read from the console or a test. `/hangar?shot=<shipId>` is the stills
hatch, above.

## Performance budget (mobile)

- Zero allocation in the frame loop. Scratch vectors are module-level.
- `InstancedMesh` for anything above about 20 copies.
- `MeshLambertMaterial`, flat shading. No PBR, no shadows. The one
  post-process is bloom (`lib/game/Post.ts`): on the high and mid tiers only
  (`BLOOM.enabled`), at half resolution, with a threshold high enough that
  only additive light blooms. The governor stepping down to low drops it on
  the spot, and it is sampled every frame, not only under `?debug=1` (it used
  to be, so no player's tier ever stepped down). With bloom on, `drawCalls`
  is the scene's own count, read before the blur passes.
- DPR capped by tier (2 / 1.5 / 1), never raw `devicePixelRatio`.
- Under 60 draw calls and 60k triangles. Check with `?debug=1`.
- Explosions (`Explosion.ts`) are one shader-driven particle cloud for every
  puff and ember of every blast, plus one `PointLight` created at zero with
  the scene, so the lit materials compile with it and nothing hitches when a
  blast throws its light on the rocks. Never add a light mid-run.
- Hit-stop and bullet time scale the visual clock only (`FX.time`, and
  `visualDelta` in `Engine.ts`). `run.update` and the sound always step on
  real time, so the answer clock, the score and the distance never feel them.
- Glow is one shared halo texture (`lib/game/glow.ts`) on additive sprites:
  the nozzles, the plasma pod, beam hits, the scout's violet running lights,
  the impact shockwave (`Shockwave.ts`) and the comet heads. Its sibling is
  the anamorphic flare (`flareMaterial`) on the nozzles and the pod. Reach for it
  before inventing another glow; it is the whole of the bloom budget.
- The sky's set dressing (`Comets.ts`, `Dust.ts`, `FlyBy.ts`) draws from its own seeded
  stream so it never reshuffles the shared field. Comets and fly-by rocks start only in `intro`,
  `waypoint` and `aftermath`, never while a question or its verdict is up,
  and `e2e/sky.spec.ts` holds them to it (`window.galaxiaSky` under `?debug=1`).
- Quality tier comes from device hints and downgrades automatically when
  frame time misses 20ms for a sustained window. Any new scene element must
  take its count from a per-tier array in `Tuning.ts`.

## Authoring a round

`content/rounds/YYYY-MM-DD.json`, eight questions in order: two `cluster`,
two `vector`, two `mcq`, two `earth`, in four stages (Cluster Belt, Alien
Contact, Open Sky, Where on Earth). The loader validates cluster, vector and
earth shape at import. Stages carry an optional `phase` number for the card
to announce, so a round can skip a number if it has to.

**`content/AUTHORING.md` is the rubric, and it is the thing to read before
writing a question.** How hard a question is allowed to be used to be nobody's
job, and the pool drifted to the point where "which of these are made from
milk" and "which of these are dwarf planets" were worth the same. Every quiz
question now declares a `difficulty` of 1, 2 or 3, every authored day is held
to one profile, and `npm run audit:rounds` prints the whole pool's spread. The
short version is below; the reasoning is in that file.

- Every quiz question carries a `topic` (see the corners below) as well as
  the fields its type needs. The JSON is never type-checked, so `validate` is
  the only thing that catches a missing or invented one.
- Cluster: exactly six `options`, exactly three distinct `answers`
  (indices), a `fact`. All three right lanes must be unarguably right and
  all three wrong lanes unarguably wrong; one debatable lane ruins the
  encounter.
- MCQ: four `options`, one `answer` index, optional `hint` (what a NOVA
  clue reveals), a `fact`.
- Vector: a numeric `answer`, `min` and `max` for the ruler, optional `unit`,
  `year` (prints 1913, never 1,913) and `route`, a `fact`. Nothing about
  closeness is authored: every question is scored on the same 100-step ruler.
- **A range is the band of believable answers, in round numbers.** Usually
  from 0: a CD on 0 to 200 mm, a waterfall on 0 to 2,000 m. The build checks
  two things (`lib/content/difficulty.ts`): each step is a round number (1, 2,
  2.5 or 5 times a power of ten), so the ruler never reads 5.88; and the
  answer sits between step 10 and 90, so a guess in the middle is never a
  wild shot. Where the answer sits is how forgiving it is: from 0, doubling
  the answer lands as many steps off as the answer's own position. A year
  ruler stops at the present. Small counts do not fit (6.3 strings); ask
  something with an answer of 25 or more.
- **A route beats a fact.** A `route` is one line of working that gets
  someone close without knowing the answer ("60 x 24 x 7 = 10,080"), and the
  reveal shows it in place of the fact. Recall is allowed, because a rough
  idea scores well, but a route is better.
- **The audience is the whole world.** No question or route may lean on one
  country: its sport, stadium, law, census or school syllabus. Units are
  metric and named in the prompt, and a question whose best-known figure is in
  another unit (the Moon in miles) is out.
- **Every quiz question declares a `difficulty`**, 1 to 3, and an authored day
  sums to 11..13 with at most two of each extreme and never a 3 in the opening
  slot. Like `topic` it is authoring metadata: never rendered, never scored,
  never in `GameState`. A cluster's difficulty is in its decoys, not its
  category, which is why the number cannot be derived and has to be declared.
- Earth: the slot in the round file carries only `id`, `type` and `prompt`.
  The site itself comes from `lib/content/sites.ts`, seeded on the round's own
  date, so two sites a day are drawn without anyone authoring them and every
  player on that date gets the same pair. No site comes round again within
  `DAILY.siteGapDays` of itself (from `DAILY.siteGapFrom` on): a blind draw
  that would repeat is redrawn from the sites still fresh, and any other day
  keeps the pair it always had. Adding a site is one entry there:
  `lat`, `lon`, a slippy-map `zoom` that frames the giveaway, an `opener`, a
  `clue`, a landmark, two Commons photographs, decoys, `accept` and a `fact`.
  **Every rung must carry something the one before it did not.** The rungs are
  bought with points, and an intel line that restates the free opener is a line
  the player paid for and learned nothing from; it shipped that way once and
  read as a bug. A site is a city unless it declares a `kind` (`landmark`,
  `island`): the answer box says "Name the city, not the country" off that
  field, and a guess that is only a country (`lib/game/countries.ts`) is sent
  back with a word rather than marked wrong. A tester typed "Morocco" for
  Marrakesh and lost the site before either existed. `sites.ts` now throws at import if a clue repeats a
  distinctive word of its opener, which matters most when this prose is
  generated rather than written. A Commons filename is never rendered: it
  usually names the answer.
- **Every day is mixed general knowledge, never a themed round.** Every quiz
  question carries a `topic`, one of nine corners: `geography`, `history`,
  `science` (and technology), `nature` (animals and the natural world), `food`
  (and drink), `sport`, `screen` (film, television and music), `arts` (art and
  literature), and `misc`. A round may take no more than two from any one
  corner, placed apart in the run, and the build fails if it does. A day of
  all-geography reads as a specialist's quiz and drives off everyone else.
  Space is not a corner. It lives in `misc` with mythology, language,
  transport, money and the other fringes, because a corner of its own had a
  seventh of the pool asking about planets.
  The tag is authoring metadata and is never rendered, never scored and never
  put in `GameState`. `theme` stays "General knowledge" for every round; it is
  the sector label on the title screen and the share card, not a subject.
- **No two questions in the pool may ask the same thing.** Checked across the
  whole pool at import, not per round, because a duplicate is only visible
  with every round in hand. Eight pairs shipped before the check existed, and
  with the pool drawn two at a time they came round fast enough that the game
  felt like it had a dozen questions. Rewording is not a fix: the check
  normalises hard, and a question that survives it but asks the same thing in
  other words is still a duplicate.
- **Spread the correct lane.** Twelve questions written in one sitting all put
  the answer in the first square, and twenty-seven of thirty-four clusters used
  lanes 1, 3 and 5. A player who notices that stops reading the question. The
  pool is levelled by hand when it drifts; check the spread after adding a
  batch rather than trusting the order a question was written in.
- Options are read in five seconds inside a square one sixth of the screen
  wide. Keep them to one or two short words. Prompts must fit two lines at
  14px on a 360px phone without pushing the lane row down.
- Rounds roll over on one clock for the whole world: midnight in Melbourne,
  daylight saving included (`DAILY` in `Tuning.ts`, worked out in
  `lib/content/clock.ts`). Everyone is on the same round at the same moment,
  which is what makes a group chat across time zones comparable, and the
  server and the title screen's NEXT RUN IN countdown read the same clock.
  It used to be the host's own midnight, which on a server is UTC. The
  authored rounds form a pool: a date with its own file gets it, any other
  date rotates through the pool by day number, so every day is a round and a
  shared link never lands on a blank screen. `?round=YYYY-MM-DD` on `/` or
  `/play` flies a specific one; it is a QA hatch like `?replay=1`.
- **A practice round is drawn from the pool, not authored.**
  `getShuffledRound(seed)` takes two clusters, two numbers and two lanes from
  every round there is, plus a pair of sites seeded on the same string, and
  runs the result through the same `validate`, minus the corner cap: the draw
  spreads corners as it goes and in practice never lands three of a kind, but
  it is a preference, not a promise, and a hatch nobody but a tester sees is
  not worth failing a build over. `seededShuffle` is the other half of this.
  It used to step a plain LCG and read `hash % (i + 1)`, which is the low bits,
  and an LCG's low bits barely move: the first question of a thirty-four
  question pool never once came out in a draw of two. That, not the size of
  the pool, is what made practice runs feel like the same eight questions
  forever. If a draw ever looks lopsided again, check the stream before
  blaming the content. The practice button deals from a deck rather than
  drawing blind: its seed is `<deck>.<n>`, the deck made up once per device
  and the counter moved on one deal per run (`nextPracticeDeal` in
  `storage.ts`, `galaxia:practice`), and `dealFromDeck` replays deals 0..n so
  no question comes round again until its whole kind has been dealt. A blind
  draw of two a kind repeats within a handful of runs whatever the pool size,
  and testers read that as a small pool. Any other seed is still a one-off
  draw, so `?shuffle=alpha` rebuilds exactly as before.

## Analytics

Vercel Web Analytics, cookieless: `<Analytics />` in the layout counts page
views, and `lib/analytics.ts` sends three events a page view cannot see
(Run started, Run finished, Shared). Practice runs send nothing. Like sound
and storage it is never load-bearing. Add an event there, typed, rather than
calling `track` from a component.

## Deliberately not done

Haptics, group leaderboards, server-side persistence, and accounts.
Recorded audio is also out: sound is synthesised,
and a sample library is not the way back in. Do not add these in passing. If one is asked
for, `lib/content/round.ts` and `lib/game/storage.ts` are the seams that
change; the engine and HUD should not.
