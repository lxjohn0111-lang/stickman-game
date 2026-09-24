// In-page autopilot used by the playthrough test. It drives the real game
// input state (keys, mouse buttons, look) one frame at a time.
window.BOT = (() => {
  const g = WT.game;
  const V = WT.THREE.Vector3;
  const goals = [
    { x: 0, y: 5, z: 17.0, name: 'hut-door' },
    { x: 0, y: 5, z: 14.7, name: 'hut-in' },
    { x: 0, y: 0, z: 5.0, name: 'stair-foot' },
    { x: -2.0, y: 0, z: 2.9, name: 'kitchen-door' },
    { x: -4.2, y: 0, z: 2.9, name: 'kitchen' },
    { x: -7.0, y: 0, z: 9.8, name: 'kitchen-south' },
    { x: -11.0, y: 0, z: 9.7, name: 'canteen-door' },
    { x: -13.2, y: 0, z: 9.7, name: 'canteen' },
    { x: -18.05, y: 0, z: 1.3, name: 'exit' },
    { x: -18.05, y: 0, z: -1.2, name: 'yard' },
    { x: -14, y: 0, z: -30, name: 'mid-yard' },
    { x: -14, y: 0, z: -46, name: 'tower-approach' },
    { x: -20.5, y: 0, z: -66, name: 'past-tower' },
    { x: -14.5, y: 0, z: -79, name: 'gate' },
    { x: -14.5, y: 0, z: -86, name: 'through-gate' },
  ];
  const ignore = new Map();
  const st = { goal: 0, path: null, idx: 0, repath: 0, stuck: 0, lastPos: null, log: [], target: null, fireHold: 0, reached: [] };
  function key(code, on) { g.input.keys[code] = on; if (on) g.input.pressed[code] = true; }
  function visibleEnemy() {
    const p = g.player, cam = p.cam;
    let best = null, bd = 34;
    for (const e of g.enemies.list) {
      if (!e.alive || (ignore.get(e.id) || 0) > 6) continue;
      const j = e.joints;
      const tx = (j[1].x + j[2].x) / 2, ty = (j[1].y + j[2].y) / 2 + 0.05, tz = (j[1].z + j[2].z) / 2;
      const d = Math.hypot(tx - cam.x, ty - cam.y, tz - cam.z);
      if (d > bd) continue;
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
    // feed it through the mouse-look path, like a player would
    const sens = 0.0021 * g.settings.sensitivity * (p.aiming ? 0.7 : 1);
    const k = Math.min(1, rate);
    g.input.dx += (-dyaw / sens) * k;
    g.input.dy += (-(pitch - p.pitch - p.recoilPitch) / sens) * k;
    return Math.abs(dyaw) + Math.abs(pitch - p.pitch - p.recoilPitch);
  }
  function step() {
    const p = g.player;
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyF', 'KeyR', 'Space']) g.input.keys[c] = false;
    g.input.left = false;
    if (g.state !== 'playing') return;
    const tgt = visibleEnemy();
    if (tgt) {
      st.target = tgt.e.id;
      if (tgt.e.hitUp < 0.5) ignore.set(tgt.e.id, (ignore.get(tgt.e.id) || 0) + 1 / 60); else ignore.set(tgt.e.id, 0);
      const err = aimAt(tgt.x, tgt.y, tgt.z, 0.5);
      if (err < 0.08 && tgt.d < 45) g.input.left = true;
      if (!p.weapon.def.auto && g.input.left) { g.input.leftPressed = (st.fireHold++ % 6) === 0; g.input.left = g.input.leftPressed; }
      if (p.weapon.mag === 0) key('KeyR', true);
      // strafe a little while fighting
      key(Math.floor(g.time * 0.8) % 2 ? 'KeyA' : 'KeyD', true);
      if (tgt.d > 18) key('KeyW', true);
      return;
    }
    st.target = null;
    if (p.weapon.mag < p.weapon.def.mag * 0.5 && p.weapon.reserve > 0) key('KeyR', true);
    // take better guns / ammo lying nearby
    if (p.lookTarget && p.lookTarget.kind === 'pickup') {
      const pk = p.lookTarget.pickup;
      const low = p.weapon.mag + p.weapon.reserve < 24;
      if (pk.weapon === p.weapon.id || (low && pk.mag + pk.reserve > p.weapon.mag + p.weapon.reserve)) key('KeyF', true);
    }
    const goal = goals[st.goal];
    if (!goal) return;
    const d = Math.hypot(goal.x - p.x, goal.z - p.z);
    if (d < 0.7 && Math.abs(goal.y - p.y) < 1) {
      st.reached.push([goal.name, +g.time.toFixed(1)]);
      st.goal++; st.path = null; return;
    }
    st.repath -= 1 / 60;
    if (!st.path || st.repath <= 0) {
      const a = g.nav.nearest(p.x, p.y, p.z), b = g.nav.nearest(goal.x, goal.y, goal.z, false);
      const path = a && b ? g.nav.path(a, b) : null;
      st.path = path ? [{ node: a }, ...path, { node: goal }] : [{ node: goal }];
      st.idx = 0; st.repath = 2;
      while (st.idx < st.path.length - 1 && Math.hypot(st.path[st.idx].node.x - p.x, st.path[st.idx].node.z - p.z) < 1.2) st.idx++;
    }
    let n = st.path[st.idx].node;
    if (Math.hypot(n.x - p.x, n.z - p.z) < 0.6 && st.idx < st.path.length - 1) { st.idx++; n = st.path[st.idx].node; }
    aimAt(n.x, p.cam.y + (n.y - p.y), n.z, 0.35);
    key('KeyW', true);
    // doors in the way: press F
    for (const dr of g.doors) {
      if (!dr.isOpen && Math.abs(dr.y0 - p.y) < 1 && dr.distanceTo(p.x, p.z) < 1.4) { key('KeyF', true); break; }
    }
    // stuck on a corner? back up to the previous waypoint, then carry on
    if (st.lastPos && Math.hypot(st.lastPos[0] - p.x, st.lastPos[1] - p.z) < 0.01) {
      st.stuck++;
      if (st.stuck > 25) { st.idx = Math.max(0, st.idx - 1); st.stuck = 0; st.backoff = 30; }
    } else st.stuck = 0;
    if (st.backoff > 0) { st.backoff--; key('KeyW', false); key('KeyS', true); key(st.backoff % 60 < 30 ? 'KeyA' : 'KeyD', true); }
    st.lastPos = [p.x, p.z];
  }
  return { st, step, goals, visibleEnemy };
})();
