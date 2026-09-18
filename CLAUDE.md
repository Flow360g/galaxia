@AGENTS.md

# Galaxia

A daily quiz flight. Seven asteroid encounters, one run a day, and your score
is the distance you fly. Correct answers accelerate the ship, wrong answers
physically kill its momentum. Built with Next.js 16 (App Router, React 19)
and three.js 0.180. TypeScript strict throughout. The README is the long-form
reference for the game loop and the engine; this file is the working brief
for anyone changing the code.

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
- **Tension, then release.** Thrust drains as a fuel bar, the rock looms
  closer as you think, streaks lift your cruise floor so a miss is a visible
  fall from screaming to crawling. The Cluster is push-your-luck: bank the
  plasma now, or pick again for more and risk losing it all. Boost is
  confidence as a button. Keep every new mechanic inside this frame: a
  decision with a visible stake, a fast verdict, a consequence you can feel.
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

When weighing a feature, ask: does it make the daily run tighter, the
verdict more dramatic, or the share more shareable? If not, it probably
belongs in "deliberately not done" below.

## Mobile first: rules for anything on screen

The game is played in **portrait on a phone**, usually one-handed. Desktop
works, but it is the fallback, not the target. Test on a real phone
(`npm run dev -- -H 0.0.0.0`, open the LAN address), not just an emulator.

The screen is divided into three zones. Respect them:

- **Top: readouts only.** Distance, velocity, streak, shield. Small labels,
  no buttons. Padded by `env(safe-area-inset-top)` for notches and Dynamic
  Island.
- **Middle: the scene.** The ship sits low-centre in a chase camera, the
  encounter rock (or the six Cluster lanes) looms in the centre. **Nothing
  may cover this region.** No modals, banners, tooltips, toasts, or sticky
  elements in the middle of the viewport while a run is live. If a new
  element must exist, it goes in the top rail or the bottom panel.
- **Bottom: the one tappable panel.** Question, options, NOVA, Boost, BURN,
  the outcome toast. This is the thumb zone. It is the only region with
  `pointer-events: auto`; the HUD wrapper itself is `pointer-events: none`
  so touches fall through to the scene everywhere else.

Concrete constraints when building or changing a component:

- Tap targets are at least 44px tall (options are 48 to 56px). Options are a
  two-column grid for MCQ and a 3x2 grid for Cluster lanes so six choices
  fit above the fold on a 360x640 viewport without scrolling.
- The page never scrolls. `body` has `overflow: hidden` and
  `overscroll-behavior: none`, and the viewport disables user zoom because
  pinch and pull-to-refresh fight the game surface. Do not add content that
  needs scrolling inside the HUD; shorten it instead.
- Bottom padding uses `env(safe-area-inset-bottom)` so buttons clear the
  home indicator. Keep it.
- Panels are capped at `max-width: 480px` and centred so they do not
  stretch across a tablet or desktop and hide the scene.
- Type is legible on a 5.5 inch screen: prose 14 to 16px, arcade pixel
  type never below 9px, tabular figures for any number that changes so the
  counters do not jitter.
- Inputs use `font-size: 16px` so iOS does not zoom on focus. The anomaly
  text field is the only text input in the game; if you add another,
  reserve space for the software keyboard and keep the submit button
  visible above it.
- Check the `@media (max-width: 720px)` and `(max-height: 640px)` blocks in
  `components/Hud.module.css` when adding HUD elements. Short phones are the
  binding constraint, not narrow ones.
- Keyboard shortcuts (1 to 6, Enter, B, N) are a desktop convenience. Never
  make a feature keyboard-only, and never rely on hover states for meaning.
- Motion respects `prefers-reduced-motion`: the engine damps shake and
  parallax, the CSS kills the warp overlay. New effects need the same
  fallback.
- Performance is a design constraint on mobile. See the budget below. A
  HUD re-render at 60fps costs more than the scene, which is why React
  samples engine state at about 12Hz.

## Design language

Arcade cabinet meets editorial. Structure and type carry emphasis; colour is
signal, never decoration. Tokens live in `app/globals.css` and are mirrored
for three.js in `COLOR` inside `lib/game/Tuning.ts`. Keep them in sync.

- Background and fog: `--space` `#071122`. Panels: near-black at 90% alpha
  with hairline borders (`--rule-dark`), 4px radius, no drop shadows except
  glows.
- Signal colours: yellow `#ffe03d` (score, slingshot), cyan `#4ff1ff`
  (streak, thread, NOVA, plasma), orange `#ff8a1f` (Boost, BURN), violet
  `#b28cff` (the AI Anomaly, and nothing else), red `#ff6b5c` for damage.
  Each colour means one thing. Do not reuse violet for a non-anomaly
  element or cyan for a warning.
- Type: Press Start 2P (`.arcade`, always uppercase, tracked) for titles,
  figures, buttons and outcome labels. The sans stack for prompts and
  prose. The mono stack for units.
- Buttons are square-cornered. Active state inverts to yellow on ink.
- Copy is short, loud, present tense, in the game's voice: THREADED,
  SLINGSHOT!, WRECKED, THRUST OUT, FULL BURN!. No em dashes anywhere in
  UI copy or share text; use a middle dot, comma or full stop.

## Architecture in one screen

```
app/                  routes: / (title), /play, /api/anomaly, layout, globals.css
components/           GameCanvas (React/three.js boundary), Hud, ShareCard, BestRun, DebugStats
lib/game/Run.ts       pure state machine: intro -> approach -> scanning|collecting -> resolving -> aftermath
lib/game/Flight.ts    pure velocity model: cruise, streak floor, impulse, collision retain
lib/game/Engine.ts    three.js shell; subscribes to Run via RunHooks, owns the canvas and loop
lib/game/Tuning.ts    every constant that decides how the game feels
lib/game/*            Ship, EncounterAsteroid, ClusterField, Debris, Shield, Exhaust,
                      Camera, Backdrop, AsteroidField, Starfield, quality, nova, anomaly,
                      share (card + text), storage (localStorage), format, types
lib/content/round.ts  round loader with build-time validation
content/rounds/       one JSON per daily round: 2 cluster + 4 mcq + 1 anomaly
e2e/run.spec.ts       Playwright: flies a whole run on a Pixel 7 profile
```

Rules that fall out of this:

- **Pure core, imperative shell.** `Run.ts` and `Flight.ts` import neither
  three.js nor React. Game rules go there so they can be stepped with a
  fake clock. Visuals go in `Engine.ts` and the scene modules. The HUD is
  a view of `GameState` plus method calls on the engine (`answer`, `pick`,
  `burn`, `toggleBoost`, `useNova`, `submitAnomaly`).
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
  sampled at 12Hz; do not put objects with identity or methods in it.
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
state (every outcome kind, the share card, persistence), never performance.
`/play?replay=1` skips today's stored run. `?debug=1` overlays FPS, draw
calls, triangles, tier and DPR.

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
- Keep prompts short enough to read in the thumb-zone panel on a small
  phone without pushing options below the fold. Option text should fit two
  lines at 14px in a half-width column.
- Rounds roll over at the player's local midnight (`todayKey`). A missing
  date falls back to the sample round so a shared link never lands on a
  blank screen.

## Deliberately not done

Sound, haptics, group leaderboards, server-side persistence, accounts, and
more than one authored round. Do not add these in passing. If one is asked
for, `lib/content/round.ts` and `lib/game/storage.ts` are the seams that
change; the engine and HUD should not.
