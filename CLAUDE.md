@AGENTS.md

# Galaxia

A daily quiz flight. Seven encounters, one run a day, and your score is the
distance you fly. Every answer is a lane: tap a square, the ship veers into
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
  (`?replay=1` is a dev and QA escape hatch, not a feature).
- **Two to three minutes, one thumb.** A run has to fit a bus stop. Every
  interaction is a single tap. Nothing requires precision, reading a manual,
  or two hands.
- **Tension, then release.** The clock is five seconds per pick, drawn as
  thrust draining and a countdown, and it refills for every decision.
  Streaks lift the cruise floor so a miss is a visible fall from screaming
  to crawling. The Cluster is push-your-luck: bank the plasma now, or pick
  again for more and risk a boulder. Boost is confidence as a button. Three
  shields per run; each wrong lane costs one, and at zero every miss is a
  wreck. Keep every new mechanic inside this frame: a decision with a
  visible stake, a fast verdict, a consequence you can feel.
- **The share is the product.** The end of every run is a 1080x1350 share
  card and a Wordle-style text strip (glyphs per encounter, distance, peak,
  streak). A shared link should land a new player on the title screen one
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

- **Top band: the whole HUD.** Readouts (distance, velocity, streak, shield
  pips), then the question panel: tag and countdown, prompt, thrust bar,
  the row of answer squares, the reactor gauge, NOVA and Boost or BURN. The
  outcome toast lands here too. The band is sized by its contents and
  capped at roughly 60vh so it can never creep down over the ship. Padded
  by `env(safe-area-inset-top)` for notches and Dynamic Island.
- **Everything below the band: the ship's.** The camera aims above the hull
  so the ship flies in the lower third, and the pod or boulder comes down
  the lane toward it. **Nothing may sit in this region.** No modals,
  banners, tooltips, buttons, or sticky elements over the lower half while
  a run is live. The one exception is the pulse (PLASMA COLLECTED, SHIELD
  LOST), a short one-shot flash at about 64% down that is `pointer-events:
  none` and fades in 1.4 seconds. If a new element must exist, it goes in
  the band.
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
  needs scrolling inside the HUD; shorten it instead.
- The HUD wrapper is `pointer-events: none`; only the panel and toast opt
  back in. Keep it that way so touches fall through to the scene elsewhere.
- Type is legible on a 5.5 inch screen: prose 14 to 16px, arcade pixel
  type never below 9px, tabular figures for any number that changes so the
  counters do not jitter.
- Inputs use `font-size: 16px` so iOS does not zoom on focus. The anomaly
  text field is the only text input in the game; if you add another,
  reserve space for the software keyboard and keep the submit button
  visible above it.
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

## Design language

Arcade cabinet meets editorial. Structure and type carry emphasis; colour is
signal, never decoration. Tokens live in `app/globals.css` and are mirrored
for three.js in `COLOR` inside `lib/game/Tuning.ts`. Keep them in sync.

- Background and fog: `--space` `#071122`. Panels: near-black at about 86%
  alpha with hairline borders (`--rule-dark`), 4px radius, a light
  backdrop blur, no drop shadows except glows.
- Signal colours: yellow `#ffe03d` (score, slingshot), cyan `#4ff1ff`
  (streak, lane clear, NOVA, plasma pods), orange `#ff8a1f` (Boost, BURN),
  violet `#b28cff` (the AI Anomaly, and nothing else), red `#ff6b5c` for
  damage and boulders. Each colour means one thing. Do not reuse violet
  for a non-anomaly element or cyan for a warning.
- Type: Press Start 2P (`.arcade`, always uppercase, tracked) for titles,
  figures, buttons and outcome labels. The sans stack for prompts and
  prose. The mono stack for units.
- Buttons are square-cornered. Active state inverts to yellow on ink.
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
app/                  routes: / (title), /play, /api/anomaly, layout, globals.css
components/           GameCanvas (React/three.js boundary), Hud, ShareCard, BestRun, DebugStats
lib/game/Run.ts       pure state machine: intro -> approach -> collecting|scanning -> resolving -> aftermath
lib/game/Flight.ts    pure velocity model: cruise, streak floor, impulse, collision retain
lib/game/Engine.ts    three.js shell; subscribes to Run via RunHooks, owns the canvas and loop
lib/game/Tuning.ts    every constant that decides how the game feels (FLIGHT, ENCOUNTER,
                      CLUSTER, LANE, SHIELDS, NOVA, FX, CAMERA, SHIP, ...)
lib/game/Incoming.ts  the one pod or boulder that comes down a picked lane
lib/game/Audio.ts     all sound, synthesised: engine bed, music loop, one-shot cues
lib/game/*            Ship, EncounterAsteroid, Debris, Shield, Exhaust, Camera, Backdrop,
                      AsteroidField, Starfield, quality, nova, anomaly, share (card + text),
                      storage (localStorage), format, types
lib/content/round.ts  round loader with build-time validation
content/rounds/       one JSON per daily round: 2 cluster + 4 mcq + 1 anomaly
e2e/run.spec.ts       Playwright: flies a whole run on a Pixel 7 profile
e2e/audio.spec.ts     Playwright: taps the master output and asserts on the signal
```

Rules that fall out of this:

- **Pure core, imperative shell.** `Run.ts` and `Flight.ts` import neither
  three.js nor React. Game rules go there so they can be stepped with a
  fake clock. Visuals go in `Engine.ts` and the scene modules. The HUD is
  a view of `GameState` plus method calls on the engine (`answer`, `pick`,
  `burn`, `toggleBoost`, `useNova`, `submitAnomaly`, `setLaneFractions`).
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
- **Anomaly scoring never blocks a run.** `/api/anomaly` calls a model
  when `ANTHROPIC_API_KEY` is set, and the client falls back to the
  keyword scorer on any failure or after the scan timeout. Keep the rubric
  server-side; never send it to the client.
- **Storage is best effort.** localStorage can be missing or full; every
  read and write is wrapped and a failure must never break play.

## Commands

```bash
npm run dev            # http://localhost:3000
npm run dev -- -H 0.0.0.0   # then open http://<lan-ip>:3000 on a phone
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (flat config, next core-web-vitals + typescript)
npm run build          # production build; a malformed round fails here
npm run test:e2e       # playwright, builds and serves on :3100, SwiftShader WebGL
```

Run typecheck and lint before committing. Run the e2e test after any change
to `Run.ts`, `Flight.ts`, the HUD, or a round file; it asserts flow and
state (every outcome kind, shields, pulses, the share card, persistence),
never performance. `/play?replay=1` skips today's stored run. `?debug=1`
overlays FPS, draw calls, triangles, tier and DPR.

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

`content/rounds/YYYY-MM-DD.json`, seven questions in order: two `cluster`,
four `mcq`, one `anomaly`. The loader validates cluster shape at import.

- Cluster: exactly six `options`, exactly three distinct `answers`
  (indices), a `fact`. All three right lanes must be unarguably right and
  all three wrong lanes unarguably wrong; one debatable lane ruins the
  encounter.
- MCQ: four `options`, one `answer` index, optional `hint` (what a NOVA
  clue reveals), a `fact`.
- Anomaly: `kind` (`open` or `visual`), optional `image` under `/public`
  with `imageAlt`, a `rubric` for the model (never shown), `accept`
  keywords for the offline scorer, `answerText`, a `fact`.
- Options are read in five seconds inside a square one sixth of the screen
  wide. Keep them to one or two short words. Prompts must fit two lines at
  14px on a 360px phone without pushing the lane row down.
- Rounds roll over at the player's local midnight (`todayKey`). A missing
  date falls back to the sample round so a shared link never lands on a
  blank screen.

## Deliberately not done

Haptics, group leaderboards, server-side persistence, accounts, and more
than one authored round. Recorded audio is also out: sound is synthesised,
and a sample library is not the way back in. Do not add these in passing. If one is asked
for, `lib/content/round.ts` and `lib/game/storage.ts` are the seams that
change; the engine and HUD should not.
