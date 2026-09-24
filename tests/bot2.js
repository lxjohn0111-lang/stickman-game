// Generic in-page autopilot: follows the current mission objective (zones,
// switches, destructibles, enemy groups, the boss), fights what it sees and
// opens doors. It drives the real input state one frame at a time.
window.BOT2 = (() => {
  const g = WT.game;
  const st = { path: null, idx: 0, repath: 0, stuck: 0, lastPos: null, backoff: 0, fireHold: 0, log: [], goalKey: '', lastProgress: 0, lastIndex: -1, target: null };
  const ignore = new Map();
  function key(code, on) { g.input.keys[code] = on; if (on) g.input.pressed[code] = true; }

  function visibleEnemy(range = 38) {
    const cam = g.player.cam;
    let best = null, bd = range;
    for (const e of g.enemies.list) {
      if (!e.alive || e.civilian || (ignore.get(e.id) || 0) > 8) continue;
      const j = e.joints;
      const tx = (j[1].x + j[2].x) / 2, ty = (j[1].y + j[2].y) / 2 + 0.05, tz = (j[1].z + j[2].z) / 2;
      const d = Math.hypot(tx - cam.x, ty - cam.y, tz - cam.z);
      if (d > bd && !e.R.boss) continue;
      if (!g.world.clear(cam.x, cam.y, cam.z, tx, ty, tz, 2)) continue;
      best = { e, x: tx, y: ty, z: tz, d }; bd = d;
    }
    return best;
  }

  function aimAt(x, y, z, rate = 1) {
    const p = g.player, cam = p.cam;
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const dyaw = Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw));
    const sens = 0.0021 * g.settings.sensitivity * (p.aiming ? 0.7 : 1);
    g.input.dx += (-dyaw / sens) * rate;
    g.input.dy += (-(pitch - p.pitch - p.recoilPitch) / sens) * rate;
    return Math.abs(dyaw) + Math.abs(pitch - p.pitch - p.recoilPitch);
  }

  // Where the objective wants us: {x, y, z, look?, use?, shoot?}
  function goal() {
    const m = g.mission;
    const o = m.obj;
    if (!o) return null;
    const P = g.player;
    const d = g.level.data;
    if (o.type === 'reach' || o.type === 'survive') {
      const z = d.zones.find((q) => q.id === o.zone);
      if (!z) return m.hasMarker ? { x: m.marker.x, y: m.marker.y - 1, z: m.marker.z } : null;
      let best = null, bd = Infinity;
      for (const n of g.nav.nodes) {
        if (n.x < z.x0 + 0.5 || n.x > z.x1 - 0.5 || n.z < z.z0 + 0.5 || n.z > z.z1 - 0.5 || n.y < z.y0 || n.y > z.y1) continue;
        const dd = Math.hypot(n.x - P.x, n.y - P.y, n.z - P.z);
        if (dd < bd) { bd = dd; best = n; }
      }
      if (best && o.type === 'survive') return { x: (z.x0 + z.x1) / 2, y: best.y, z: (z.z0 + z.z1) / 2, snap: best };
      return best ? { x: best.x, y: best.y, z: best.z } : null;
    }
    if (o.type === 'interact') {
      const it = o.ids.map((id) => d.interacts.find((i) => i.id === id)).find((i) => i && !m.used.has(i.id));
      if (!it) return null;
      const f = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[it.face || 's'];
      return { x: it.x + f[0] * 1.0, y: it.y - 1.0, z: it.z + f[1] * 1.0, look: [it.x, it.y, it.z], use: true };
    }
    if (o.type === 'destroy') {
      const x = o.ids.map((id) => g.hazards.destructible(id)).find((q) => q && !q.dead);
      if (!x) return null;
      const cx = (x.box[0] + x.box[3]) / 2, cz = (x.box[2] + x.box[5]) / 2, cy = x.box[1] + 1.2;
      return { x: cx, y: x.box[1], z: cz, near: 7, shoot: [cx, cy, cz] };
    }
    if (o.type === 'kill' || o.type === 'boss') {
      const groups = o.groups || [o.group];
      let best = null, bd = Infinity;
      for (const e of g.enemies.list) {
        if (!e.alive || e.civilian) continue;
        if (o.type === 'kill' && !groups.includes(e.group)) continue;
        if (o.type === 'boss' && !e.R.boss) continue;
        const dd = Math.hypot(e.body.x - P.x, e.body.z - P.z);
        if (dd < bd) { bd = dd; best = e; }
      }
      return best ? { x: best.body.x, y: best.body.y, z: best.body.z, near: 3 } : null;
    }
    return null;
  }

  function step() {
    const p = g.player;
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyF', 'KeyR', 'Space', 'Digit1', 'Digit2']) g.input.keys[c] = false;
    g.input.left = false;
    if (g.state !== 'playing') return;
    const m = g.mission;
    if (m.index !== st.lastIndex) { st.lastIndex = m.index; st.path = null; st.log.push(['obj', m.index, +g.time.toFixed(1)]); }
    const gl = goal();
    // swap to the sidearm when the main gun is dry
    const w = p.weapon;
    if (w.mag === 0 && w.reserve === 0) key(p.active === 'main' ? 'Digit2' : 'Digit1', true);
    const ammo = (sl) => (sl ? sl.mag + sl.reserve : 0);
    const dry = ammo(p.slots.main) + ammo(p.slots.side) === 0;
    const tgt = dry ? null : visibleEnemy();
    if (tgt && !(gl && gl.use && Math.hypot(gl.x - p.x, gl.z - p.z) < 1.2)) {
      st.target = tgt.e.id;
      if (tgt.e.hitUp < 0.3 && tgt.e.stagger <= 0) ignore.set(tgt.e.id, (ignore.get(tgt.e.id) || 0) + 1 / 60); else ignore.set(tgt.e.id, 0);
      const err = aimAt(tgt.x, tgt.y, tgt.z, 0.5);
      if (err < 0.09) g.input.left = true;
      if (!p.weapon.def.auto && g.input.left) { g.input.leftPressed = (st.fireHold++ % 6) === 0; g.input.left = g.input.leftPressed; }
      if (p.weapon.mag === 0) key('KeyR', true);
      key(Math.floor(g.time * 0.8) % 2 ? 'KeyA' : 'KeyD', true);
      if (tgt.d > 16) key('KeyW', true);
      return;
    }
    st.target = null;
    if (p.weapon.mag < p.weapon.def.mag * 0.5 && p.weapon.reserve > 0) key('KeyR', true);
    // low on ammo: go and pick up a nearby gun (F) or ammo box
    let glx = gl;
    if (ammo(p.slots.main) < 12 || dry) {
      let pk = null, pd = 25;
      for (const it of g.items.list) {
        if ((it.type !== 'weapon' && it.type !== 'ammo') || !it.rest || Math.abs(it.y - p.y) > 1.2) continue;
        if (it.type === 'weapon' && it.mag + it.reserve < 4) continue;
        if ((st.skipItems || new Set()).has(it.key)) continue;
        const dd = Math.hypot(it.x - p.x, it.z - p.z);
        if (dd < pd) { pd = dd; pk = it; }
      }
      if (pk) {
        if (st.pickKey !== pk.key) { st.pickKey = pk.key; st.pickT = 0; }
        st.pickT += 1 / 60;
        if (st.pickT > 12) { (st.skipItems = st.skipItems || new Set()).add(pk.key); }
        if (p.lookTarget && p.lookTarget.kind === 'pickup') key('KeyF', true);
        glx = { x: pk.x, y: pk.y, z: pk.z, near: 0.4 };
      }
    }
    const gl2 = glx;
    if (!gl2) return;
    const gl_ = gl2;
    const dist = Math.hypot(gl_.x - p.x, gl_.z - p.z);
    const near = gl_.near || (gl_.use ? 0.35 : 0.8);
    const sh = gl_.shoot;
    const hit = {};
    const sd = sh ? Math.hypot(sh[0] - p.cam.x, sh[1] - p.cam.y, sh[2] - p.cam.z) : 0;
    const seesTarget = sh && dist < 16 && g.world.raycast(p.cam.x, p.cam.y, p.cam.z, (sh[0] - p.cam.x) / sd, (sh[1] - p.cam.y) / sd, (sh[2] - p.cam.z) / sd, sd + 1, 2, hit) && hit.tag && hit.tag.startsWith('destructible:');
    if (seesTarget) {
      // line of sight is blocked by the target itself: fire at it
      const err = aimAt(gl_.shoot[0], gl_.shoot[1], gl_.shoot[2], 0.5);
      if (err < 0.08) { g.input.left = true; if (!p.weapon.def.auto) { g.input.leftPressed = (st.fireHold++ % 5) === 0; g.input.left = g.input.leftPressed; } }
      if (p.weapon.mag === 0) key('KeyR', true);
      if (dist < 4) key('KeyS', true);
      return;
    }
    if (dist < near && Math.abs(gl_.y - p.y) < 1.2) {
      if (gl_.look) {
        const err = aimAt(gl_.look[0], gl_.look[1], gl_.look[2], 0.5);
        if (err < 0.2 && p.lookTarget && p.lookTarget.kind === 'interact') key('KeyF', true);
      }
      return;
    }
    st.repath -= 1 / 60;
    const gk = `${gl_.x.toFixed(1)},${gl_.z.toFixed(1)}`;
    if (!st.path || st.repath <= 0 || (gk !== st.goalKey && st.repath < 1.5)) {
      st.goalKey = gk;
      const a = g.nav.nearest(p.x, p.y, p.z), b = gl_.snap || g.nav.nearest(gl_.x, gl_.y, gl_.z, false);
      const path = a && b ? g.nav.path(a, b) : null;
      st.path = path ? [{ node: a }, ...path, { node: { x: gl_.x, y: gl_.y, z: gl_.z } }] : [{ node: { x: gl_.x, y: gl_.y, z: gl_.z } }];
      st.idx = 0; st.repath = 2;
      while (st.idx < st.path.length - 1 && Math.hypot(st.path[st.idx].node.x - p.x, st.path[st.idx].node.z - p.z) < 1.2) st.idx++;
    }
    let n = st.path[st.idx].node;
    if (Math.hypot(n.x - p.x, n.z - p.z) < 0.6 && st.idx < st.path.length - 1) { st.idx++; n = st.path[st.idx].node; }
    aimAt(n.x, p.cam.y + (n.y - p.y), n.z, 0.35);
    key('KeyW', true);
    for (const dr of g.doors) {
      if (!dr.isOpen && !dr.locked && Math.abs(dr.y0 - p.y) < 1 && dr.distanceTo(p.x, p.z) < 1.4) { key('KeyF', true); break; }
    }
    if (st.lastPos && Math.hypot(st.lastPos[0] - p.x, st.lastPos[1] - p.z) < 0.01) {
      st.stuck++;
      if (st.stuck > 25) {
        // an open door leaf in the way? swing it shut
        const dd = g.doors.find((d) => d.isOpen && Math.abs(d.y0 - p.y) < 1 && d.distanceTo(p.x, p.z) < 1.2);
        if (dd) key('KeyF', true);
        else { st.idx = Math.max(0, st.idx - 1); st.backoff = 30; }
        st.stuck = 0;
      }
    } else st.stuck = 0;
    if (st.backoff > 0) { st.backoff--; key('KeyW', false); key('KeyS', true); key(st.backoff % 60 < 30 ? 'KeyA' : 'KeyD', true); }
    st.lastPos = [p.x, p.z];
  }
  return { st, step, goal, visibleEnemy };
})();
