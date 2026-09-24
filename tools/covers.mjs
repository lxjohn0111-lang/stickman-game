// Store covers for CrazyGames, rendered by the game itself: landscape
// 1920x1080, portrait 800x1200 and square 800x800, in the Neobrutalist style
// with the handwritten title. Output: 'crazygames upload/covers/'.
import fs from 'node:fs';
import { open, stage, placeEnemies, step } from './stage.mjs';
import { root } from '../tests/harness.mjs';

const out = `${root}/crazygames upload/covers`;
fs.mkdirSync(out, { recursive: true });
const only = process.argv[2];

const SIZES = [
  ['cover-landscape-1920x1080.png', 1920, 1080, { title: 150, left: 70, top: 60 }],
  ['cover-portrait-800x1200.png', 800, 1200, { title: 116, center: true, top: 70 }],
  ['cover-square-800x800.png', 800, 800, { title: 104, center: true, top: 36 }],
];
const CAM = { p: [0.8, 1.62, 40], yaw: 0.05, pitch: 0.08 };
const ENEMIES = [{ f: 5, s: -1.1 }, { f: 7.8, s: 1.5 }, { f: 11.5, s: -2 }];

for (const [file, w, h, t] of SIZES) {
  if (only && !file.includes(only)) continue;
  const { browser, page } = await open({ width: w, height: h });
  await stage(page, { level: 2, style: 'neo', cam: CAM, hud: false });
  await placeEnemies(page, ENEMIES);
  await step(page, 14);
  // mid-burst: the last rendered frame has the muzzle flash and a tracer
  await page.evaluate(() => { const g = WT.game; g.input.left = true; g.player.pitch = 0.08; for (let i = 0; i < 4; i++) g.step(1 / 60); });
  await page.evaluate((t) => {
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;left:${t.center ? '50%' : t.left + 'px'};top:${t.top}px;padding:${t.title * 0.12}px ${t.title * 0.22}px ${t.title * 0.06}px;background:#fffdf2;border:${Math.round(t.title / 22)}px solid #000;box-shadow:${Math.round(t.title / 12)}px ${Math.round(t.title / 12)}px 0 #000;color:#000;transform:${t.center ? 'translateX(-50%) ' : ''}rotate(-2deg)`;
    box.appendChild(WT.handwrite('One way out', { height: t.title, stroke: 7, animate: false, seed: 11 }));
    document.body.appendChild(box);
  }, t);
  await page.screenshot({ path: `${out}/${file}` });
  console.log('wrote', file);
  await browser.close();
}
