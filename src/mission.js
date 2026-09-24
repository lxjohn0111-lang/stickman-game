// Mission engine: runs a level's objective list, scripted actions (enemy
// groups, reinforcement waves, doors, lifts, level hooks), checkpoints,
// secrets, scoring with a combo multiplier, stars, achievements and saving.
//
// Objective types:
//   reach    {zone}                     player enters a zone
//   interact {ids, count?}              use switches/consoles (F)
//   destroy  {ids}                      shoot destructibles to pieces
//   kill     {group | groups}           clear enemy group(s)
//   survive  {time, waves:[{at,...}]}   hold out while waves arrive
//   boss     {group}                    defeat the commander
// Each can have marker(s), onStart and onComplete action lists; the one
// marked final ends the level.
import * as THREE from 'three';
import { SCORE, PLAYER, starThresholds } from './config.js';
import { SIGHT } from './world.js';
import { progress, levelRecord, saveProgress } from './save.js';
import { t } from './i18n.js';

const LEVEL_COUNT = 8;

export class Mission {
  constructor(game) {
    this.game = game;
    this.level = null;
    this.active = false;
    this.marker = new THREE.Vector3();
    this.hasMarker = false;
  }

  // ------------------------------------------------------------------ setup
  start(level, { endless = false } = {}) {
    const g = this.game;
    this.level = level;
    this.def = level.def;
    this.data = level.data;
    this.endless = endless;
    this.active = true;
    this.done = false;
    this.index = -1;
    this.obj = null;
    this.used = new Set();
    this.destroyed = new Set();
    this.cpIndex = -1;
    this.checkpoint = null;
    for (const c of this.data.checkpoints) c.armed = false;
    this.queue = [];
    this.timers = [];
    this.tipsShown = new Set();
    this.areaKey = null;
    this.secretsFound = [false, false, false];
    this.run = { kills: 0, headshots: 0, killScore: 0, combo: 0, bonus: 0, noDamage: true };
    this.surviveLeft = 0;
    this.totalEnemies = this.data.spawns.filter((s) => s.role !== 'civilian').length;
    this.lastObjectiveT = 0;
    g.enemies.clear();
    if (!endless) for (const grp of this.def.startGroups || ['main']) g.enemies.spawnGroup(this.data.spawns, grp);
    g.items.load(this.data, g.diff.pickupTier, new Set(), endless ? [true, true, true] : this.secretsFound);
    if (!endless) this._next();
    // restarting the level is restoring this snapshot (no rebuild needed)
    this.startSnap = this._snapshot(this.data.start);
  }

  get objectives() { return this.def.objectives || []; }

  _next() {
    this.index++;
    this.obj = this.objectives[this.index] || null;
    this.objT = 0;
    if (!this.obj) return;
    const o = this.obj;
    if (o.type === 'survive') {
      this.surviveLeft = o.time;
      for (const w of o.waves || []) this.timers.push({ at: this.game.time + (w.at || 0), wave: w });
    }
    this._run(o.onStart);
    if (this.index > 0 && !this.restoring) {
      this.game.ui.objective(this._label(), true);
    }
    // interacts/destroys done early count straight away
    this._check();
  }

  _label() {
    const o = this.obj;
    if (!o) return '';
    let n = 0;
    if (o.type === 'interact') n = o.ids.filter((id) => this.used.has(id)).length;
    else if (o.type === 'destroy') n = o.ids.filter((id) => this.destroyed.has(id)).length;
    else if (o.type === 'kill') n = this._groupsLeft(o);
    return t(o.key, { n });
  }

  get label() { return this._label(); }

  _groupsLeft(o) {
    const groups = o.groups || [o.group];
    let n = 0;
    for (const gname of groups) n += this.game.enemies.groupAlive(gname);
    return n;
  }

  // ------------------------------------------------------------------ actions
  _run(actions) {
    if (!actions) return;
    const g = this.game;
    for (const a of actions) {
      if (a.delay) { this.timers.push({ at: g.time + a.delay, action: { ...a, delay: 0 } }); continue; }
      if (a.spawn) g.enemies.spawnGroup(this.data.spawns, a.spawn);
      if (a.wave) this.wave(a.wave);
      if (a.unlock) { const d = this.door(a.unlock); if (d) d.unlock(); }
      if (a.open) { const d = this.door(a.open); if (d) { d.unlock(); if (!d.isOpen) { d.open(d.cx + 5, d.cz + 5); g.audio.play('doorOpen', g.spatialAt(d.cx, d.y0 + 1, d.cz, 0.8)); } } }
      if (a.close) { const d = this.door(a.close); if (d && d.isOpen) d.close(); }
      if (a.lift) g.hazards.moveLift(a.lift.id, a.lift.y);
      if (a.civilians) g.enemies.freeCivilians(a.civilians === 'follow' ? null : a.civilians);
      if (a.hook && this.def.hooks && this.def.hooks[a.hook]) this.def.hooks[a.hook](g, this);
      if (a.toast) g.ui.toast(t(a.toast));
      if (a.sound) g.audio.play(a.sound, { gain: 0.8 });
      if (a.music) g.setCombatMusic(a.music === 'combat');
    }
  }

  door(id) { return this.game.doors.find((d) => d.id === id); }

  // Reinforcements: spawn at entries the player can't see and that aren't
  // behind them, a few at a time.
  wave(w) {
    const g = this.game;
    const P = g.player;
    const cands = this.data.entries.filter((e) => !w.entries || w.entries.includes(e.id));
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const scored = cands.map((e) => {
      const dx = e.x - P.x, dz = e.z - P.z;
      const d = Math.hypot(dx, dz) || 1;
      const behind = (dx * fx + dz * fz) / d < -0.35 && d < 30;
      const seen = d < 45 && g.world.clear(P.cam.x, P.cam.y, P.cam.z, e.x, e.y + 1.4, e.z, SIGHT);
      const tooClose = d < 9;
      return { e, ok: !behind && !seen && !tooClose, d };
    });
    let ok = scored.filter((s) => s.ok);
    if (!ok.length) ok = scored.filter((s) => s.d >= 9).sort((a, b) => b.d - a.d).slice(0, 2);
    if (!ok.length) ok = scored;
    const roles = w.roles || ['smg', 'rifle'];
    const count = Math.round((w.count || 3) * (this.endless ? 1 : 1));
    for (let i = 0; i < count; i++) {
      const s = ok[i % ok.length];
      this.queue.push({ at: g.time + i * (w.gap ?? 0.7), entry: s.e, role: roles[i % roles.length], weapon: w.weapons ? w.weapons[i % w.weapons.length] : undefined, group: w.group || 'wave', hp: w.hp });
    }
    if (w.announce !== false && !this.restoring) g.ui.toast(t('hud.reinforce'));
  }

  _spawnQueued() {
    const g = this.game;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (g.time < q.at) continue;
      this.queue.splice(i, 1);
      const en = q.entry;
      if (en.door) { const d = this.door(en.door); if (d && !d.isOpen) { d.unlock(); d.open(en.x, en.z); g.audio.play('doorOpen', g.spatialAt(d.cx, d.y0 + 1, d.cz, 0.7)); } }
      const e = g.enemies.add({ role: q.role, weapon: q.weapon, x: en.x + (Math.random() - 0.5) * 0.8, y: en.y, z: en.z + (Math.random() - 0.5) * 0.8, yaw: en.yaw, group: q.group });
      if (q.hp) { e.health *= q.hp; e.maxHealth *= q.hp; }
    }
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    if (!this.active || this.done) return;
    const g = this.game;
    this.objT += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if (g.time < tm.at) continue;
      this.timers.splice(i, 1);
      if (tm.wave) this.wave(tm.wave);
      if (tm.action) this._run([tm.action]);
    }
    this._spawnQueued();
    if (this.endless) return;
    if (this.obj && this.obj.type === 'survive') {
      this.surviveLeft = Math.max(0, this.surviveLeft - dt);
    }
    this._check();
    this._checkpoints();
    this._areas();
    this._marker();
    if (this.def.update) this.def.update(g, this, dt);
  }

  _inZone(id) {
    const z = this.data.zones.find((q) => q.id === id);
    if (!z) return false;
    const P = this.game.player;
    return P.x >= z.x0 && P.x <= z.x1 && P.z >= z.z0 && P.z <= z.z1 && P.y >= z.y0 && P.y <= z.y1;
  }

  _check() {
    const o = this.obj;
    if (!o || !this.game.player.alive) return;
    let complete = false;
    switch (o.type) {
      case 'reach': complete = this._inZone(o.zone) && (!o.clear || this._groupsLeft({ groups: o.clear }) === 0); break;
      case 'interact': complete = o.ids.filter((id) => this.used.has(id)).length >= (o.count || o.ids.length); break;
      case 'destroy': complete = o.ids.every((id) => this.destroyed.has(id)); break;
      case 'kill': complete = this._groupsLeft(o) === 0 && this.objT > 0.5; break;
      case 'survive': complete = this.surviveLeft <= 0; break;
      case 'boss': complete = this.objT > 0.5 && !this.game.enemies.list.some((e) => e.alive && e.R.boss); break;
      default: break;
    }
    if (!complete) return;
    const g = this.game;
    this._run(o.onComplete);
    if (o.final) { this._complete(); return; }
    g.audio.play('objective', { gain: 0.7 });
    this._next();
  }

  _marker() {
    const o = this.obj;
    this.hasMarker = false;
    if (!o) return;
    const P = this.game.player;
    let pts = [];
    if (o.type === 'interact') pts = o.ids.filter((id) => !this.used.has(id)).map((id) => this.data.interacts.find((i) => i.id === id)).filter(Boolean).map((i) => [i.x, i.y + 0.8, i.z]);
    else if (o.type === 'destroy') pts = o.ids.filter((id) => !this.destroyed.has(id)).map((id) => this.data.destructibles.find((d) => d.id === id)).filter(Boolean).map((d) => [(d.box[0] + d.box[3]) / 2, d.box[4] + 0.6, (d.box[2] + d.box[5]) / 2]);
    else if (o.type === 'kill' && o.showEnemies) {
      pts = this.game.enemies.list.filter((e) => e.alive && (o.groups || [o.group]).includes(e.group)).map((e) => [e.body.x, e.body.y + 2.2, e.body.z]);
    }
    if (!pts.length && o.marker) pts = [o.marker];
    if (!pts.length) return;
    let best = pts[0], bd = Infinity;
    for (const p of pts) { const d = Math.hypot(p[0] - P.x, p[2] - P.z); if (d < bd) { bd = d; best = p; } }
    this.marker.set(best[0], best[1], best[2]);
    this.hasMarker = true;
  }

  _areas() {
    const P = this.game.player;
    const g = this.game;
    let key = null;
    for (const a of this.data.areas) {
      if (P.x >= a.x0 && P.x <= a.x1 && P.z >= a.z0 && P.z <= a.z1 && P.y >= a.y0 && P.y <= a.y1) { key = a.key; break; }
    }
    if (key && key !== this.areaKey) g.ui.area(t(key.startsWith('area.') ? key : 'area.' + key));
    if (key) this.areaKey = key;
    for (const tp of this.data.tips) {
      if (this.tipsShown.has(tp.key)) continue;
      if (P.x >= tp.x0 && P.x <= tp.x1 && P.z >= tp.z0 && P.z <= tp.z1) {
        this.tipsShown.add(tp.key);
        if (this.def.tutorial || tp.always) g.ui.tip(t(tp.key));
      }
    }
  }

  // ------------------------------------------------------------------ interaction
  interactUsable(it) {
    if (this.used.has(it.id) && !it.repeat) return false;
    if (it.from !== undefined && this.index < it.from) return false;
    return true;
  }

  nearestInteract(x, y, z, cam, dir) {
    if (!this.data) return null;
    let best = null, bs = -Infinity;
    for (const it of this.data.interacts) {
      if (!this.interactUsable(it)) continue;
      if (Math.abs(it.y - (y + 1)) > 1.6) continue;
      const dx = it.x - cam.x, dy = it.y - cam.y, dz = it.z - cam.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > it.r + 0.4) continue;
      const facing = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
      if (facing < 0.55 && d > 1.2) continue;
      const s = facing - d * 0.2;
      if (s > bs) { bs = s; best = it; }
    }
    return best;
  }

  interact(it) {
    const g = this.game;
    if (!this.interactUsable(it)) return;
    this.used.add(it.id);
    g.hazards.panelState(it.id, 'done');
    g.audio.play(it.sound || 'powerUp', { gain: 0.7 });
    this._run(it.actions);
    this._check();
    if (this.obj && (this.obj.type === 'interact') && this.obj.ids.includes(it.id)) g.ui.objective(this._label(), false);
  }

  // ------------------------------------------------------------------ events
  onEnemyKilled(e, head, cause) {
    const g = this.game;
    if (e.civilian) return;
    this.run.kills++;
    if (head) this.run.headshots++;
    const P = g.player;
    P.stats.kills = this.run.kills;
    P.stats.headshots = this.run.headshots;
    this.run.combo++;
    const mult = this.comboMult;
    const pts = Math.round((SCORE.kill + (head ? SCORE.headshot : 0) + (e.R.boss ? 1500 : e.R.scale ? 150 : 0)) * mult);
    this.run.killScore += pts;
    g.ui.killFeed(pts, mult, head);
    if (this.obj && this.obj.type === 'kill') g.ui.objective(this._label(), false);
    if (this.endless && g.endless) g.endless.onKill(e, pts);
  }

  get comboMult() {
    return Math.min(SCORE.comboMax, 1 + SCORE.comboStep * Math.max(0, this.run.combo - 1));
  }

  onPlayerDamaged() {
    this.run.combo = 0;
    this.run.noDamage = false;
  }

  onDestroyed(id) {
    this.destroyed.add(id);
    this.run.bonus += 200;
    if (this.obj && this.obj.type === 'destroy' && this.obj.ids.includes(id)) this.game.ui.objective(this._label(), false);
  }

  onSecret(i) {
    const g = this.game;
    if (this.secretsFound[i]) return;
    this.secretsFound[i] = true;
    const n = this.secretsFound.filter(Boolean).length;
    g.audio.play('secret', { gain: 0.8 });
    g.ui.toast(t('hud.secret', { n, m: 3 }), 'secret');
    if (!this.endless) {
      const rec = levelRecord(this.def.num);
      rec.secrets[i] = true;
      saveProgress();
      this._achievements();
    }
  }

  onBossStage(e, stage) {
    const st = (this.def.bossStages || [])[stage - 1];
    if (st) this._run(st);
  }

  // ------------------------------------------------------------------ checkpoints
  // A checkpoint arms when the player passes it and activates as soon as
  // the fighting around the player has ended (while still nearby).
  _checkpoints() {
    const g = this.game;
    const P = g.player;
    if (!P.alive) return;
    const cps = this.data.checkpoints;
    for (let i = this.cpIndex + 1; i < cps.length; i++) {
      const c = cps[i];
      if (this.index < c.need) continue;
      const d = Math.hypot(P.x - c.x, P.z - c.z);
      if (!c.armed && d < c.r && Math.abs(P.y - c.y) < 2.5) c.armed = true;
      if (!c.armed || d > 40) continue;
      if (g.enemies.combatNear(P.x, P.y, P.z, 24) || this.queue.length) continue;
      this.cpIndex = i;
      for (let k = 0; k <= i; k++) cps[k].armed = false;
      this.checkpoint = this._snapshot(c.at ? { x: c.at[0], y: c.at[1], z: c.at[2], yaw: c.at[3] ?? c.yaw } : { x: c.x, y: c.y, z: c.z, yaw: c.yaw });
      g.ui.checkpoint();
      g.audio.play('checkpoint', { gain: 0.7 });
      break;
    }
  }

  _snapshot(pos) {
    const g = this.game;
    const P = g.player;
    return {
      pos: { ...pos },
      loadout: P.getLoadout(),
      enemies: g.enemies.save(),
      items: g.items.save(),
      hazards: g.hazards.save(),
      doors: g.doors.map((d) => [d.isOpen, d.locked, d.target]),
      index: this.index,
      used: [...this.used],
      destroyed: [...this.destroyed],
      run: { ...this.run },
      stats: { ...P.stats },
      timers: this.timers.map((tm) => ({ ...tm, at: tm.at - g.time })),
      surviveLeft: this.surviveLeft,
      cpIndex: this.cpIndex,
      tipsShown: [...this.tipsShown],
      hooks: this.def.saveState ? this.def.saveState(g) : null,
    };
  }

  // Back to the last checkpoint: full health, the loadout carried there,
  // the enemies that were still alive, objective state, pickups, hazards.
  restoreCheckpoint(snap = this.checkpoint || this.startSnap) {
    const g = this.game;
    this.restoring = true;
    const s = snap;
    g.bullets.reset();
    g.player.reset(s.pos, s.loadout);
    g.enemies.restore(s.enemies);
    g.items.restore(s.items);
    g.items.list = g.items.list.filter((p) => p.type !== 'secret' || !this.secretsFound[p.index]);
    g.hazards.restore(s.hazards);
    g.doors.forEach((d, i) => d.setState(...s.doors[i]));
    this.used = new Set(s.used);
    this.destroyed = new Set(s.destroyed);
    this.run = { ...s.run };
    g.player.stats = { ...s.stats, time: g.player.stats.time, damageTaken: s.stats.damageTaken };
    this.timers = s.timers.map((tm) => ({ ...tm, at: tm.at + g.time }));
    this.queue = [];
    this.surviveLeft = s.surviveLeft;
    this.cpIndex = s.cpIndex;
    for (const c of this.data.checkpoints) c.armed = false;
    this.tipsShown = new Set(s.tipsShown);
    this.index = s.index;
    this.obj = this.objectives[this.index] || null;
    this.objT = 1;
    if (this.def.loadState) this.def.loadState(g, s.hooks);
    this.done = false;
    this.restoring = false;
    g.ui.objective(this._label(), false);
  }

  restartLevel() {
    const g = this.game;
    this.checkpoint = null;
    this.secretsFound = [false, false, false];
    g.items.load(this.data, g.diff.pickupTier, new Set(), this.secretsFound);
    const snap = { ...this.startSnap, items: g.items.save() };
    this.restoreCheckpoint(snap);
    this.run = { kills: 0, headshots: 0, killScore: 0, combo: 0, bonus: 0, noDamage: true };
    g.player.stats = { shots: 0, hits: 0, kills: 0, headshots: 0, time: 0, damageTaken: 0 };
    this.areaKey = null;
  }

  // ------------------------------------------------------------------ results
  results() {
    const g = this.game;
    const P = g.player;
    const st = P.stats;
    const acc = st.shots ? st.hits / st.shots : 0;
    const secrets = this.secretsFound.filter(Boolean).length;
    const par = this.def.par || 400;
    const timeBonus = Math.max(0, Math.round((par - st.time) * SCORE.timeBonus));
    const accuracy = Math.round(acc * SCORE.accuracy);
    const health = Math.round(Math.max(0, P.health) * SCORE.health);
    const secretPts = secrets * SCORE.secret;
    const raw = this.run.killScore + this.run.bonus + accuracy + timeBonus + health + secretPts;
    const score = Math.round(raw * g.diff.score);
    const th = starThresholds(this.totalEnemies);
    const stars = raw >= th.three ? 3 : raw >= th.two ? 2 : 1;
    return {
      time: st.time, kills: this.run.kills, headshots: this.run.headshots, accuracy: acc,
      damage: Math.round(st.damageTaken), secrets, score, stars, noDamage: this.run.noDamage,
      parts: { kills: this.run.killScore, bonus: this.run.bonus, accuracy, time: timeBonus, health, secrets: secretPts },
    };
  }

  _complete() {
    const g = this.game;
    this.done = true;
    const r = this.results();
    const n = this.def.num;
    const rec = levelRecord(n);
    r.newBest = r.score > rec.bestScore;
    r.newTime = !rec.bestTime || r.time < rec.bestTime;
    rec.completed = true;
    rec.bestScore = Math.max(rec.bestScore, r.score);
    rec.bestTime = rec.bestTime ? Math.min(rec.bestTime, r.time) : r.time;
    rec.stars = Math.max(rec.stars, r.stars);
    rec.kills = Math.max(rec.kills || 0, r.kills);
    for (let i = 0; i < 3; i++) if (this.secretsFound[i]) rec.secrets[i] = true;
    if (r.noDamage) rec.noDamage = true;
    if (g.difficulty === 'hard') rec.hard = true;
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVEL_COUNT, n + 1));
    progress.last = Math.min(LEVEL_COUNT, n + 1);
    if (n === LEVEL_COUNT) {
      r.campaignFirst = !progress.campaignWon;
      progress.campaignWon = true;
    }
    this._achievements(r);
    saveProgress();
    r.campaign = n === LEVEL_COUNT ? campaignStats() : null;
    g.onLevelComplete(r);
  }

  _achievements(r = null) {
    const g = this.game;
    const a = progress.achievements;
    const give = (id) => {
      if (a[id]) return;
      a[id] = Date.now();
      g.ui.toast(t('ach.toast', { name: t('ach.' + id) }), 'ach');
    };
    const recs = Array.from({ length: LEVEL_COUNT }, (_, i) => progress.levels[i + 1]);
    if (r && r.noDamage) give('flawless');
    if (recs.every((x) => x && x.completed)) give('campaign');
    if (recs.every((x) => x && x.hard)) { progress.hardWon = true; give('hard'); }
    if (recs.every((x) => x && x.secrets.every(Boolean))) give('secrets');
    saveProgress();
  }
}

export function campaignStats() {
  let time = 0, kills = 0, score = 0, secrets = 0;
  for (let i = 1; i <= LEVEL_COUNT; i++) {
    const r = progress.levels[i];
    if (!r) continue;
    time += r.bestTime || 0;
    kills += r.kills || 0;
    score += r.bestScore || 0;
    secrets += r.secrets.filter(Boolean).length;
  }
  return { time, kills, score, secrets };
}

export { LEVEL_COUNT, PLAYER };
