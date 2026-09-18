# Galaxia

A daily space run. Seven questions, each an asteroid encounter; your score is
the distance you travel. Correct answers accelerate you. Wrong answers do not
score zero, they physically kill your momentum.

**Phase 3: the run.** Continuous flight, a real velocity model, Boost, NOVA
scans, one model-scored AI Anomaly per run, and a share card that draws the
whole flight as a story.

## Running it

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY for the anomaly scorer
npm run dev                  # http://localhost:3000
```

Test the feel on a real phone, not an emulator:

```bash
npm run dev -- -H 0.0.0.0    # then open http://<your-lan-ip>:3000 on the phone
```

`/play?replay=1` skips today's stored run. `?debug=1` adds the FPS, draw
call, triangle, tier and DPR overlay.

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright: flies a whole run in headless Chromium (set `CHROMIUM_PATH` if the bundled browser is not installed) |

## The loop

```
asteroid called -> thrust drains while you think -> answer locks -> the rock strikes
```

- **Thrust is the timer.** Every encounter starts at full thrust and drains
  over `ENCOUNTER.thrustSeconds`. The rock looms closer as it drains. Thrust
  left at lock scales the burst, so fast right answers go further. Empty
  thrust is a timeout, which is a collision.
- **Correct: THREADED.** The ship swerves past, engines flare, the camera
  drops back, velocity jumps and the distance counter climbs.
- **Correct + Boost: SLINGSHOT.** A tighter skim, a bigger burst, shield heat,
  screen shake, speed lines.
- **Wrong: COLLISION.** Shield flash, fragments, the hull tumbles, velocity
  halves and the streak resets.
- **Wrong + Boost: WRECKED.** Two rolls and a much heavier slowdown.
- **Streak.** Each consecutive correct answer lifts the cruise floor, the
  velocity the ship idles back to. Stars streak more, rocks fly past faster.
  Losing a streak drops you from screaming through space to cruise in one hit.
- **Boost.** Arm it before locking. Confidence, as a button.
- **NOVA.** Two per run, one tap, costs thrust. Rules out one wrong option,
  reveals an authored clue, or lights the two most plausible options. The
  pick is seeded per question so everyone gets the same help on the same rock.
- **AI Anomaly.** One per run, an open or visual question answered in text.
  `/api/anomaly` scores it with a model (rubric stays server-side); with no key
  or on any failure a keyword scorer marks it locally so the run never stalls.
  A partial score earns a partial burst.
- **Share card.** A 1080x1350 PNG: velocity over time as a glowing flight
  path, every encounter marked (thread, slingshot, collision, wreck, timeout,
  anomaly), streak bars, stats, and the total distance. Web Share where
  available, otherwise download or copy the text strip.

Distance is a speedometer integrated over the run, not seven point awards.
`Flight.ts` owns that: cruise, streak floor, impulse, collision retain and
the relaxation rates, all constants in `Tuning.ts`.

## The one file worth knowing

`lib/game/Tuning.ts` holds every constant that decides how the game feels:
`FLIGHT` (the velocity model), `ENCOUNTER` (timers, hold distances, swerve
offsets), `NOVA`, `FX` (shake, pull-back, tumble, debris), plus the camera,
ship, exhaust, field and star constants. Nothing else hardcodes a magic
number.

## How it works

**The treadmill.** The ship never travels along Z. It flies on autopilot on X
and Y while the world is translated past it at the Flight model's world
speed. Float precision stays constant however far a player gets, geometry is
a fixed recycled pool, and distance is a plain scalar the run owns.

**Pure core, imperative shell.** `Run.ts` is the state machine
(`intro -> approach -> scanning -> resolving -> aftermath`) and `Flight.ts`
the physics; neither imports three.js or React. `Engine.ts` subscribes
through `RunHooks`: it spawns the rock when a question is called, plays the
strike when the answer locks, and fires the burst or the impact on contact.
React reads `GameState` at about 12Hz and calls `answer`, `toggleBoost`,
`useNova`, `submitAnomaly` on the engine.

**The encounter rock** (`EncounterAsteroid.ts`) does not fly at world speed
while the answer is open. It hangs ahead and creeps in as thrust drains, then
strikes on lock. The anomaly is the same mesh in violet with a pulse.

**The ship** (`Ship.ts`) is the Quaternius GLB, re-materialised as Lambert.
The autopilot weaves at cruise, swerves on a correct lock and tumbles on
contact, all as a target position the old damped steering chases, so bank and
yaw still fall out of lateral velocity.

**Effects.** `Debris.ts` is one InstancedMesh of fragments. `Shield.ts` is an
additive wireframe bubble that rings out. The camera pulls back and kicks FOV
on a burst; streaks surge on a slingshot.

**React owns the DOM, three.js owns the canvas.** The engine creates its own
canvas inside a container div (a React-supplied canvas would be poisoned by
`forceContextLoss()` on the StrictMode remount).

**Persistence.** Today's run and the best distance live in localStorage.
`/play` shows the stored card if you already flew; FLY AGAIN clears it.

### Layout

```
app/                  routes: landing, /play, /api/anomaly, global styles
components/           GameCanvas (mount boundary), Hud, ShareCard, BestRun, DebugStats
lib/game/             Engine, Run, Flight, nova, anomaly, share, storage,
                      Ship, EncounterAsteroid, Debris, Shield, Exhaust, Camera,
                      Backdrop, AsteroidField, Starfield, quality, Tuning
lib/content/          round loader
content/rounds/       one JSON file per daily round (6 mcq + 1 anomaly)
public/               spaceship.glb, backdrop, anomaly images
e2e/                  Playwright full-run test
```

## Authoring a round

Each `content/rounds/YYYY-MM-DD.json` has seven questions. MCQ entries carry
`options`, `answer` (index), an optional `hint` (what a NOVA clue reveals) and
a `fact`. The anomaly entry carries `kind` (`open` or `visual`), an optional
`image` under `/public`, `imageAlt`, a `rubric` the model marks against
(never shown), `accept` keywords for the offline scorer, and `answerText`.

## Performance rules

- Zero allocation in the frame loop. Scratch vectors are module-level.
- `InstancedMesh` for anything above about 20 copies (field, debris).
- `MeshLambertMaterial`, flat shading. No PBR, no shadow maps, no
  post-processing. Glow is faked additively.
- DPR capped at 2, never raw `devicePixelRatio`.
- Budget: under 60 draw calls and 60k triangles.
- Quality tier is picked from device hints, then downgraded if measured frame
  time misses the budget.

## What is deliberately not done

Sound, group leaderboards, server-side persistence, more than one authored
round, and haptics. The anomaly scorer is a single unstructured call; a
structured-output tool call would be the next hardening step.
