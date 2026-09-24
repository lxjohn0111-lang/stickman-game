// Runs the browser test suite in sequence (needs Playwright + Chromium).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const suites = [
  ['mechanics.mjs'], ['weapons.mjs'], ['lock.mjs'],
  ['playthrough.mjs', 'normal', 'classic'], ['playthrough.mjs', 'normal', 'neo'],
];
let failed = 0;
for (const [file, ...args] of suites) {
  console.log(`\n=== ${file} ${args.join(' ')}`);
  const r = spawnSync(process.execPath, [path.join(dir, file), ...args], { stdio: 'inherit', timeout: 40 * 60 * 1000 });
  if (r.status !== 0) { failed++; console.log(`!!! ${file} exited with ${r.status}`); }
}
process.exit(failed ? 1 : 0);
