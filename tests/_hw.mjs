import { chromium } from 'playwright';
import fs from 'node:fs';
const src = fs.readFileSync('/home/user/stickman-game/src/handwriting.js', 'utf8').replace('export function', 'function');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const p = await b.newPage({ viewport: { width: 900, height: 520 } });
await p.setContent('<style>body{background:#fff;margin:20px} svg{display:block;margin:6px 0;fill:none;stroke:#111;stroke-linecap:round;stroke-linejoin:round}</style>');
await p.evaluate((src) => { eval(src + '\nwindow.hw = handwrite;'); for (const t of ['Way through', 'No way through.', 'Way through.', 'Campaign complete.', 'Endless over']) document.body.appendChild(hw(t, { height: 80, animate: false })); }, src);
await p.screenshot({ path: '/tmp/claude-0/-home-user-stickman-game/9447c573-053d-5206-9906-da05fa35c476/scratchpad/hw.png' });
await b.close();
