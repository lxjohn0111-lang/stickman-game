// Bundles src/ + the vendored three.js into one classic (non-module) script:
// dist/game.js. index.html loads it with a plain <script> tag, so the game
// runs straight from file:// with no server.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import zlib from 'node:zlib';
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
  // Poki starts its SDK from the page itself, the way Poki's own HTML5 guide
  // shows, so init() runs as soon as the page does instead of waiting for the
  // game bundle to parse, and a look at index.html shows the integration.
  // src/platforms/poki.js waits for window.pokiReady.
  {
    dir: 'poki upload',
    sdk: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
    head: `<script>
  window.pokiReady = (function () {
    if (typeof PokiSDK === 'undefined') return Promise.resolve(false);
    try {
      if (/[?&]pokidebug=1/.test(location.search) && PokiSDK.setDebug) PokiSDK.setDebug(true);
      return Promise.resolve(PokiSDK.init()).then(function () {
        if (PokiSDK.gameLoadingStart) PokiSDK.gameLoadingStart();
        window.pokiLoadingStarted = true;
        return true;
      }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  })();
</script>`,
  },
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
  packageZip('poki upload', 'one-way-out-poki.zip');
}

// A portal build: '<portal> upload/game/' holds exactly the files to upload
// (index.html + game.js). It is index.html with that portal's SDK loaded first
// in <head>; src/platform.js picks it up at boot.
//
// '<portal> upload/game-onefile/' is the same build as a single index.html with
// the bundle inlined. It is there for the case where a portal's upload ends up
// not serving game.js at all: with nothing beside the page there is no second
// request to lose, so the "could not be loaded" screen cannot come from that.
function packagePortal({ dir, sdk, head = '' }) {
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const tag = '<script src="dist/game.js" onerror="window.__wtBootFail && window.__wtBootFail(\'net\')"></script>';
  const netMsg = /window\.__wtNetMsg = '[^']*';/;
  if (!src.includes(tag) || !netMsg.test(src)) throw new Error('index.html markers not found');
  const withSdk = src.replace('<meta charset="utf-8">', () => `<meta charset="utf-8">\n<script src="${sdk}"></script>${head ? '\n' + head : ''}`);
  const kb = (p) => Math.round(fs.statSync(p).size / 1024);

  const two = path.join(root, dir, 'game');
  fs.mkdirSync(two, { recursive: true });
  fs.writeFileSync(path.join(two, 'index.html'), withSdk
    .replace(tag, () => '<script src="game.js" onerror="window.__wtBootFail && window.__wtBootFail(\'net\')"></script>')
    .replace(netMsg, () => "window.__wtNetMsg = 'The game file (game.js) could not be downloaded. Please reload the page.';"));
  fs.copyFileSync(path.join(root, 'dist/game.js'), path.join(two, 'game.js'));
  console.log(`  ${dir}/game/ written (index.html + game.js, ${kb(path.join(two, 'index.html')) + kb(path.join(two, 'game.js'))} KB)`);

  const one = path.join(root, dir, 'game-onefile');
  fs.mkdirSync(one, { recursive: true });
  fs.writeFileSync(path.join(one, 'index.html'), withSdk.replace(tag, () => `<script>${inlineBundle()}</script>`));
  console.log(`  ${dir}/game-onefile/ written (index.html only, ${kb(path.join(one, 'index.html'))} KB)`);
}

// The bundle, safe to drop inside a <script> element in an HTML document.
function inlineBundle() {
  return fs.readFileSync(path.join(root, 'dist/game.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
}

// Two extra pages generated from index.html + the bundle:
//  * onewayout.html: everything in one file (open it directly, no dist/);
//  * artifact/index.html: the page body for the hosted Artifact preview,
//    which supplies its own <html>/<head> skeleton and serves dist/game.js.
function packagePages() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const js = inlineBundle();
  const tag = '<script src="dist/game.js" onerror="window.__wtBootFail && window.__wtBootFail(\'net\')"></script>';
  if (!html.includes(tag)) throw new Error('index.html script tag not found');
  fs.writeFileSync(path.join(root, 'onewayout.html'), html.replace(tag, () => `<script>${js}</script>`));
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  fs.mkdirSync(path.join(root, 'artifact'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifact/index.html'), `${title}\n${style}\n<script>document.body.classList.add('style-neo');</script>${body}`);
  console.log('  onewayout.html + artifact/index.html written');
}

// Poki wants a zip with index.html at its root and no wrapping directory, so
// `npm run build` writes it. Doing it here is the point: a zip made by hand
// after a rebuild is one someone forgets, and the stale one gets uploaded.
// Written by hand rather than shelled out to `zip`, which isn't everywhere.
function packageZip(dir, zipName) {
  const src = path.join(root, dir, 'game');
  const names = ['index.html', 'game.js']; // index.html first: it is the entry
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  const local = [];
  const central = [];
  let at = 0;
  for (const name of names) {
    const raw = fs.readFileSync(path.join(src, name));
    const data = zlib.deflateRawSync(raw, { level: 9 });
    const nb = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // version needed
    head.writeUInt16LE(0, 6); // flags
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(dosTime, 10);
    head.writeUInt16LE(dosDate, 12);
    head.writeUInt32LE(crc32(raw), 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(nb.length, 26);
    local.push(head, nb, data);
    const ent = Buffer.alloc(46);
    ent.writeUInt32LE(0x02014b50, 0);
    ent.writeUInt16LE(20, 4); // version made by
    ent.writeUInt16LE(20, 6); // version needed
    ent.writeUInt16LE(8, 10);
    ent.writeUInt16LE(dosTime, 12);
    ent.writeUInt16LE(dosDate, 14);
    ent.writeUInt32LE(crc32(raw), 16);
    ent.writeUInt32LE(data.length, 20);
    ent.writeUInt32LE(raw.length, 24);
    ent.writeUInt16LE(nb.length, 28);
    ent.writeUInt32LE(at, 42); // offset of the local header
    central.push(ent, nb);
    at += head.length + nb.length + data.length;
  }
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(at, 16);
  const out = path.join(root, zipName);
  fs.writeFileSync(out, Buffer.concat([...local, dirBuf, end]));
  console.log(`  ${zipName} written (${names.join(' + ')} at the zip root, ${Math.round(fs.statSync(out).size / 1024)} KB)`);
}

// The table lives on the function so it survives being called from the top
// level, where a `const` declared further down this file is not yet in scope.
function crc32(buf) {
  let t = crc32.table;
  if (!t) {
    t = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
