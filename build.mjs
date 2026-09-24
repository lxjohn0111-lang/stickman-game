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
const CG_DIR = path.join(root, 'crazygames upload', 'game');
const CG_SDK = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>';


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
  packageCrazyGames();
}

// The CrazyGames build: 'crazygames upload/game/' holds exactly the files to
// upload (index.html + game.js). It is index.html with the CrazyGames HTML5
// SDK v3 loaded first in <head>; src/platform.js picks it up at boot.
function packageCrazyGames() {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const tag = '<script src="dist/game.js" onerror="window.__wtBootFail && window.__wtBootFail()"></script>';
  const missing = /The game script \(dist\/game\.js\) did not load\.[^']*'/;
  if (!html.includes(tag) || !missing.test(html)) throw new Error('index.html markers not found');
  html = html
    .replace('<meta charset="utf-8">', () => `<meta charset="utf-8">\n${CG_SDK}`)
    .replace(tag, () => '<script src="game.js" onerror="window.__wtBootFail && window.__wtBootFail()"></script>')
    .replace(missing, () => "The game could not be loaded. Please reload the page.'");
  fs.mkdirSync(CG_DIR, { recursive: true });
  fs.writeFileSync(path.join(CG_DIR, 'index.html'), html);
  fs.copyFileSync(path.join(root, 'dist/game.js'), path.join(CG_DIR, 'game.js'));
  console.log('  crazygames upload/game/ written (index.html + game.js)');
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
