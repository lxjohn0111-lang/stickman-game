// Finds "invisible walls": places where a bullet ray hits a collider but no
// visible surface is there. For every level, rays are cast from walkable
// spots at head height; each ray is tested against the collision world
// (bullet mask) and against the level's rendered meshes. A collider hit with
// no visible surface within 0.3 m behind it is a phantom hit. Colliders are
// ranked by phantom hits.
//   node tools/audit-colliders.mjs [level] [--rays 3000]
import { launch } from '../tests/harness.mjs';

const args = process.argv.slice(2);
const only = args[0] && !args[0].startsWith('--') ? Number(args[0]) : 0;
const RAYS = args.includes('--rays') ? Number(args[args.indexOf('--rays') + 1]) : 3000;
const { browser, page } = await launch({ width: 320, height: 200, query: 'nolock' });
await page.evaluate(() => { WT.game.manual = true; });
let total = 0;
for (let n = 1; n <= 8; n++) {
  if (only && n !== only) continue;
  await page.evaluate((n) => WT.game.startLevel(n), n);
  await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
  const r = await page.evaluate((RAYS) => {
    const g = WT.game, T = WT.THREE;
    const BULLET = 2;
    const meshes = [];
    g.level.group.traverse((o) => {
      if (!o.visible || !(o.isMesh || o.isInstancedMesh) || o.isLineSegments2 || o.isLine) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && m.transparent && m.opacity < 0.9) return; // glass, decals
      meshes.push(o);
    });
    g.level.group.updateMatrixWorld(true);
    const rc = new T.Raycaster();
    rc.firstHitOnly = true;
    const nodes = g.nav.nodes;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const hit = {};
    const bad = new Map();
    let tested = 0, phantom = 0;
    for (let i = 0; i < RAYS; i++) {
      const nd = nodes[Math.floor(rnd() * nodes.length)];
      const ox = nd.x, oy = nd.y + 1.5, oz = nd.z;
      const yaw = rnd() * Math.PI * 2, pitch = -0.35 + rnd() * 0.55;
      const dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
      if (!g.world.raycast(ox, oy, oz, dx, dy, dz, 45, BULLET, hit, true)) continue;
      if (!hit.col) continue; // ground plane or door
      tested++;
      rc.set(new T.Vector3(ox, oy, oz), new T.Vector3(dx, dy, dz));
      rc.near = 0; rc.far = hit.t + 6;
      const vis = rc.intersectObjects(meshes, false);
      if (vis.length && vis[0].distance <= hit.t + 0.3) continue;
      const dv = vis.length ? +(vis[0].distance - hit.t).toFixed(2) : null;
      phantom++;
      const c = hit.col;
      const k = c.i;
      const e = bad.get(k) || { n: 0, box: [c.x0, c.y0, c.z0, c.x1, c.y1, c.z1].map((v) => +v.toFixed(2)), tag: c.tag, surf: c.surf, f: c.f, pts: [] };
      e.n++;
      if (e.pts.length < 3) e.pts.push([...[hit.x, hit.y, hit.z].map((v) => +v.toFixed(2)), 'dv', dv, vis.length ? (vis[0].object.name || vis[0].object.type) : '-']);
      bad.set(k, e);
    }
    const list = [...bad.values()].sort((a, b) => b.n - a.n);
    return { id: g.level.def.id, tested, phantom, cols: list.length, top: list.slice(0, 14) };
  }, RAYS);
  total += r.phantom;
  console.log(`\n${r.id}: ${r.phantom} phantom hits of ${r.tested} collider hits, ${r.cols} colliders`);
  for (const e of r.top) console.log(`  ${String(e.n).padStart(4)}  box ${JSON.stringify(e.box)} surf=${e.surf} tag=${e.tag} f=${e.f}  e.g. ${JSON.stringify(e.pts)}`);
  await page.evaluate(() => WT.game.toMainMenu());
}
await browser.close();
console.log(`\ntotal phantom hits: ${total}`);
