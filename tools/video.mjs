// Silent gameplay preview videos for CrazyGames (under 20 s): six 3-second
// clips of real play from different levels, recorded frame by frame from the
// game (the objective autopilot from tests/bot2.js plays), encoded to H.264
// MP4 with no audio track.
//   node tools/video.mjs landscape   -> 1920x1080
//   node tools/video.mjs portrait    -> 1080x1620
// Needs an ffmpeg binary: FFMPEG=/path/to/ffmpeg, or `pip install imageio-ffmpeg`.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { open, stage } from './stage.mjs';
import { root } from '../tests/harness.mjs';

const kind = process.argv[2] || 'landscape';
const [W, H] = kind === 'portrait' ? [1080, 1620] : [1920, 1080];
const FPS = 30;
const CLIP = 3; // seconds per clip
const CLIPS = [
  { level: 2, style: 'neo' },
  { level: 7, style: 'neo' },
  { level: 1, style: 'classic', switchAt: 1.4 }, // switches to Neo mid-fight
  { level: 6, style: 'neo' },
  { level: 4, style: 'neo' },
  { level: 8, style: 'neo', skip: 25 },
];

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return execFileSync('python3', ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())']).toString().trim(); } catch (e) { /* none */ }
  return 'ffmpeg';
}

const frames = `${root}/test-output/frames-${kind}`;
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });
const { browser, page } = await open({ width: W, height: H });
await page.addScriptTag({ content: fs.readFileSync(`${root}/tests/bot2.js`, 'utf8') });
let idx = 0;
for (const clip of CLIPS) {
  await stage(page, { level: clip.level, style: clip.style, hud: true });
  // play on fast-forward (no rendering) until the autopilot is in a fight
  const t = await page.evaluate(({ skip }) => {
    const g = WT.game;
    BOT2.st.path = null; BOT2.st.lastIndex = -1;
    g.noRender = true;
    let fought = 0;
    for (let i = 0; i < 60 * 240; i++) {
      BOT2.step(); g.step(1 / 60);
      if (g.state !== 'playing') break;
      if (g.time < skip) continue;
      // an enemy in view and close enough to see clearly
      const v = BOT2.visibleEnemy(18);
      if (v && BOT2.st.target !== null && g.enemies.anyInCombat()) fought++; else fought = Math.max(0, fought - 1);
      if (fought > 12) break;
    }
    g.noRender = false;
    g.ui.hideOverlay();
    return +g.time.toFixed(1);
  }, { skip: clip.skip || 0 });
  console.log(`L${clip.level} ${clip.style}: fight found at ${t}s`);
  for (let f = 0; f < CLIP * FPS; f++) {
    await page.evaluate(({ f, sw }) => {
      const g = WT.game;
      if (sw && f === sw) g.setStyle(g.style === 'neo' ? 'classic' : 'neo');
      g.noRender = true;
      BOT2.step(); g.step(1 / 60);
      g.noRender = false;
      BOT2.step(); g.step(1 / 60);
    }, { f, sw: clip.switchAt ? Math.round(clip.switchAt * FPS) : 0 });
    await page.screenshot({ path: `${frames}/${String(idx++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
}
await browser.close();

const outDir = `${root}/crazygames upload/video`;
fs.mkdirSync(outDir, { recursive: true });
const out = `${outDir}/one-way-out-${kind}-${W}x${H}.mp4`;
execFileSync(ffmpegPath(), ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/%05d.jpg`,
  '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${idx} frames = ${(idx / FPS).toFixed(1)} s)`);
