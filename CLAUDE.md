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
  questions until they are memorised. Do not put it on a player's path.
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
  boosted answer is the one lane that docks points), and a Vector is scored on bands
  that are fractions of the true answer (`VECTOR.bands`), never on anything
  authored per question, and never narrower than the whole units of
  `VECTOR.minBands`, because 5% of 6 strings is a third of a string and being
  one out is not a wild shot. Inside the widest band a shot is a `graze`: no
  points, no damage, streak untouched. Past it the dock scales with how wrong
  the shot was, so the flat 25 is what a wild shot costs and a near one costs
  a fraction of it.
- **The player says when to move on.** Nothing advances on a timer once a
  verdict is up. The outcome toast and the waypoint card carry the right
  answer and a fact, and they sit there until the screen is tapped. Only the
  answer itself is timed.
- **Tension, then release.** The clock is five seconds per pick, drawn as
  thrust draining and a countdown, and it refills for every decision. A
  cluster opens on its question alone (`reading` phase): no lanes, a ten
  second read clock and a READY! button, so nobody is timed on reading. Its
  first pick then gets two seconds more for the six options. Each cluster
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
  braggable or more legible in a group chat is on-mission.
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
  run draws below the band. Both hug `env(safe-area-inset-*)`. Do not read
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
  is short and truncation is handled, never overflow.
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
  hint, optics is zoom, a graze is a near miss, a wild shot is way off, an
  encounter is a question, a sector is a topic.
- **Every score figure says POINTS.** The run also counts speed and
  distance, so a bare +100 could be either. The toast, the tally and every
  scoring table row spell it out; the one abbreviation allowed is PTS on a
  chip too small for the word (the zoom cost, the FIRE dial).
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
  pulse is CORRECT, WRONG, TOO SLOW, NEAR MISS, WAY OFF, SPOT ON or ALL 3
  FOUND. The arcade line (+1 PLASMA · SPEED UP, SHIELD USED · 2 LEFT, the
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
lib/game/Orbit.ts     the station screen's own tiny shell: the station over Earth
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
  else. Docking records a neutral `dock` outcome and hands over to the feed:
  two sites, drawn from `lib/content/sites.ts` and played through
  `Run.feedArrived`, `buyIntel`, `setOptics`, `submitSite` and `nextSite`.
  Arrival on the approach is a timer (`STATION.approachSeconds`), never an
  asset: the door arms on the same beat whether or not the model has loaded,
  and by the same rule the answer clock does not start until the imagery has
  settled or `STATION.feedGraceMs` has passed. Never gate the clock on a
  ground photograph, only on the tiles.
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

Two screens wrap the run. Neither is part of it, and neither may slow the
path from a shared link to flying.

- **The briefing** is the rules and the scoring system, shown once, before
  the first round, when the flight log is empty and it has never been read.
  A welcome page with the phases and what each is worth, one page per phase
  with its scoring table, and the kit. Plain words, a 12 year old's reading
  level, no flight-model figures. The shell holds the engine back until it
  closes, so a new player is never reading a rule against a draining clock.
  Every figure in its copy comes through `lib/game/phases.ts` from
  `Tuning.ts` and every count from the round, so retuning cannot leave it
  lying: add a number to it the same way. `?replay=1` skips it along with
  today's stored run, and the title screen can call it up again. When it
  closes on a first flight, the **mission transmission** (a Mayday from Earth
  Command, `components/Transmission.tsx`) plays before the launch card; a run
  that names every landing site gets a debrief from the same voice after the
  tally, before the share card.
- **Every phase card carries its scoring, shut.** The launch card and the
  waypoint card both read `phaseGuide()` and render `ScoringDisclosure`: a
  HOW SCORING WORKS button, collapsed by default, that opens the same table
  the briefing showed. The button swallows its tap so opening it never
  advances the run.
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
npm run ship-stills    # re-render public/ships/*.png; needs a built app on :3100
```

Run typecheck and lint before committing. Run the e2e test after any change
to `Run.ts`, `Flight.ts`, the HUD, or a round file; it asserts flow and
state (every outcome kind, shields, pulses, the share card, persistence),
never performance. `/play?replay=1` skips today's stored run and
`?round=YYYY-MM-DD` flies any round in the pool. `/play?shuffle=<seed>` flies
a practice round built from the whole pool, reachable from `/profile?debug=1`
and recorded nowhere; the seed is on the URL rather than made up server side
so the same round can be opened twice and reported against. `?debug=1`
overlays FPS, draw calls, triangles, tier and DPR on the flight, and on
`/hangar` puts the bay on `window.galaxiaBay` so its angle and draw count can
be read from the console or a test. `/hangar?shot=<shipId>` is the stills
hatch, above.

## Performance budget (mobile)

- Zero allocation in the frame loop. Scratch vectors are module-level.
- `InstancedMesh` for anything above about 20 copies.
- `MeshLambertMaterial`, flat shading. No PBR, no shadows, no
  post-processing. Glow is faked additively.
- DPR capped by tier (2 / 1.5 / 1), never raw `devicePixelRatio`.
- Under 60 draw calls and 60k triangles. Check with `?debug=1`.
- Quality tier comes from device hints and downgrades automatically when
  frame time misses 20ms for a sustained window. Any new scene element must
  take its count from a per-tier array in `Tuning.ts`.

## Authoring a round

`content/rounds/YYYY-MM-DD.json`, eight questions in order: two `cluster`,
two `vector`, two `mcq`, two `earth`, in four stages (Cluster Belt, Alien
Contact, Open Sky, Where on Earth). The loader validates cluster, vector and
earth shape at import. Stages carry an optional `phase` number for the card
to announce, so a round can skip a number if it has to.

- Cluster: exactly six `options`, exactly three distinct `answers`
  (indices), a `fact`. All three right lanes must be unarguably right and
  all three wrong lanes unarguably wrong; one debatable lane ruins the
  encounter.
- MCQ: four `options`, one `answer` index, optional `hint` (what a NOVA
  clue reveals), a `fact`.
- Vector: a numeric `answer` (never zero), `min` and `max` for the slider,
  optional `unit` and `log`, a `fact`. Nothing about closeness is authored:
  the bands are fractions of the answer and live in `VECTOR.bands`, floored
  to the whole units of `VECTOR.minBands` so a small count is not scored on
  thirds of a string. Whole ends no further apart than `VECTOR.snapMaxSpan`
  make the slider aim in whole units, so the number on screen is the number
  scored; keep the ends whole for a counting question, and leave them wide or
  fractional where the answer is a measurement.
- Earth: the slot in the round file carries only `id`, `type` and `prompt`.
  The site itself comes from `lib/content/sites.ts`, seeded on the round's own
  date, so two sites a day are drawn without anyone authoring them and every
  player on that date gets the same pair. Adding a site is one entry there:
  `lat`, `lon`, a slippy-map `zoom` that frames the giveaway, an `opener`, a
  `clue`, a landmark, two Commons photographs, decoys, `accept` and a `fact`.
  **Every rung must carry something the one before it did not.** The rungs are
  bought with points, and an intel line that restates the free opener is a line
  the player paid for and learned nothing from; it shipped that way once and
  read as a bug. `sites.ts` now throws at import if a clue repeats a
  distinctive word of its opener, which matters most when this prose is
  generated rather than written. A Commons filename is never rendered: it
  usually names the answer.
- **Every day is mixed general knowledge, never a themed round.** The six
  quiz questions come from six different corners (geography, space, animals,
  history, food, sport, science, the arts) and never more than two from any
  one, placed apart in the run. A day of all-geography or all-space reads as
  a specialist's quiz and drives off everyone else. `theme` stays "General
  knowledge" for every round; it is the sector label on the title screen and
  the share card, not a subject.
- Options are read in five seconds inside a square one sixth of the screen
  wide. Keep them to one or two short words. Prompts must fit two lines at
  14px on a 360px phone without pushing the lane row down.
- Rounds roll over at the player's local midnight (`todayKey`). The
  authored rounds form a pool: a date with its own file gets it, any other
  date rotates through the pool by day number, so every day is a round and a
  shared link never lands on a blank screen. `?round=YYYY-MM-DD` on `/` or
  `/play` flies a specific one; it is a QA hatch like `?replay=1`.
- **A practice round is drawn from the pool, not authored.**
  `getShuffledRound(seed)` takes two clusters, two numbers and two lanes from
  every round there is, plus a pair of sites seeded on the same string, and
  runs the result through the same `validate`. It relaxes one authoring rule
  and only one: a random draw can land three questions from the same corner
  in a round, which an authored day may never do. That is the price of a
  hatch nobody but a tester sees; do not "fix" it by tagging topics.

## Deliberately not done

Haptics, group leaderboards, server-side persistence, and accounts.
Recorded audio is also out: sound is synthesised,
and a sample library is not the way back in. Do not add these in passing. If one is asked
for, `lib/content/round.ts` and `lib/game/storage.ts` are the seams that
change; the engine and HUD should not.
