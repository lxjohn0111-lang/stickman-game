# Way Through

A first-person stickman shooter campaign for the browser: eight levels, three difficulties, Endless Mode, and two visual styles you can switch at any moment. It is built for web portals like CrazyGames: it's playable within two clicks, keyboard and mouse come first, it pauses on focus loss, and it saves progress in localStorage.

Everything is built at load time. The geometry is boxes, cylinders and cones outlined with screen-space ink lines, every texture is drawn on a canvas, and every sound and both music loops are synthesised with the Web Audio API. There are no image, model or audio files.

## Launch

| How | What to open |
| --- | --- |
| Offline, one file | `waythrough.html`, which has the game script inlined. Double-click it; nothing else is needed. |
| Offline, from the repo | `index.html`, which loads `dist/game.js` (committed). Keep the `dist/` folder next to it. If the script can't load, the page says so after a few seconds instead of loading forever. |
| Local server | `node server.js` → http://localhost:8080 (`node server.js 3000` for another port) |

Rebuild after editing `src/`:

```sh
npm install             # esbuild only; three.js is vendored in vendor/three
npm run build           # dist/game.js + waythrough.html + artifact/index.html
npm run watch           # rebuild dist/game.js on change
```

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock, with a plain mouse-move fallback where lock is unavailable) |
| Left click | Fire (hold for automatic weapons; the burst rifle fires 3 rounds per click) |
| Right click | Steady aim (hold) |
| 1 / 2, Q, mouse wheel | Main weapon / sidearm |
| R | Reload (you can't fire until the magazine is in) |
| F | Doors, switches and consoles; swap guns; take ammo from the same gun |
| Space | Jump; let go of a ladder |
| Shift | Sprint |
| C or Left Ctrl | Crouch (hold) |
| W / S at a ladder | Climb up / down |
| V | Toggle visual style (Classic / Neobrutalist) |
| Esc | Pause |

## The campaign

| # | Level | Objective | Landmark | Final encounter |
| --- | --- | --- | --- | --- |
| 1 | North Gate | Off the roof, through kitchen and canteen, across the yard, out through the gate. This is the original map, unchanged; a tutorial overlay and tips teach the controls. | Water tower | Defenders at the water tower and gate on several heights; a reinforcement wave through the gate |
| 2 | Container Port (sunset) | Cross the container yard to the warehouse, reach the harbour control room, open the security gate | Gantry crane, cargo ship | Riflemen on container roofs and a heavy at the control room; a wave through the opened gate |
| 3 | Underground Station | Restore power in two electrical rooms, then reach the maintenance exit | Walk-through train | After the power returns: attacks from both platforms and inside the train |
| 4 | Desert Outpost (dust) | Destroy three radio transmitters, then escape through the vehicle checkpoint | Transmitter masts, watchtowers | Watchtower sniper, riflemen behind barriers, advancers in the trenches, plus a wave from the flanks |
| 5 | Mountain Hotel (snow) | Get into the lobby, clear the upper floor, free the trapped civilian, open the courtyard exit | Frozen courtyard pond | Balconies above the courtyard and a squad in the lobby |
| 6 | Industrial Factory | Shut down three production controls, call the freight elevator, hold until it arrives | Furnaces, chimneys | 45 s defence around the still-running transfer belt, with reinforcements through four doors |
| 7 | Rainy City Block (night) | Cross the district to the parking garage and reach its roof | Neon main street, garage | Hold the extraction zone for 90 s against four waves, then board the helicopter |
| 8 | Island Fortress | Reach the courtyard, disable the alarm, enter the command tower, defeat the commander | Command tower | A commander who falls back to the roof with a shotgun, then to the first floor with an SMG, calling a wave each time. Winning unlocks Endless Mode and shows campaign totals |

Level 8 brings back pieces of earlier levels: port containers on the dock, the desert watchtower and sandbags, the North Gate water tower, and a tiled tunnel from the station.

A first run takes about 45 to 60 minutes, and each level about 5 to 10 minutes. Every level has 2 to 3 checkpoints, 3 secrets, health kits, ammo and several weapons to try.

### Progression and saving

- **Play / Continue** starts the latest unlocked level. **Level Select** shows a preview rendered from the level itself, plus name, best score, best time, stars and secrets. Levels unlock in order, and finished levels can be replayed.
- **Easy / Normal / Hard** change enemy health, accuracy, reaction time, damage, the number of optional pickups and how far health regenerates (100 / 75 / 50). They never change the layout.
- **Saved in localStorage** (`waythrough.save.v2`, `waythrough.settings.v1`, `waythrough.style`): unlocked levels, last level, per-level best score, time, stars and secrets, achievements, Endless records, campaign totals, settings and style.
- **Loading card:** level name, place, objective and a control reminder, with a progress bar while the level builds in stages. Then "Click to start".
- **Results card:** time, kills, headshots, accuracy, damage taken, secrets and score, with the stars awarded and **Next Level / Replay / Main Menu** buttons.
- **Death card:** **Restart Checkpoint / Restart Level / Main Menu**.

### Scoring

Kills are worth 100 and headshots add 50. Each kill multiplies by a combo: +10% per kill without taking damage, up to ×2. The final score adds accuracy × 1000, 4 points per second under par, 5 per remaining health point and 250 per secret, all scaled by difficulty (×0.8 / 1 / 1.3). Stars are 1 for finishing, then 2 or 3 for reaching `enemies × 80 + 700` or `enemies × 130 + 1400` points before the difficulty scaling. Three stars are reachable without perfect play.

**Achievements:** Way Through (finish all levels), Explorer (find all 24 secrets), Untouched (finish a level without damage), Hard Way Through (finish every level on Hard).

**Endless Mode** unlocks when you finish the campaign. It shuffles sections of the campaign maps, three waves per section, with bigger and tougher waves each time. It ends on death and saves your best wave and score.

## Gameplay systems

- **Health:** a bar at the lower left reading "76 / 100". It is green, turns yellow below 50, and turns red and pulses below 25, with a delayed trailing segment when you take damage. A dashed mark shows the regeneration limit. Regeneration starts after 5 s without damage, at 8 hp/s, up to 100 / 75 / 50 depending on difficulty. Health kits give +35, never above 100, and are left on the floor if you're at full health. "HIT - AHEAD / LEFT / RIGHT / BEHIND" still appears and the matching screen edge flashes dark red. The Classic bar is white with a black ink outline; the Neo bar has a 3 px border, a hard shadow and bright colours. Switching style never touches health.
- **Weapons:** SMG, pump shotgun, AK rifle, burst rifle (main); pistol, auto pistol, revolver (sidearm). Each has its own silhouette, recoil, fire rate, spread, reload and sound. You carry one of each. Guns dropped by you or by enemies keep their ammo, and walking over a gun you already carry takes its ammo. The ammo panel sits beside the health bar with both slots and a reload bar.
- **Enemies** keep the stickman silhouette:
  - **Pistol:** low health, fast, accurate single shots.
  - **SMG:** aggressive short bursts that keep pushing.
  - **Rifle:** medium and long range, and changes cover after firing, looking for spots that are low-blocked but open at head height.
  - **Shotgun:** closes the distance and is dangerous up close.
  - **Heavy:** 1.2× size, slow, lots of health, with a visible armour vest where hits spark and do less damage. It staggers after repeated hits, then shrugs hits off for 3.4 s so it can't be stun-locked.
  - **Sniper:** a thin red laser tracks you for about 0.8 s, freezes for the last 0.25 s, then fires, so moving dodges it.
  - **Commander:** a boss.
  - **Civilians:** grey (Classic) or blue (Neo), with their hands up.
- **Enemy spawns:** reinforcements come in only through doors, gates, stairways or distant entries that you can't see and that aren't behind you.
- **Checkpoints** arm when you pass them and activate once the fighting near you has ended, with a "CHECKPOINT" notice. Restoring one gives you full health, the weapons and ammo you had there, and the enemies that were still alive then (at their posts). It also restores objective state, pickups, doors, hazards and level state such as power, alarms and the helicopter. Cleared encounters never respawn.
- **Level machinery:**
  - Conveyor belts carry the player, enemies and dropped guns.
  - Steam vents and presses warn with a light, a sound and puffs before they can hurt, and are never unavoidable.
  - The freight elevator descends during the hold-out.
  - Ladders.
  - Destructible transmitters.
  - Flickering station lights until the power comes back.
  - Glass that cracks and tinkles when shot.
- **Weather and surfaces:**
  - Rain with reflection streaks under the street lamps.
  - Snow with footprints that fade after about 6 s.
  - Desert dust that thins the distance but always leaves the area around the crosshair clear.
  - An echo in the station.
  - Footsteps that change with the surface: roof, indoor, metal, snow and outdoor.

## Web-portal UX

- **Two clicks** to play: Play, then Start on the loading card (which is also the click pointer lock needs).
- On Level 1 a **controls overlay** stays up until you move or fire.
- **Auto-pause** when the tab or window loses focus. Resuming waits for a click and a successful pointer lock; if the browser refuses, a "Click to resume" card appears.
- **Localisation:** every player-facing string lives in `src/i18n.js`, so adding a language is one more table.
- **Audio:** master, music and effects volume, with music quieter by default. No sound or music plays before the first click. There is a procedural menu theme, plus a separate low-intensity combat loop that comes in while enemies fight you and fades out after.
- **Fullscreen** toggle.
- **Quality:** Low, Medium or High changes resolution, shadow-map size, particle and decal counts and outline width, never gameplay. If the frame rate stays below 40 fps for 10 s, a hint suggests a lower setting; the game never changes it for you.
- **Loading:** levels load in stages over several frames with a progress bar. Geometry, per-level textures, enemies, pickups, effects and loops are disposed or reset between levels.
- **Buttons** have hover, active and focus states in both styles, and screens fade in quickly.

## Project layout

```
index.html              markup + CSS for both styles; boot watchdog; loads dist/game.js
waythrough.html         generated: the same page with the script inlined
artifact/index.html     generated: page body for the hosted preview
build.mjs               esbuild bundle + the two generated pages
server.js               tiny static file server
vendor/three/           three.js r170 + the line/geometry addons used (MIT)
src/
  main.js               game states, level loading/disposal, environment per level, quality, previews, music
  levelkit.js           level-building kit: walls with doors/windows, rooms, stairs, ramps, ladders, catwalks,
                        containers, fences, props, conveyors, vents, presses, lifts, data (spawns, zones,
                        checkpoints, secrets, pickups, interactables), staged finalize + nav linking
  levels/               northgate (L1), port, metro, desert, hotel, factory, city, fortress, index.js
  mission.js            objectives, scripted actions, waves, checkpoints, scoring, stars, achievements, saving
  endless.js            Endless Mode
  player.js             movement, ladders, conveyors, two weapon slots, reload, burst fire, pickups, health
  enemies.js            roles, AI, sniper laser, heavy stagger, commander stages, civilians, ragdolls, instancing
  items.js              pickups: guns (shared instanced gun meshes), health kits, ammo boxes, secret stars
  hazards.js            conveyors, steam vents, presses, lifts, panels, destructibles, lamp flicker
  env.js                rain, snow + footprints, dust, wet-street reflections
  ui.js                 HUD, menus, Level Select, cards, settings, minimap
  i18n.js               all player-facing text
  save.js / settings.js localStorage progress and settings
  audio.js              synthesised sounds, music loops, ambience beds, echo send
  world.js nav.js doors.js builder.js materials.js textures.js fx.js bullets.js guns.js viewmodel.js input.js
tests/                  Playwright harness, objective bot and test suites
```

## Tests

The browser tests need Playwright with Chromium; SwiftShader WebGL is fine.

```sh
npm test                          # systems, pointer lock, UI flows, qualities, full campaign
node tests/systems.mjs            # movement, weapons, health, slots, enemies, checkpoints, styles, quality
node tests/campaign.mjs           # all 8 levels in sequence through the menus on Normal
                                  # (--from 4 --to 8 to run part of it)
node tests/level.mjs 5 --god      # one level with the objective bot
node tests/ui.mjs                 # menus, Level Select, cards, Endless
node tests/qualities.mjs          # every level at Low, Medium and High
node tests/views.mjs 3 "x,y,z,yaw,pitch"   # screenshots of a spot in both styles
```

## Verification

The results below come from headless Chromium with SwiftShader.

- **Campaign** (`tests/campaign.mjs`): an autopilot that follows each objective and drives the real input state played all eight levels in order on Normal, with no god mode. It started from the menu's Play button and took the results card's **Next Level** each time. When it died it pressed **Restart Checkpoint** on the death card. It also switched style twice in the middle of fights on every level.
  - After Level 3 the browser was closed and relaunched on the same profile. Progress was still there (Level 4 unlocked, Level 3's record kept), and Continue went on to Level 4.
  - Levels 4 to 8 were then played in a second run, started with `--from 4`, after a fix to the test's own click handling. The campaign-complete card appeared and Endless Mode unlocked.

  | Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Result | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
  | Deaths → Restart Checkpoint | 0 | 1 | 0 | 8 | 0 | 1 | 1 | 2 |
  | Checkpoints reached | 3 | 2 | 3 | 3 | 2 | 3 | 3 | 3 |
  | Stars | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 |

  The autopilot aims perfectly and knows every route, so its times (1 to 4 minutes a level) say nothing about how long a person takes. The 45 to 60 minute estimate for a first run is a design target and hasn't been timed with players.
- **Per level** (`tests/level.mjs`): each level also completes on its own; every objective type, checkpoint, wave, hazard and the boss stages were exercised.
- **Systems** (`tests/systems.mjs`):
  - Movement: the parapet can't be jumped, stairs don't bounce, walking up stairs works, and the ladder climbs onto the container stack.
  - Weapon cadence: SMG 0.09 s, rifle 0.125 s, the burst rifle fires 3-round bursts, the shotgun fires 8 pellets, and the pistol and revolver are semi-auto.
  - Every shot's sound starts on the same frame as its muzzle flash.
  - You can't fire during a reload.
  - Health: regeneration waits 5 s and caps at 75 on Normal and 50 on Hard; kits give +35 up to 100 and aren't used at full health.
  - Guns: 1 and 2 switch slots, and picked-up and dropped guns keep their ammo.
  - The sniper's laser shows about 1.0 s before the shot; the heavy staggers, then resists.
  - Checkpoints activate once it's calm and restore health, loadout and enemies.
  - A mid-fight style switch leaves the snapshot identical.
  - Quality presets change only rendering.
  - The conveyor carries the player and stops when its control is shut down.
- **Pointer lock** (`tests/lock.mjs`): lock on Start, Esc → pause, a refused re-lock → "Click to resume", and a sandboxed iframe → mouse-move fallback.
- **Performance:** about 45 to 145 draw calls per level (Classic is lower; Neo adds the shadow pass), everything instanced or merged per material role.

## What comes from the briefs, and what is my own

The original brief (Level 1, weapons, look, AI, the two styles) was written from gameplay footage that wasn't attached. That map, the SMG/rifle cadences, the enemy and death-card behaviour and the Classic/Neo looks follow that brief exactly; Level 1's geometry is the original, unchanged.

For the expansion, the level list, objectives and the requirements above come from the expansion brief. These are my own choices:

- all eight layouts beyond Level 1, and every number: health, damage, speeds, par times, score values and star thresholds;
- the three new guns' models and sounds;
- the music;
- the commander's positions;
- how "trenches" are built (sandbag-walled channels, since the ground is a flat plane);
- the Classic health bar's darker green/yellow/red with a dark-red trailing segment, which reconciles "dark-red fill" with the colour thresholds;
- the synthesised helicopter;
- Endless as three-wave sections.

## Credits

- three.js r170 (MIT), vendored in `vendor/three/`.
- Everything else, including code, geometry, textures, sound and music, is in this repository.
