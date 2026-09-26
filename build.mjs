// Bundles src/ + the vendored three.js into one classic (non-module) script:
// dist/game.js. index.html loads it with a plain <script> tag, so the game
// runs straight from file:// with no server.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev');
// One upload folder per portal. Each build carries only its own SDK script,
// so the two are completely independent: src/platform.js picks whichever SDK
// is on the page. Editing one portal's adapter can't affect the other build.
const PORTALS = [
  { dir: 'crazygames upload', sdk: 'https://sdk.crazygames.com/crazygames-sdk-v3.js' },
  { dir: 'poki upload', sdk: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js' },
];


const options = {
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(root, 'dist/game.js'),
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  alias: { three: path.join(root, 'vendor/three/three.module.js') },
  banner: { js: '/* One Way Out - bundled with three.js r170 (MIT, see vendor/three/LICENSE) */' },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('watching src/ ...');
} else {
  await esbuild.build(options);
  packagePages();
  for (const p of PORTALS) packagePortal(p);
}

// A portal build: '<portal> upload/game/' holds exactly the files to upload
// (index.html + game.js). It is index.html with that portal's SDK loaded first
// in <head>; src/platform.js picks it up at boot.
function packagePortal({ dir, sdk }) {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const tag = '<script src="dist/game.js" onerror="window.__wtBootFail && window.__wtBootFail()"></script>';
  const missing = /The game script \(dist\/game\.js\) did not load\.[^']*'/;
  if (!html.includes(tag) || !missing.test(html)) throw new Error('index.html markers not found');
  html = html
    .replace('<meta charset="utf-8">', () => `<meta charset="utf-8">\n<script src="${sdk}"></script>`)
    .replace(tag, () => '<script src="game.js" onerror="window.__wtBootFail && window.__wtBootFail()"></script>')
    .replace(missing, () => "The game could not be loaded. Please reload the page.'");
  const out = path.join(root, dir, 'game');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.copyFileSync(path.join(root, 'dist/game.js'), path.join(out, 'game.js'));
  const kb = (p) => Math.round(fs.statSync(p).size / 1024);
  console.log(`  ${dir}/game/ written (index.html + game.js, ${kb(path.join(out, 'index.html')) + kb(path.join(out, 'game.js'))} KB)`);
}

// Two extra pages generated from index.html + the bundle:
//  * onewayout.html: everything in one file (open it directly, no dist/);
//  * artifact/index.html: the page body for the hosted Artifact preview,
//    which supplies its own <html>/<head> skeleton and serves dist/game.js.
function packagePages() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'dist/game.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const tag = '<script src="dist/game.js" onerror="window.__wtBootFail && window.__wtBootFail()"></script>';
  if (!html.includes(tag)) throw new Error('index.html script tag not found');
  fs.writeFileSync(path.join(root, 'onewayout.html'), html.replace(tag, () => `<script>${js}</script>`));
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  fs.mkdirSync(path.join(root, 'artifact'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifact/index.html'), `${title}\n${style}\n<script>document.body.classList.add('style-neo');</script>${body}`);
  console.log('  onewayout.html + artifact/index.html written');
}
