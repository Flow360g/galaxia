# Galaxia

A daily quiz flight. Questions come at you as asteroids; how close you get
decides how far you travel.

**Phase 2: a playable round.** The Quaternius spaceship with burning exhausts,
a painted nebula backdrop, an arcade title screen, and a working quiz: steer
into your answer, the rock you hit scores you, ten questions then a results
grid.

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
`lanePosition` (2.4 means 40% of the way from lane 2 toward lane 3).
`lib/game/scoring.ts` reads the continuous position for numeric questions
(flight path as answer: distance from the truth is the gradient) and the whole
lane for multiple choice (the option's authored `proximity` is the gradient).

**The round.** `lib/game/Quiz.ts` announces each question on the HUD, waits a
preview so the player can read and pre-steer, then spawns four labelled rocks,
one per lane. When the lead rock crosses the commit line the ship's X locks the
answer in: the chosen rock turns green or red, the ship boosts or brakes, a
miss costs hull, and the rock shatters as the ship flies through it. After the
last question the engine freezes and the results panel shows the share grid.

**The ship** is `public/models/spaceship.glb` (Quaternius, CC0), loaded with
`GLTFLoader` and re-materialised as Lambert so the PBR ban holds. Nozzle
positions and flame size live in `Tuning.SHIP.nozzles` and `Tuning.EXHAUST`.

**The backdrop** is one textured plane parented to the camera, sized to cover
the frustum at any aspect. Fog and clear colour are the image's dominant tone
so distant rocks fade into it.

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
components/           GameCanvas (mount boundary), Hud, RoundEnd, DebugStats
lib/game/             Engine, Quiz, scoring, Ship, Exhaust, Backdrop, Camera,
                      Input, AsteroidField, QuestionAsteroid, Starfield,
                      quality, Tuning
public/               spaceship.glb, backdrop image
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
- Budget: under 60 draw calls and 60k triangles. Currently ~26 and ~16k.
- Quality tier is picked from device hints, then downgraded if measured frame
  time misses the budget.

## What is deliberately not done

Share cards, group leaderboards, sound, persistence (the title screen's
hi-score is a placeholder), and time-decay on scoring (`AnswerInput` still
carries `elapsed` and `window` for it).
