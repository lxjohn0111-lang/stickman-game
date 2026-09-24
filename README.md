# Way Through

A first-person 3D stickman shooter that runs in the browser. You start on a rooftop, fight down through a stair room, kitchen and canteen, cross a fenced yard past the water tower, and walk out through the North Gate.

Everything is built at load time. The geometry is boxes, cylinders and cones outlined with screen-space ink lines, every texture is drawn on a canvas, and every sound is synthesised with the Web Audio API. There are no image, model or audio files.

## Launch

**Offline, no install:** double-click `index.html`. It loads one classic script, `dist/game.js`, which is committed, so it works straight from `file://`.

**Local server (optional):**

```sh
node server.js          # http://localhost:8080
node server.js 3000     # any port
```

**Rebuild the bundle** after editing `src/`:

```sh
npm install             # esbuild only; three.js is vendored in vendor/three
npm run build           # -> dist/game.js (minified IIFE)
npm run watch           # rebuild on change
node build.mjs --dev    # unminified with inline source maps
```

**Browser tests** use Playwright with Chromium, and a copy of Playwright must be installed:

```sh
npm test                # mechanics, weapons, pointer lock, full playthroughs (both styles)
node tests/playthrough.mjs normal neo   # one autopilot run: difficulty, style
```

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock, falls back to plain mouse-move look) |
| Left click | Fire (hold for SMG and rifle) |
| Right click | Steady aim (hold) |
| Space | Jump |
| Shift | Sprint |
| C or Left Ctrl | Crouch (hold) |
| F | Open or close doors, swap guns, take ammo |
| R | Reload |
| V | Toggle visual style (Classic or Neobrutalist) |
| Esc | Pause |

## Project layout

```
index.html            HUD/menu markup and CSS for both styles; loads dist/game.js
server.js             tiny static file server
build.mjs             esbuild: src/main.js + vendored three -> dist/game.js (IIFE)
vendor/three/         three.js r170 build + the line/geometry addons used (MIT)
src/
  main.js             game states, loop, style switching, previews, sun/shadows
  level.js            the whole map, colliders, doors, nav graph, enemy spawns, minimap data
  builder.js          primitive builder: merges static geometry per material role, one ink-line mesh
  materials.js        one shared material per role + Classic/Neo palettes (recoloured in place)
  world.js            AABB collision grid, raycasts, doors, character controller
  nav.js              waypoint graph + A*
  doors.js            hinged doors that swing away from whoever opens them
  player.js           movement, look, firing, reload, interaction, health, death camera
  viewmodel.js        first-person guns/forearms, recoil spring, muzzle-flash strokes
  guns.js             SMG / pump shotgun / AK rifle / pistol models (boxes + cylinders)
  bullets.js          converging player tracers, slow enemy teardrops, near-miss whiz
  enemies.js          instanced stickmen, AI state machine, hearing, Verlet ragdolls, pickups
  fx.js               instanced decals, blood pools, debris/blood particles, enemy flashes
  audio.js            synthesised sounds pre-rendered with OfflineAudioContext
  input.js            keyboard/mouse, defensive pointer-lock handling
  ui.js               HUD, menus, cards, settings, minimap
  handwriting.js      single-stroke SVG "hand" lettering for the titles
  textures.js         canvas textures (ink splats, sky gradient, clouds, toon ramp)
tests/                Playwright harness, autopilot bot and checks
```

## About the footage

**The gameplay footage was not attached in this session.** As the brief allows, I built the game from the written spec alone. So I could not do the "study it frame by frame at 60 fps", "measure fire rates from the gunshot peaks in the audio" or "compare each area side by side" steps. Instead:

- Fire rates are the brief's measured values: SMG 0.09 s per shot, rifle 0.125 s. The weapons test fires each gun for 2 s and measures a mean interval of 0.089 s for the SMG and 0.124 s for the rifle at 60 fps.
- Each area was checked against the spec's descriptions from in-game screenshots taken during automated playthroughs, in both styles.

The list below separates what the brief states (the brief was written from the footage) from what I inferred or invented.

### Reproduced from the brief (footage-derived)

- **Look:** unlit white surfaces with about 1.2 px black ink edges on every primitive, fading into fog. Glass has 3 to 4 short diagonal hatch strokes. Solid black stickmen have a big round head (radius 0.165 m), thick limbs and one white eye with a pupil. Blood is dark red. Bullet hits leave black ink splats with droplets and flying debris.
- **Map and route:** flat roof with a 1.05 m parapet, AC units and vents, and a stair hut whose door opens onto the roof. Then a straight 20-step stair (0.25 m rise, 0.4 m run) with rails on both sides, down into a room with a window on the far wall, two lockers on the right and a side door on the left. Then a kitchen with a serving counter, trays and an enemy behind the counter. Then a canteen with 12 tables in rows plus chairs, windows, EXIT signs over two exit doors, and vending machines. Then a fenced yard: chain-link fences with diamond lattice that block movement but not bullets, gable-roofed barracks, 7-sided cone pines, lamp posts, overhead cables, a lattice water tower on a concrete pad, a guard tower with a sniper, jersey barriers and crates. Last, the North Gate beyond the water tower; walking through it wins.
- **Weapons:** boxy Uzi-style SMG (big rear block, grip holding the magazine, twin sight posts) at 0.09 s per shot. Pump shotgun with 8 pellets and a ribbed pump that animates after every shot. AK-style rifle at 0.125 s with a fork front sight and curved magazine. Semi-auto pistol. Guns are held low on the right, muzzle just below-right of the crosshair, with forearms rising from the bottom of the screen. Each shot kicks the gun up and back, and a spring returns it in about 5 frames. The camera pitch kicks up and partly recovers. The muzzle flash is 8 to 10 radiating ink strokes for 2 frames. Player tracers have a thin tail and a round head and converge from the muzzle onto the crosshair line. Enemy bullets are slow, fat teardrops with a whiz on near misses.
- **Enemies:** about 15 (16 placed). They go from idle or patrol, to building awareness while they see you, to combat (face, aim, burst fire, strafe), to chasing your last known position with waypoint A* and opening doors themselves, to searching. They hear gunfire, which carries less through walls, and alert nearby enemies. When hit, both arms fly up and blood sprays onto the wall behind. On death: Verlet ragdoll collapse, a growing blood pool, and the gun drops as a pickup ("F Swap Rifle", or take its ammo if it is the same gun). Headshots do 2.5× damage.
- **Player and HUD:** WASD, pointer-lock look, jump, sprint, crouch, F, R, right-click steady aim. Doors swing away and stop bullets, with "[F] Open" / "[F] Close" pills. Health regenerates with no health bar; the screen edges darken with damage. "HIT - AHEAD / LEFT / RIGHT / BEHIND" appears in small monospace capitals under a rule while that screen edge flashes darker. Tiny dot crosshair and an optional ammo readout.
- **Death and win:** the gun drops away, the camera falls and rolls up toward the sky, and the screen fades light grey → grey → charcoal. Then a card with handwritten "No way through.", a black double-bordered "Try again" button, and Mission · Controls · Settings links. The win card reads "Way through." with time, kills, headshots, accuracy, score and best score.
- **Two styles, switchable live:** materials are shared per role and recoloured in place, never rebuilt, and the choice is saved in localStorage. In Classic each role's emissive is set to its own colour. Neobrutalist has pink walls, a cyan roof, mint floors, orange tables, blue chairs and violet steel, with 3 px outlines, 2-step toon shading and hard sun shadows. The roof casts none. It adds a gradient sky with outlined clouds, black stickmen with a white rim and yellow eye, yellow player tracers, magenta enemy tracers, a yellow-orange starburst flash, and UI with 3 px borders and hard offset shadows.
- **Menus:** main menu over a slow orbit of the live scene with Play, Visual Style (previews rendered from the game), Controls, Settings (all the listed options), How to Play and Credits. Pause menu with Resume, Visual Style, Settings, Controls, Mission (with minimap), Restart and Main menu. V toggles the style.
- **Pitfalls handled:** step-up only while grounded; vertical collisions only against surfaces crossed this step; stair ground-snap; every door verified to open onto walkable floor; pointer lock requested in the click handler, with a "click to resume" pause when a re-lock is refused and a mouse-move fallback; merged static geometry and instancing.

### Inferred or invented (not in the brief)

- **Exact layout and sizes:** building footprint 37 × 18 m with the roof at 5 m, room sizes, prop positions, where the doors and windows are, a 62 × 82 m yard with an inner fence that has a central gap, three barracks, and the gate position.
- **Enemy roster:** placement, patrol routes and weapon mix. Six guards "hold" their post (the counter shotgunner, yard riflemen and gate guards) so fights spread along the route instead of converging on the canteen.
- **Numbers:** all damage, health, spread, speed and awareness values. That includes jump height 0.84 m (below the parapet), enemy health 80, player health 100, regen after 4 s, and enemy bullet speeds of 29 to 37 m/s (62 m/s for the sniper).
- **Round shapes:** the brief says boxes, cylinders and cones, but a "big round head" needs a sphere. Spheres are also used for joints, tracer heads and teardrop heads. Muzzle starbursts are pinched cylinders.
- **Classic flash fill:** in Classic the flash fill is white, so only the black strokes show. Enemy flashes are small black starbursts.
- **Enemy tells:** the enemy "alert" sound, and a "suspicious" state that turns toward you while awareness builds.
- **Extra feedback:** a hit-marker, area name captions, and toasts such as "+48 SMG ammo" and "Style: Neobrutalist".
- **Prompts:** "Take … ammo" wording for same-gun pickups, and the keycap styling of the pills.
- **Handwriting:** the handwritten lettering is my own single-stroke SVG "font", so it looks the same without web fonts.
- **Sound design:** every synthesis recipe, plus ambient wind and footsteps.
- **Scoring:** kills, headshots, accuracy and a time bonus, multiplied by difficulty.
- **Rooftop shadows in Neo:** rooftop props stop casting shadows while you are inside the building. Their shadows would otherwise fall through the non-casting roof into the rooms.
- **Three difficulties:** Easy, Normal and Hard, which scale damage, spread, reaction time, awareness and bullet speed.

## Verification

All checks run in headless Chromium (SwiftShader WebGL) through Playwright:

- `tests/playthrough.mjs`: an autopilot that drives the real input state (keys, mouse deltas, clicks, F) through roof → stair → kitchen → canteen → yard → North Gate. It won on Normal in both styles (about 70 to 80 s of game time, 15 of 16 kills, no deaths in the final runs) and saved a screenshot per area.
- `tests/mechanics.mjs`:
  - repeated jumps can't mantle the parapet (the peak foot height stays below its top);
  - walking down the 20 steps leaves the ground for 0 frames, and walking back up works;
  - jumping beside or spawning inside crates never teleports you on top;
  - all five doors open onto floor with a clear swing on both sides, swing away from the player and block bullets;
  - the snapshot is byte-identical after switching style mid-fight and back (position, health, ammo, enemies, ragdolls, decals, pools, doors);
  - hit-direction text, regen, the death card and restart all work.
- `tests/weapons.mjs`:
  - measured cadence is 0.089 s for the SMG and 0.124 s for the rifle;
  - the shotgun fires 8 pellets and the pump animates and sounds;
  - the pistol is semi-auto;
  - every shot's sound starts on the same frame as its muzzle flash;
  - the recoil spring has returned by frame 5, and the camera kick partly recovers.
- `tests/lock.mjs`: lock on Play, locked mouse look, Esc/unlock → pause, refused re-lock → "Click to resume" → re-lock, and a sandboxed iframe (no pointer lock) → mouse-move fallback.
- Draw calls, as shown by the FPS counter: about 50 to 75 in Classic and about 95 to 115 in Neobrutalist, where the shadow pass adds roughly 40.

## Credits

- three.js r170 (MIT), vendored in `vendor/three/`.
- Everything else is in this repository.
