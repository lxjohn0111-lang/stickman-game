// Every piece of player-facing text lives here so the game can be translated
// by adding another language table. t('key', {n: 3}) fills {n} placeholders.

const en = {
  // ---- general
  'game.title': 'One way out',
  'game.sub': 'a stickman shooter',
  'loading': 'Loading',
  'loading.error': 'Could not start: {msg} (WebGL is required)',
  'loading.missing': 'The game script (dist/game.js) did not load. Keep index.html next to the dist folder, or open onewayout.html instead.',

  // ---- menu
  'menu.play': 'Play',
  'menu.continue': 'Continue',
  'menu.armory': 'Armory',
  'menu.levels': 'Level Select',
  'menu.endless': 'Endless Mode',
  'menu.style': 'Visual Style',
  'menu.controls': 'Controls',
  'menu.settings': 'Settings',
  'menu.howto': 'How to Play',
  'menu.achievements': 'Achievements',
  'menu.credits': 'Credits',
  'menu.resume': 'Resume',
  'menu.mission': 'Mission',
  'menu.restartCheckpoint': 'Restart Checkpoint',
  'menu.restartLevel': 'Restart Level',
  'menu.main': 'Main Menu',
  'menu.paused': 'paused',
  'menu.playLevel': 'Level {n}: {name}',

  // ---- level select
  'levels.title': 'Level Select',
  'levels.locked': 'Locked',
  'levels.lockedHint': 'Finish level {n} to unlock',
  'levels.best': 'Best',
  'levels.time': 'Time',
  'levels.none': '-',
  'levels.play': 'Play',
  'levels.replay': 'Replay',
  'levels.hint': 'Levels unlock in order. Finished levels can be replayed any time; the best score, time and stars are kept.',
  'levels.difficulty': 'Difficulty',

  // ---- endless
  'endless.title': 'Endless Mode',
  'endless.locked': 'Finish the campaign to unlock Endless Mode.',
  'endless.desc': 'Fight through shuffled sections of the campaign maps. Each wave is tougher than the last. It ends when you die.',
  'endless.best': 'Best wave {w} · best score {s}',
  'endless.start': 'Start Endless',
  'endless.wave': 'Wave {n}',
  'endless.section': 'Section {n}: {name}',
  'endless.clear': 'Section clear',
  'endless.next': 'Next section in {s}',
  'endless.over': 'Endless over',
  'endless.reached': 'Wave reached',

  // ---- style
  'style.title': 'Visual Style',
  'style.classic': 'Classic',
  'style.classic.d': 'White unlit surfaces, thin black ink edges, solid black stickmen.',
  'style.neo': 'Neobrutalist',
  'style.neo.d': 'Saturated colours, 3 px outlines, toon shading and hard sun shadows.',
  'style.hint': 'Previews are rendered from the game itself. Press V during play to switch instantly; your choice is saved.',
  'style.toast': 'Style: {name}',

  // ---- controls
  'controls.title': 'Controls',
  'controls.move': 'Move',
  'controls.look': 'Look',
  'controls.fire': 'Fire (hold for automatic weapons)',
  'controls.aim': 'Steady aim (hold)',
  'controls.jump': 'Jump',
  'controls.sprint': 'Sprint',
  'controls.crouch': 'Crouch (hold). Left Ctrl works too',
  'controls.interact': 'Interact: doors, switches, swap guns, take ammo',
  'controls.reload': 'Reload',
  'controls.switch': 'Main weapon / sidearm',
  'controls.climb': 'Climb ladders: walk into them',
  'controls.style': 'Toggle visual style (Classic / Neobrutalist)',
  'controls.pause': 'Pause',
  'controls.fallback': 'Pointer lock is unavailable here, so the game is using plain mouse-move look.',

  // ---- settings
  'settings.title': 'Settings',
  'settings.sensitivity': 'Mouse sensitivity',
  'settings.invertY': 'Invert Y',
  'settings.fov': 'Field of view',
  'settings.master': 'Master volume',
  'settings.music': 'Music volume',
  'settings.sfx': 'Effects volume',
  'settings.ambience': 'Ambience volume',
  'settings.difficulty': 'Difficulty',
  'settings.shake': 'Screen shake',
  'settings.viewBob': 'View bob',
  'settings.quality': 'Quality',
  'settings.ammo': 'Ammo readout',
  'settings.fps': 'FPS counter',
  'settings.fullscreen': 'Fullscreen',
  'settings.off': 'Off',
  'settings.on': 'On',
  'settings.superEasy': 'Super Easy',
  'settings.easy': 'Easy',
  'settings.normal': 'Normal',
  'settings.hard': 'Hard',
  'settings.low': 'Low',
  'settings.medium': 'Medium',
  'settings.high': 'High',
  'settings.qualityHint': 'Quality changes shadow resolution, particles, decals and outline detail. It never changes gameplay.',
  'settings.diffHint': 'Difficulty changes enemy health, accuracy, reaction time, damage, pickups and health regeneration. The maps never change.',
  'settings.enter': 'Enter',
  'settings.exit': 'Exit',

  // ---- touch devices (used instead of the key above them on phones/tablets)
  'load.start.touch': 'Tap to play',
  'clicklock.play.touch': 'Tap to play',
  'tut.shoot.touch': 'Tap <kbd>&#8853;</kbd> to shoot him',
  'tut.ammo.touch': 'Watch your ammo · tap <kbd>&#8635;</kbd> to reload',
  'hint.reload.touch': 'Tap <kbd>&#8635;</kbd> to reload before you run dry',
  'hint.switch.touch': 'Out of ammo? Tap <kbd>&#8646;</kbd> to switch weapon',
  'hint.sprint.touch': 'Push the stick to the edge to sprint',
  'hint.aim.touch': 'Tap <kbd>&#9678;</kbd> for a steadier aim',
  'hint.pickup.touch': 'Tap the prompt to grab his gun',
  'style.hint.touch': 'Previews are rendered from the game itself. You can switch style from the pause menu during play; your choice is saved.',
  'howto.body.touch': '<p>Eight levels, each with its own objective. Follow the objective at the top left; the diamond marker shows where to go.</p><p><b>Controls.</b> Drag anywhere on the left half to move (push to the edge to sprint) and drag on the right half to look. Hold the big button to fire; a light aim assist helps while you shoot. When a door, switch or gun is in front of you, a button with its action appears: tap it.</p><p><b>Fight smart.</b> Enemies notice you gradually, fight in bursts, chase you through doors and search where they last saw you. Headshots do 2.5&times; damage. Snipers show a red laser for about a second before they fire: move.</p><p><b>Health.</b> It regenerates after 5 seconds out of fire, up to a limit set by the difficulty. Health kits restore 35.</p><p><b>Difficulty.</b> The game starts on <b>Super Easy</b>, where the enemies mostly shoot wide, take their time about it and stay roughly where they are. Easy, Normal and Hard are in Settings and on the Level Select screen, and you can switch whenever you like.</p><p><b>Checkpoints</b> activate once nearby fighting is over. <b>Secrets:</b> three hidden stars per level reward exploring. <b>Stars:</b> finish a level for one, score well for two or three.</p>',
  'touch.move': 'Drag on the left half',
  'touch.movem': 'Move (push to the edge to sprint)',
  'touch.look': 'Drag on the right half',
  'touch.lookm': 'Look around',
  'touch.fire': 'Fire (hold for automatic weapons)',
  'touch.aim': 'Steady aim (toggle)',
  'touch.jump': 'Jump; let go of a ladder',
  'touch.crouch': 'Crouch (toggle)',
  'touch.reload': 'Reload',
  'touch.swap': 'Switch main weapon / sidearm',
  'touch.use': 'Doors, switches, swap guns, take ammo (appears when available)',
  'touch.pause': 'Pause, style, settings',
  'touch.ladder': 'Climb ladders: push forward into them',
  'settings.aimAssist': 'Aim assist (touch)',
  'settings.touchSize': 'Touch button size',
  'settings.portalMuted': 'Sound is muted by the site settings.',
  'rotate.title': 'Turn your device',
  'rotate.body': 'One Way Out plays in landscape.',

  // ---- how to
  'howto.title': 'How to Play',
  'howto.body': '<p>Eight levels, each with its own objective. Follow the objective at the top left; the diamond marker shows where to go.</p><p><b>Fight smart.</b> Enemies notice you gradually, fight in bursts, chase you through doors and search where they last saw you. Headshots do 2.5&times; damage. Snipers show a red laser for about a second before they fire: move.</p><p><b>Dodge.</b> Enemy bullets are slow teardrops. Watch them come and side-step.</p><p><b>Health.</b> The bar at the bottom left shows your health. It regenerates after 5 seconds out of fire, up to a limit set by the difficulty. Health kits restore 35.</p><p><b>Weapons.</b> You carry a main weapon and a sidearm; press 1 and 2 to switch. Fallen enemies drop their gun with its remaining ammo: press F to swap, or to take its ammo if you carry the same gun.</p><p><b>Difficulty.</b> The game starts on <b>Super Easy</b>, where the enemies mostly shoot wide, take their time about it and stay roughly where they are. Easy, Normal and Hard are in Settings and on the Level Select screen, and you can switch whenever you like.</p><p><b>Checkpoints</b> activate once nearby fighting is over. <b>Secrets:</b> three hidden stars per level reward exploring.</p><p><b>Stars.</b> Finish a level for one star; score well for two or three. Score comes from kills, headshots, accuracy, speed and remaining health, and consecutive kills without taking damage build a combo.</p>',

  // ---- achievements
  'ach.title': 'Achievements',
  'ach.campaign': 'One Way Out',
  'ach.campaign.d': 'Complete all eight levels.',
  'ach.secrets': 'Explorer',
  'ach.secrets.d': 'Find every secret in the campaign.',
  'ach.flawless': 'Untouched',
  'ach.flawless.d': 'Finish a level without taking damage.',
  'ach.hard': 'The Hard Way Out',
  'ach.hard.d': 'Complete the campaign on Hard.',
  'ach.unlocked': 'Unlocked',
  'ach.locked': 'Locked',
  'ach.toast': 'Achievement: {name}',
  'ach.progress': '{n} of {m}',

  // ---- credits
  'credits.title': 'Credits',
  'credits.body': '<p><b>One Way Out</b>: a first-person stickman shooter campaign.</p><p>Rendering: three.js r170 (MIT), bundled with esbuild.</p><p>Art: none on disk. Every object is built at load time from boxes, cylinders and cones, and outlined with screen-space ink lines.</p><p>Sound and music: none on disk. Everything is synthesised with the Web Audio API.</p>',

  // ---- HUD
  'hud.health': 'Health',
  'hud.checkpoint': 'Checkpoint',
  'hud.secret': 'Secret {n} of {m}',
  'hud.objective': 'Objective',
  'hud.combo': 'Combo x{m}',
  'hud.reloading': 'reloading',
  'hud.ammo': '+{n} ammo',
  'hud.ammoFor': '+{n} {name} ammo',
  'hud.healed': '+{n} health',
  'hud.full': 'Health full',
  'hud.lowPerf': 'The game is running slowly. Try a lower Quality in Settings.',
  'hud.survive': 'Hold for {s}',
  'hud.boss': 'Commander',
  'hud.reinforce': 'Reinforcements incoming',
  'hud.locked': 'Locked',

  // ---- weapons
  'weapon.smg': 'SMG',
  'weapon.shotgun': 'Pump Shotgun',
  'weapon.rifle': 'AK Rifle',
  'weapon.burst': 'Burst Rifle',
  'weapon.pistol': 'Pistol',
  'weapon.mpistol': 'Auto Pistol',
  'weapon.revolver': 'Revolver',
  'toast.took': 'Picked up {gun}',
  'toast.ammo': '+{n} {gun} ammo',
  'toast.ammoFull': 'Ammo full',
  'toast.health': '+35 health',

  // ---- prompts
  'prompt.lockedToast': 'Locked. Find another way.',
  'prompt.open': 'Open',
  'prompt.close': 'Close',
  'prompt.swap': 'Swap {name}',
  'prompt.take': 'Take {name} ammo',
  'prompt.use': 'Use',
  'prompt.locked': 'Locked',
  'prompt.power': 'Restore power',
  'prompt.gate': 'Open security gate',
  'prompt.charge': 'Plant charge',
  'prompt.free': 'Free the civilian',
  'prompt.exit': 'Open courtyard exit',
  'prompt.control': 'Shut down',
  'prompt.lift': 'Call freight elevator',
  'prompt.alarm': 'Disable alarm',

  // ---- overlay (level 1)

  // ---- tips (level 1 teaches the basics)

  // ---- loading card
  'load.level': 'Level {n}',
  'load.start': 'Click to play',
  'load.building': 'Building level',
  'load.ready': 'Ready',

  // ---- death card
  'death.title': 'No way out.',
  'death.checkpoint': 'Restart Checkpoint',
  'death.level': 'Restart Level',
  'death.main': 'Main Menu',

  // ---- results card
  'res.title': 'Way out.',
  'res.campaign': 'Campaign complete.',
  'res.time': 'Time',
  'res.kills': 'Kills',
  'res.headshots': 'Headshots',
  'res.accuracy': 'Accuracy',
  'res.damage': 'Damage taken',
  'res.secrets': 'Secrets',
  'res.score': 'Score',
  'res.best': 'Best',
  'res.new': 'new',
  'res.newBest': 'New best',
  'res.next': 'Next Level',
  'res.replay': 'Replay',
  'res.main': 'Main Menu',
  'res.endlessUnlocked': 'Endless Mode unlocked',
  'res.campaignStats': 'Campaign total: {time} · {kills} kills · {secrets} secrets · {score} points',
  'res.endless': 'Endless',

  'clicklock.title': 'Click to resume',
  'clicklock.play': 'Click to play',

  // ---- weapon skins (skins.js), the Armory and the results card's goals
  'armory.title': 'Armory',
  'armory.stars': '{n} of {m} stars collected. Stars unlock skins for every gun.',
  'armory.wear': 'Wear',
  'armory.worn': 'Worn',
  'skin.standard': 'Standard',
  'skin.carbon': 'Carbon',
  'skin.tiger': 'Tiger',
  'skin.arctic': 'Arctic',
  'skin.gold': 'Gold',
  'skin.plasma': 'Plasma',
  'skin.ion': 'Ion',
  'skin.ghost': 'Ghost',
  'res.newSkin': 'New skin: {name}',
  'res.skinOn': 'On your guns now. Change it in the Armory.',
  'res.toSkin': '{n} more &#9733; unlocks {name}',
  'res.nextStar': '+{n} points for the next &#9733; here',
  'res.upNext': 'Up next: {name}',
  'res.newEnemy': 'new enemy: {name}',
  'enemy.runt': 'the Runt',
  'enemy.brute': 'the Brute',

  // ---- first-kill tutorial (see tutorial.js): one short line at a time
  'tut.shoot': '<kbd>Click</kbd> Shoot him',
  'tut.ammo': 'Watch your ammo · <kbd>R</kbd> reload',

  // ---- onboarding: one line, once, at the moment it matters (see hints.js)
  'hint.reload': '<kbd>R</kbd> Reload before you run dry',
  'hint.switch': '<kbd>Q</kbd> Out of ammo? Switch weapon',
  'hint.sprint': 'Hold <kbd>Shift</kbd> to sprint',
  'hint.aim': 'Hold <kbd>Right click</kbd> for a steadier aim',
  'hint.head': 'Aim for the head: 2.5&times; damage',
  'hint.cover': 'Get out of fire: health comes back on its own',
  'hint.pickup': '<kbd>F</kbd> Grab his gun',
  'hint.checkpoint': 'Checkpoint: if you go down, you restart here',
  'hint.runt': 'Runts are small and fast: keep moving',
  'hint.brute': 'Brutes charge: step aside!',

  // ---- levels
  'L1.name': 'North Gate',
  'L1.goal': 'Cross the roof, fight through the kitchen and canteen, enter the fenced yard and escape through the North Gate.',
  'L1.o1': 'Get off the roof: find the stair hut',
  'L1.o2': 'Fight through the kitchen and canteen',
  'L1.o3': 'Cross the yard to the water tower',
  'L1.o4': 'Escape through the North Gate',

  'L2.name': 'Container Port',
  'L2.goal': 'Fight through the container stacks, reach the harbour control room and open the security gate.',
  'L2.o1': 'Cross the container yard to the warehouse',
  'L2.o2': 'Reach the harbour control room',
  'L2.o3': 'Open the security gate from the control room',
  'L2.o4': 'Leave through the security gate',

  'L3.name': 'Underground Station',
  'L3.goal': 'Restore power in both electrical rooms, then reach the maintenance exit.',
  'L3.o1': 'Go down to the platforms',
  'L3.o2': 'Restore power: west electrical room',
  'L3.o3': 'Restore power: east electrical room',
  'L3.o4': 'Reach the maintenance exit',

  'L4.name': 'Desert Outpost',
  'L4.goal': 'Destroy the three radio transmitters and escape through the vehicle checkpoint.',
  'L4.o1': 'Destroy the radio transmitters ({n}/3)',
  'L4.o2': 'Escape through the vehicle checkpoint',

  'L5.name': 'Mountain Hotel',
  'L5.goal': 'Clear the upper floors, rescue the trapped civilian and open the courtyard exit.',
  'L5.o1': 'Get into the hotel lobby',
  'L5.o2': 'Clear the upper floors ({n} left)',
  'L5.o3': 'Free the trapped civilian',
  'L5.o4': 'Open the courtyard exit',
  'L5.o5': 'Get out through the courtyard gate',

  'L6.name': 'Industrial Factory',
  'L6.goal': 'Shut down the three production controls and reach the freight elevator.',
  'L6.o1': 'Shut down the production controls ({n}/3)',
  'L6.o2': 'Call the freight elevator',
  'L6.o3': 'Hold out until the elevator arrives',
  'L6.o4': 'Ride the freight elevator',

  'L7.name': 'Rainy City Block',
  'L7.goal': 'Cross the district and reach the extraction point on the parking garage roof.',
  'L7.o1': 'Cross the district to the parking garage',
  'L7.o2': 'Reach the garage roof',
  'L7.o3': 'Defend the extraction zone',
  'L7.o4': 'Board the helicopter',
  'L7.heli': 'The helicopter is here: get aboard',

  'L8.name': 'Island Fortress',
  'L8.goal': 'Disable the fortress alarm, enter the command tower and defeat the commander.',
  'L8.o1': 'Reach the central courtyard',
  'L8.o2': 'Disable the fortress alarm',
  'L8.o3': 'Enter the command tower',
  'L8.o4': 'Defeat the commander',
};

const LANGS = { en };
let lang = 'en';

export function setLanguage(code) {
  if (LANGS[code]) lang = code;
}

// On touch devices, a 'key.touch' entry (if there is one) replaces 'key'.
let variant = '';
export function setVariant(v) { variant = v || ''; }

export function t(key, vars) {
  const L = LANGS[lang] || en;
  let s = variant ? (L[key + '.' + variant] ?? en[key + '.' + variant]) : undefined;
  if (s === undefined) s = L[key] ?? en[key];
  if (s === undefined) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}

export function has(key) {
  return key in en;
}
