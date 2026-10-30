// The first-kill tutorial. It runs once, the first time the game is played,
// on North Gate's roof, against one of the level's own guards (no extra map,
// no extra enemy):
//   shoot: time slows to a crawl and the screen edges fade out, a big red
//          arrow hangs over the guard, and one short line says how to shoot.
//          The view starts on him, so the first click (or tap) is the shot;
//          on a desktop that same click also captures the mouse.
//   ammo:  once he is down, one line about the ammo counter and how to reload,
//          with the counter pulsing and the arrow pointing at it.
//   out:   time eases back to normal and the player is on their own.
// Nobody notices the player while they line up the shot, and they cannot be
// hurt until time is back to normal.
import * as THREE from 'three';
import { t } from './i18n.js';
import { progress, saveProgress } from './save.js';
import { SIGHT } from './world.js';
import { PLAYER } from './config.js';

const SLOW = 0.12; // time scale while the tutorial holds the moment
const AMMO_HOLD = 2.4; // real seconds of the ammo line before time returns
const RAMP = 0.8; // real seconds for time to come back
const LINGER = 1.8; // the last line stays this long once time is back

const _v = new THREE.Vector3();
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.phase = null; // 'shoot' | 'ammo' | 'out' | null
    this.scale = 1;
    this.target = null;
    this.t = 0;
    this.arrow = document.getElementById('tut-arrow');
    this.text = document.getElementById('tut-text');
    this.vig = document.getElementById('slowmo');
    this.ammo = document.getElementById('ammo');
  }

  get active() { return !!this.phase; }
  // nobody notices the player while they line up the first shot
  get calm() { return this.phase === 'shoot'; }
  // and they can't be hurt until time is back to normal
  get safe() { return this.phase === 'shoot' || this.phase === 'ammo'; }

  // Returns false, and changes nothing, when no guard is in view to aim at.
  start() {
    const e = this._pickTarget();
    if (!e) return false;
    this.target = e;
    e.health = 1; // any hit takes him down
    this.phase = 'shoot';
    this.t = 0;
    this.handAimed = false;
    this.scale = SLOW;
    this._aim(1);
    document.body.classList.add('tut-on');
    this.vig.style.opacity = '1';
    const touch = this.game.touch && this.game.touch.active;
    this._say(touch ? t('tut.shoot.touch') : t('tut.shoot'));
    this.game.audio.play('slowIn', { bus: 'ui', gain: 0.7 });
    return true;
  }

  // Leaving the level, restarting, or going to the menu ends it on the spot.
  stop() {
    if (!this.phase) return;
    this.phase = null;
    this.scale = 1;
    this.target = null;
    this._clear();
  }

  // Any kill during the shoot phase counts: the point was the first shot.
  onKill() {
    if (this.phase !== 'shoot') return;
    this.phase = 'ammo';
    this.t = 0;
    const touch = this.game.touch && this.game.touch.active;
    this._say(touch ? t('tut.ammo.touch') : t('tut.ammo'));
    this.ammo.classList.add('tut-pulse');
    if (touch && this.game.touch.btn.reload) this.game.touch.btn.reload.classList.add('tut-pulse');
    // the moment is done: it never has to be seen again
    progress.tutorialSeen = true;
    saveProgress();
  }

  // Real (unscaled) seconds: the tutorial's own clock keeps going while game
  // time crawls.
  update(realDt) {
    if (!this.phase) return;
    const g = this.game;
    this.t += realDt;
    if (this.phase === 'shoot') {
      const e = this.target;
      if (!e || !e.alive) { this.onKill(); return; }
      // keep the guard under the crosshair until the player aims for themselves
      const P = g.player;
      if (Math.abs(P.lookDX || 0) + Math.abs(P.lookDY || 0) > 3) this.handAimed = true;
      if (!this.handAimed) this._aim(Math.min(1, realDt * 8));
      _v.set(e.body.x, e.body.y + (1.63 + 0.62) * e.k * (e.R.head || 1), e.body.z);
      this._arrowAt(_v);
    } else if (this.phase === 'ammo') {
      this._arrowAtEl(this.ammo);
      if (this.t >= AMMO_HOLD) {
        this.phase = 'out';
        this.t = 0;
        this.vig.style.opacity = '0';
        this.arrow.classList.add('hidden');
        g.audio.play('slowOut', { bus: 'ui', gain: 0.6 });
      }
    } else if (this.phase === 'out') {
      const k = Math.min(1, this.t / RAMP);
      this.scale = SLOW + (1 - SLOW) * (k * k * (3 - 2 * k));
      if (this.t >= RAMP + LINGER) {
        this.phase = null;
        this.scale = 1;
        this.target = null;
        this._clear();
        // now the first objective, briefly
        g.ui.objective(g.mission.label || '', true);
      }
    }
  }

  // ---------------------------------------------------------------- helpers
  // The nearest guard on the player's own level, in plain view, preferring one
  // standing still over one on patrol.
  _pickTarget() {
    const g = this.game;
    const P = g.player;
    const ex = P.x, ey = P.y + PLAYER.eye, ez = P.z;
    let best = null, bs = Infinity;
    for (const e of g.enemies.list) {
      if (!e.alive || e.civilian || e.perch || e.sniper || e.R.boss) continue;
      if (Math.abs(e.body.y - P.y) > 1.2) continue;
      const d = Math.hypot(e.body.x - ex, e.body.z - ez);
      if (d > 32) continue;
      const cy = e.body.y + 1.3 * e.k;
      if (!g.world.clear(ex, ey, ez, e.body.x, cy, e.body.z, SIGHT)) continue;
      // rather one seen whole than one peeking over a crate
      const head = g.world.clear(ex, ey, ez, e.body.x, e.body.y + 1.65 * e.k, e.body.z, SIGHT);
      const hips = g.world.clear(ex, ey, ez, e.body.x, e.body.y + 0.9 * e.k, e.body.z, SIGHT);
      const s = d + (e.spawn.patrol ? 6 : 0) + (head ? 0 : 10) + (hips ? 0 : 10);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  // Turn the view toward the target's chest; k = 1 snaps.
  _aim(k) {
    const P = this.game.player, e = this.target;
    const dx = e.body.x - P.x, dz = e.body.z - P.z;
    const dy = e.body.y + 1.25 * e.k - (P.y + PLAYER.eye);
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    P.yaw += angDiff(P.yaw, yaw) * k;
    P.pitch += (pitch - P.pitch) * k;
  }

  _say(html) {
    this.text.innerHTML = html;
    this.text.classList.remove('hidden', 'out');
  }

  _clear() {
    document.body.classList.remove('tut-on');
    this.vig.style.opacity = '0';
    this.arrow.classList.add('hidden');
    this.text.classList.add('out');
    this.ammo.classList.remove('tut-pulse');
    const rb = this.game.touch && this.game.touch.btn && this.game.touch.btn.reload;
    if (rb) rb.classList.remove('tut-pulse');
    setTimeout(() => { if (!this.phase) this.text.classList.add('hidden'); }, 400);
  }

  // Hang the arrow over a world point; off screen it waits at the edge,
  // turned toward it.
  _arrowAt(p) {
    const cam = this.game.camera;
    _v.copy(p).project(cam);
    const W = window.innerWidth, H = window.innerHeight;
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    const behind = _v.z > 1;
    if (behind) { x = W - x; y = H - y; }
    const m = 60;
    const off = behind || x < m || x > W - m || y < m + 70 || y > H - m;
    let rot = 0;
    if (off) {
      const cx = W / 2, cy = H / 2;
      let ax = x - cx, ay = y - cy;
      if (behind && Math.abs(ax) < 1 && Math.abs(ay) < 1) ax = 1;
      const s = Math.min((cx - m) / Math.max(1e-3, Math.abs(ax)), (cy - m - 35) / Math.max(1e-3, Math.abs(ay)));
      x = cx + ax * s; y = cy + ay * s;
      // the arrow's picture points down (+y) and turns about its tip:
      // rotate(r) takes +y to (-sin r, cos r), so aim that along (ax, ay)
      rot = Math.atan2(-ax, ay) * 180 / Math.PI;
    }
    this._placeArrow(x, y, rot);
  }

  // Point at a HUD element: from above it, or from below when it sits at the
  // top of the screen (touch layouts move the ammo panel up there).
  _arrowAtEl(el) {
    const r = el.getBoundingClientRect();
    if (!r.width) { this.arrow.classList.add('hidden'); return; }
    const below = r.top < 110;
    const x = r.left + r.width / 2;
    if (below) this._placeArrow(x, r.bottom + 8, 180);
    else this._placeArrow(x, r.top - 8, 0);
  }

  _placeArrow(x, y, rot) {
    this.arrow.classList.remove('hidden');
    this.arrow.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
  }
}
