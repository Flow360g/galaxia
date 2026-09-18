# Galaxia

A daily quiz flight. Questions come at you as asteroids; how close you get
decides how far you travel.

**Phase 1 (this branch): the world only.** Ship, camera, flight feel, asteroid
motion, starfield, HUD and the mobile performance envelope. The quiz mechanic
and the gradient-of-correctness scoring are deliberately not implemented yet.

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

Test the feel on a real phone, not an emulator:

```bash
npm run dev -- -H 0.0.0.0    # then open http://<your-lan-ip>:3000 on the phone
```

Add `?debug=1` to `/play` for the FPS, draw call, triangle, tier and DPR overlay.

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## The one file worth knowing

`lib/game/Tuning.ts` holds every constant that decides how the game feels:
speed ramp, steering response, bank angle, camera damping and offsets, field
density, star counts, performance budgets. Nothing else hardcodes a magic
number, so changing the feel means changing that file and nothing else.

## How it works

**The treadmill.** The ship never travels along Z. It steers on X and Y inside
a corridor while the world is translated past it. That keeps float precision
constant no matter how far a player gets, makes geometry a fixed recycled pool
rather than something spawned forever, and leaves distance as a plain scalar
that scoring can own independently of the scene graph.

**Lanes are the seam for scoring.** The corridor divides into N lanes (default
4). The engine always exposes both a discrete `currentLane` and a continuous
`lanePosition` (2.4 means 40% of the way from lane 2 toward lane 3). That one
abstraction serves every candidate mechanic without a rewrite: continuous
position for gate steering, discrete lane for proximity-ranked multiple choice.

**React owns the DOM, three.js owns the canvas.** The engine runs its own
`requestAnimationFrame` loop and never touches the React scheduler. State flows
one way, engine to React, sampled at about 10Hz for the HUD. three.js is used
imperatively rather than through react-three-fiber, because the frame loop
needs allocation-free control over an object pool.

**The engine creates its own canvas.** `forceContextLoss()` on teardown
permanently poisons a canvas element, so a canvas supplied by React would be
dead on the second mount, which StrictMode guarantees. The engine mounts a
fresh canvas into a container div instead.

### Layout

```
app/                  routes: landing, /play, global styles
components/           GameCanvas (mount boundary), Hud, DebugStats
lib/game/             Engine, Ship, Camera, Input, AsteroidField,
                      QuestionAsteroid, Starfield, quality, Tuning, scoring
lib/content/          round loader
content/rounds/       one JSON file per daily round
```

## Performance rules

These are not optional; they are what decides whether the game is playable on
a mid-range Android.

- Zero allocation in the frame loop. Scratch vectors and matrices are
  module-level and reused.
- `InstancedMesh` for anything above about 20 copies. The whole ambient debris
  field is one draw call.
- `MeshLambertMaterial` with flat shading. No PBR, no shadow maps, no
  post-processing. Glow is faked additively.
- DPR capped at 2, never raw `devicePixelRatio`: a 3x phone would otherwise
  render 9x the pixels.
- Budget: under 60 draw calls and 60k triangles. Currently ~18 and ~14k.
- Quality tier is picked from device hints, then downgraded if measured frame
  time misses the budget.

## What is deliberately not done

`lib/game/scoring.ts` is a documented stub. The gradient mechanic is still an
open design decision between flight-path-as-answer, proximity-ranked multiple
choice, a confidence wager, and a hybrid. `AnswerInput` already carries the
union of what all four need, so choosing one means filling in a single
function.

Also not started: share cards, group leaderboards, sound, persistence.
