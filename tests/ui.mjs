// Screens and flows: menu, Level Select (previews, locks, stars), settings,
// achievements, loading card, pause, death card, results card, Endless Mode.
// Screenshots go to test-output/ui-*.png.
import { launch, root } from './harness.mjs';

const { browser, page, logs } = await launch();
const shot = (n) => page.screenshot({ path: `${root}/test-output/ui-${n}.png`, timeout: 180000 });
const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info ?? '')}`); if (!ok) fails.push(name); };

// a save with some progress: levels 1-3 done, 4 unlocked
await page.evaluate(() => {
  const p = WT.progress;
  WT.resetProgress();
  p.unlocked = 4; p.last = 4;
  p.levels[1] = { completed: true, bestScore: 5200, bestTime: 312, stars: 3, secrets: [true, true, false], noDamage: false, kills: 20 };
  p.levels[2] = { completed: true, bestScore: 4100, bestTime: 405, stars: 2, secrets: [false, true, false], noDamage: false, kills: 23 };
  p.levels[3] = { completed: true, bestScore: 2600, bestTime: 470, stars: 1, secrets: [false, false, false], noDamage: false, kills: 18 };
  WT.game.ui.show('menu');
});
for (const style of ['classic', 'neo']) {
  await page.evaluate((s) => WT.game.setStyle(s, false), style);
  await page.$eval('nav.menu-nav button[data-sec=levels]', (el) => el.click());
  // previews render in the background
  await page.waitForFunction(() => document.querySelectorAll('.lcard .pv:not(.pending)').length >= 8, null, { timeout: 600000 });
  await page.waitForTimeout(300);
  await shot(`levels-${style}`);
}
const cards = await page.evaluate(() => [...document.querySelectorAll('.lcard')].map((c) => ({ locked: c.classList.contains('locked'), next: c.classList.contains('next'), text: c.innerText.replace(/\s+/g, ' ') })));
check('8 level cards, 4 playable, level 4 is next', cards.length === 8 && cards.filter((c) => !c.locked).length === 4 && cards[3].next, cards.map((c) => c.text));
check('play button continues level 4', (await page.innerText('#btn-play')).includes('4'), await page.innerText('#btn-play'));
for (const sec of ['settings', 'achievements', 'endless', 'style', 'controls', 'howto']) {
  await page.click(`nav.menu-nav button[data-sec=${sec}]`);
  await page.waitForTimeout(200);
  await shot(`menu-${sec}`);
  if (sec === 'endless') check('endless locked before the campaign is won', (await page.textContent('#menu-panel')).includes('Finish the campaign'), '');
}


// hover/focus states exist on buttons (computed style changes on hover).
// SwiftShader draws the 3D menu backdrop slowly, so transitions are switched
// off for this check and the hover state is read directly.
await page.addStyleTag({ content: 'nav.menu-nav button { transition: none !important; }' });
await page.mouse.move(640, 700);
await page.waitForFunction(() => !document.querySelector('nav.menu-nav button[data-sec=controls]').matches(':hover'), null, { timeout: 60000 });
const hover = await page.evaluate(() => getComputedStyle(document.querySelector('nav.menu-nav button[data-sec=controls]')).backgroundColor);
await page.hover('nav.menu-nav button[data-sec=controls]');
await page.waitForFunction(() => document.querySelector('nav.menu-nav button[data-sec=controls]').matches(':hover'), null, { timeout: 60000 });
const hover2 = await page.evaluate(() => getComputedStyle(document.querySelector('nav.menu-nav button[data-sec=controls]')).backgroundColor);
check('buttons react to hover', hover !== hover2, [hover, hover2]);

// loading card -> start
await page.evaluate(() => { WT.game.manual = true; });
await page.$eval('nav.menu-nav button[data-sec=levels]', (el) => el.click());
await page.$eval('.lcard:nth-child(2)', (el) => el.click());
await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
await shot('loading-card');
const lc = (await page.textContent('#loadcard')).replace(/\s+/g, ' ');
check('loading card: name, objective, controls', /container port/i.test(lc) && lc.includes('Objective') && lc.includes('WASD'), lc.slice(0, 200));
await page.$eval('#lc-start', (el) => el.click());
await page.evaluate(() => { const g = WT.game; if (g.state === 'lockwait') g._enterPlaying(); for (let i = 0; i < 30; i++) g.step(1 / 60); });
await shot('hud');
// damage feedback: health bar + trailing segment + direction text
await page.evaluate(() => { const g = WT.game; g.player.damage(30, g.player.x - 5, g.player.z, 'test'); for (let i = 0; i < 6; i++) g.step(1 / 60); });
const hud = await page.evaluate(() => ({ num: document.querySelector('#health .num').textContent, fill: document.getElementById('hpfill').style.width, trail: document.getElementById('hptrail').style.width, hit: document.querySelector('#hitdir span').textContent }));
check('health bar shows "70 / 100" with a trailing segment', hud.num === '70 / 100' && parseFloat(hud.trail) > parseFloat(hud.fill), hud);
check('hit direction text', /^HIT - (AHEAD|LEFT|RIGHT|BEHIND)$/.test(hud.hit), hud.hit);
await shot('hud-hit');
await page.evaluate(() => { const g = WT.game; g.player.damage(50, g.player.x, g.player.z + 5, 'test'); for (let i = 0; i < 10; i++) g.step(1 / 60); });
const low = await page.evaluate(() => document.getElementById('health').className);
check('low health bar turns red', low.includes('low'), low);
await shot('hud-low');

// pause (focus loss) -> pause menu with checkpoint/level/menu
await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
const paused = await page.evaluate(() => WT.game.state);
check('focus loss pauses the game', paused === 'paused', paused);
await shot('pause');
await page.$eval('#pause nav button[data-go=resume]', (el) => el.click());
await page.evaluate(() => { const g = WT.game; if (g.state === 'lockwait' && g.input.fallback) g._enterPlaying(); });

// death card
await page.evaluate(() => { const g = WT.game; if (g.state !== 'playing') g._enterPlaying(); g.player.damage(999, g.player.x, g.player.z - 5, 'test'); for (let i = 0; i < 180; i++) g.step(1 / 60); });
await shot('death');
const death = (await page.textContent('#death')).toLowerCase();
check('death card offers checkpoint, level, menu', death.includes('restart checkpoint') && death.includes('restart level') && death.includes('main menu'), death);
await page.$eval('#death-btns .btn-ghost', (el) => el.click());
await page.evaluate(() => { const g = WT.game; if (g.state === 'lockwait') g._enterPlaying(); });
check('restart level', await page.evaluate(() => WT.game.state === 'playing' && WT.game.player.health === 100 && WT.game.mission.index === 0), '');

// results card: complete the level instantly
await page.evaluate(() => { const m = WT.game.mission; m.index = m.objectives.length - 1; m.obj = m.objectives[m.index]; m._complete(); });
await page.waitForTimeout(300);
await shot('results');
const res = (await page.textContent('#results')).toLowerCase();
check('results card lists stats and buttons', ['Time', 'Kills', 'Headshots', 'Accuracy', 'Damage taken', 'Secrets', 'Score', 'Next Level', 'Replay', 'Main Menu'].every((k) => res.includes(k.toLowerCase())), res.replace(/\s+/g, ' '));

// finishing level 8 unlocks Endless; then an Endless run
await page.evaluate(() => { const p = WT.progress; p.campaignWon = true; p.unlocked = 8; });
await page.$eval('#res-btns .btn-ghost:last-child', (el) => el.click());
await page.$eval('nav.menu-nav button[data-sec=endless]', (el) => el.click());
await shot('endless-menu');
await page.$eval('#menu-panel .btn-try', (el) => el.click());
await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
await page.$eval('#lc-start', (el) => el.click());
// step in chunks so the async section loads can run between them
let endless;
for (let chunk = 0; chunk < 40; chunk++) {
  await page.waitForFunction(() => WT.game.state !== 'loading', null, { timeout: 300000 });
  endless = await page.evaluate(() => {
    const g = WT.game;
    if (g.state === 'ready' || g.state === 'lockwait') g._enterPlaying();
    g.godMode = true; g.noRender = true;
    for (let i = 0; i < 300 && g.state === 'playing'; i++) {
      g.step(1 / 60);
      // kill each wave as it arrives
      if (i % 30 === 0) for (const e of g.enemies.list) if (e.alive && !e.civilian) g.enemies.damage(e, 9999, 'head', new WT.THREE.Vector3(e.body.x, 1.6, e.body.z), new WT.THREE.Vector3(0, 0, -1));
    }
    g.noRender = false;
    return { wave: g.endless.wave, score: g.endless.score, section: g.endless.section, level: g.level && g.level.def.id, state: g.state };
  });
  if (endless.wave >= 5 && endless.section >= 1 && endless.state === 'playing') break;
}
await page.evaluate(() => WT.game.step(1 / 60));
check('endless waves rise and sections change', endless.wave >= 4 && endless.section >= 1, endless);
await shot('endless');
const over = await page.evaluate(() => { const g = WT.game; g.godMode = false; g.player.damage(999, g.player.x, g.player.z, 'test'); for (let i = 0; i < 200; i++) g.step(1 / 60); return { best: WT.progress.endless, state: g.state }; });
check('endless ends on death and saves the best wave', over.best.bestWave >= 4, over);
await shot('endless-over');

// every handwritten title has a glyph for each letter
const hw = await page.evaluate(() => [...document.querySelectorAll('svg.hw')].map((s) => [s.getAttribute('aria-label'), s.querySelectorAll('g').length, s.getAttribute('aria-label').replace(/ /g, '').length]));
check('handwritten titles have every glyph', hw.length >= 3 && hw.every(([, a, b]) => a === b), hw);

const errs = logs.filter((l) => l.startsWith('pageerror'));
check('no page errors', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'all ui checks passed');
process.exit(fails.length ? 1 : 0);
