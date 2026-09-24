// Bundles src/ + the vendored three.js into one classic (non-module) script:
// dist/game.js. index.html loads it with a plain <script> tag, so the game
// runs straight from file:// with no server.
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev');

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
  banner: { js: '/* Way Through - bundled with three.js r170 (MIT, see vendor/three/LICENSE) */' },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('watching src/ ...');
} else {
  await esbuild.build(options);
}
