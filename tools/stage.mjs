// Shared helpers for the store media (covers, preview videos): put the game
// in a level, place the camera and some enemies, and render frames on demand.
import { launch } from '../tests/harness.mjs';

export async function open({ width, height }) {
  const r = await launch({ width, height, query: 'nolock' });
  await r.page.evaluate(() => { const g = WT.game; g.manual = true; g.settings.quality = 'high'; g.settings.fov = 75; g.applySettings(false); });
  return r;
}

// Load level n in `style`, enter play with god mode, camera at cam.
export async function stage(page, { level, style = 'neo', cam = null, hud = true, bot = false }) {
  await page.evaluate(({ level, style }) => { const g = WT.game; g.setStyle(style, false); g.startLevel(level); }, { level, style });
  await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
  await page.evaluate(({ cam, hud }) => {
    const g = WT.game;
    g.beginLevel();
    if (g.state !== 'playing') g._enterPlaying();
    g.ui.hideOverlay();
    g.godMode = true;
    document.getElementById('hud').style.visibility = hud ? '' : 'hidden';
    if (cam) {
      const P = g.player;
      P.body.x = cam.p[0]; P.body.y = cam.p[1] - 1.62; P.body.z = cam.p[2];
      P.body.vx = P.body.vy = P.body.vz = 0;
      P.yaw = cam.yaw; P.pitch = cam.pitch;
    }
  }, { cam, hud });
}

// Move alive enemies to spots in front of the player: [{f, s}] = metres
// forward / to the right. They face the player and aim.
export async function placeEnemies(page, spots) {
  await page.evaluate((spots) => {
    const g = WT.game, P = g.player;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const es = g.enemies.list.filter((e) => e.alive && !e.civilian && !e.R.boss);
    spots.forEach((sp, i) => {
      const e = es[i];
      if (!e) return;
      e.body.x = P.body.x + fx * sp.f + rx * sp.s;
      e.body.z = P.body.z + fz * sp.f + rz * sp.s;
      e.body.y = sp.y !== undefined ? sp.y : P.body.y;
      e.body.vx = e.body.vz = 0;
      e.path = null;
      if (g.enemies.alert) g.enemies.alert(e); else e.state = 'combat';
    });
  }, spots);
}

export const step = (page, n, dt = 1 / 60) => page.evaluate(({ n, dt }) => { const g = WT.game; for (let i = 0; i < n; i++) g.step(dt); }, { n, dt });
