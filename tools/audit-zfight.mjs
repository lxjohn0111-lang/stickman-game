// Finds z-fighting: faces of two differently-coloured boxes that lie in the
// same plane, face the same way and overlap. Those flicker as the camera
// moves. Reports every such pair per level.
//   node tools/audit-zfight.mjs [level]
import { launch } from '../tests/harness.mjs';

const only = Number(process.argv[2] || 0);
const { browser, page } = await launch({ width: 320, height: 200, query: 'nolock' });
await page.evaluate(() => { WT.game.manual = true; });
let total = 0;
for (let n = 1; n <= 8; n++) {
  if (only && n !== only) continue;
  await page.evaluate((n) => { if (WT.game.level) WT.game.level.dirty = true; globalThis.__boxLog = []; WT.game.startLevel(n); }, n);
  await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
  const r = await page.evaluate(() => {
    const boxes = globalThis.__lastAabbs || [];
    globalThis.__boxLog = null; globalThis.__lastAabbs = null;
    const colorOf = (role) => { const m = WT.game.materials.get(role); return m && m.color ? m.color.getHexString() : role; };
    const out = [];
    // faces: axis a (0 x, 1 y, 2 z), sign, plane coord, 2D rect in the other axes
    const faces = [];
    for (const b of boxes) {
      const [role, x0, y0, z0, x1, y1, z1] = b;
      const lo = [x0, y0, z0], hi = [x1, y1, z1];
      for (let a = 0; a < 3; a++) {
        const u = (a + 1) % 3, v = (a + 2) % 3;
        faces.push({ role, a, s: -1, p: lo[a], u0: lo[u], u1: hi[u], v0: lo[v], v1: hi[v], b });
        faces.push({ role, a, s: 1, p: hi[a], u0: lo[u], u1: hi[u], v0: lo[v], v1: hi[v], b });
      }
    }
    // same-facing faces of different roles that overlap and lie within 3 cm
    // of each other (exactly coplanar sides, or near-coplanar floor overlays,
    // which flicker at a distance). Bottom faces are skipped: never seen.
    const E = 0.03;
    const byKey = new Map();
    for (const f of faces) {
      if (f.a === 1 && f.s < 0) continue;
      const k = `${f.a}${f.s}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(f);
    }
    const seen = new Set();
    for (const list of byKey.values()) {
      list.sort((A, B) => A.p - B.p);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length && list[j].p - list[i].p < (list[i].a === 1 ? E - 1e-4 : 0.002); j++) {
          const A = list[i], B = list[j];
          if (A.b === B.b || A.role === B.role) continue;
          // a tall top tucked 4 mm under a floor is intended (it is covered)
          if (A.a === 1 && Math.abs(B.p - A.p - 0.004) < 1e-4 && (A.b[5] - A.b[2]) > 0.35) continue;
          const du = Math.min(A.u1, B.u1) - Math.max(A.u0, B.u0), dv = Math.min(A.v1, B.v1) - Math.max(A.v0, B.v0);
          if (du <= 0.01 || dv <= 0.01) continue;
          // a face buried inside the other box is never seen
          const other = (F, G) => { const b = G.b; const c = [(F.u0 + F.u1) / 2, (F.v0 + F.v1) / 2]; void c; return false; };
          void other;
          const id = [A.role, B.role].sort().join('|') + '@' + A.a + A.s + Math.round(A.p * 100) + ':' + Math.round(Math.max(A.u0, B.u0));
          if (seen.has(id)) continue;
          seen.add(id);
          out.push({ roles: `${A.role} / ${B.role}`, gap: +(B.p - A.p).toFixed(3), face: ['x', 'y', 'z'][A.a] + (A.s > 0 ? '+' : '-'), at: +A.p.toFixed(3), area: +(du * dv).toFixed(2), boxA: A.b.slice(1).map((v) => +v.toFixed(2)), boxB: B.b.slice(1).map((v) => +v.toFixed(2)) });
        }
      }
    }
    out.sort((a, b) => b.area - a.area);
    return { id: WT.game.level.def.id, boxes: boxes.length, n: out.length, top: out.slice(0, 25) };
  });
  total += r.n;
  console.log(`\n${r.id}: ${r.n} coplanar pairs (of ${r.boxes} boxes)`);
  for (const e of r.top) console.log(`  ${e.face} gap ${e.gap} ${String(e.at).padStart(7)}  ${String(e.area).padStart(7)} m2  ${e.roles}  A${JSON.stringify(e.boxA)} B${JSON.stringify(e.boxB)}`);
  await page.evaluate(() => WT.game.toMainMenu());
}
await browser.close();
console.log(`\ntotal coplanar pairs: ${total}`);
