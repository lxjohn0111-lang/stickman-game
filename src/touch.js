// Touch controls for phones and tablets. They drive the same Input state the
// keyboard and mouse do, so the player code does not know the difference:
//  * left half: a floating joystick (analog walk; push to the rim to sprint);
//  * right half: drag to look;
//  * buttons: fire (hold; dragging on it also looks), aim and crouch
//    (toggles), jump, reload, weapon swap, visual style and pause;
//  * the interaction prompt under the crosshair becomes a button (F).
// A light aim assist pulls the view toward the enemy nearest the crosshair
// while the fire button is held. It can be switched off in the settings.

const LOOK_GAIN = 2.2; // touch pixels -> mouse-pixel units used by the player

export function detectTouch() {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  // a touch screen as the primary pointer (phones, tablets); touch laptops
  // keep mouse controls until they are actually touched (see main.js)
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return !!coarse && navigator.maxTouchPoints > 0;
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.active = false;
    this.ptrs = new Map();
    this.root = document.getElementById('touch');
    this.base = this.root.querySelector('.stick');
    this.knob = this.root.querySelector('.stick i');
    this.btn = {};
    for (const b of this.root.querySelectorAll('[data-tb]')) this.btn[b.dataset.tb] = b;
    const r = this.root;
    r.addEventListener('pointerdown', (e) => this._down(e));
    r.addEventListener('pointermove', (e) => this._move(e));
    r.addEventListener('pointerup', (e) => this._up(e));
    r.addEventListener('pointercancel', (e) => this._up(e));
    r.addEventListener('lostpointercapture', (e) => this._up(e));
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    // the interaction prompt is a button on touch screens
    const prompt = document.getElementById('prompt');
    prompt.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this._tap('KeyF');
      prompt.classList.add('down');
      setTimeout(() => prompt.classList.remove('down'), 120);
    });
  }

  enable(on) {
    this.active = on;
    document.body.classList.toggle('touch', on);
    this.input.touchMode = on;
    if (on) this.input.fallback = true; // no pointer lock on touch screens
  }

  // Forget every finger (pause, death, leaving the level).
  reset() {
    for (const [id] of this.ptrs) { try { this.root.releasePointerCapture(id); } catch (e) { /* gone */ } }
    this.ptrs.clear();
    this.input.stick = null;
    this.input.left = false;
    this.input.keys.ShiftLeft = false;
    this.base.classList.remove('on');
    for (const b of Object.values(this.btn)) b.classList.remove('down');
    this._syncToggles();
  }

  _syncToggles() {
    this.btn.aim.classList.toggle('on', !!this.input.right);
    this.btn.crouch.classList.toggle('on', !!this.input.keys.KeyC);
  }

  _tap(code) {
    this.input.keys[code] = true;
    this.input.pressed[code] = true;
    setTimeout(() => { this.input.keys[code] = false; }, 90);
  }

  _down(e) {
    if (!this.active) return;
    e.preventDefault();
    this.game.audio.unlock();
    const b = e.target.closest('[data-tb]');
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, kind: 'look' };
    try { this.root.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    const inp = this.input;
    if (b) {
      p.kind = 'btn'; p.btn = b.dataset.tb;
      b.classList.add('down');
      switch (p.btn) {
        case 'fire': inp.left = true; inp.leftPressed = true; break;
        case 'aim': inp.right = !inp.right; break;
        case 'crouch': inp.keys.KeyC = !inp.keys.KeyC; break;
        case 'jump': inp.keys.Space = true; inp.pressed.Space = true; break;
        case 'reload': this._tap('KeyR'); break;
        case 'swap': this._tap('KeyQ'); break;
        case 'pause': this.game.pause(); break;
        case 'style': { const g = this.game; g.setStyle(g.style === 'neo' ? 'classic' : 'neo'); g.ui.styleToast(g.style); break; }
        default: break;
      }
      this._syncToggles();
    } else if (e.clientX < window.innerWidth * 0.45 && ![...this.ptrs.values()].some((q) => q.kind === 'stick')) {
      p.kind = 'stick';
      const R = this._radius();
      p.cx = Math.max(R + 8, e.clientX);
      p.cy = Math.min(window.innerHeight - R - 8, Math.max(R + 8, e.clientY));
      this.base.style.left = `${p.cx}px`;
      this.base.style.top = `${p.cy}px`;
      this.base.classList.add('on');
      this._stick(p, e.clientX, e.clientY);
    }
    this.ptrs.set(e.pointerId, p);
  }

  _radius() { return 56 * (this.game.settings.touchSize || 1); }

  _stick(p, x, y) {
    const R = this._radius();
    let dx = x - p.cx, dy = y - p.cy;
    let d = Math.hypot(dx, dy);
    // floating base: follow the thumb when it wanders far past the rim
    if (d > R * 1.7) {
      const k = (d - R * 1.7) / d;
      p.cx += dx * k; p.cy += dy * k;
      this.base.style.left = `${p.cx}px`;
      this.base.style.top = `${p.cy}px`;
      dx = x - p.cx; dy = y - p.cy; d = Math.hypot(dx, dy);
    }
    const c = Math.min(d, R);
    const ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
    this.knob.style.transform = `translate(${(ux * c).toFixed(1)}px, ${(uy * c).toFixed(1)}px)`;
    let m = c / R;
    m = m < 0.14 ? 0 : (m - 0.14) / 0.86;
    const f = -uy * m, s = ux * m;
    this.input.stick = { f, s };
    // at the rim and mostly forward: sprint
    this.input.keys.ShiftLeft = d > R * 0.96 && f > 0.6;
    this.base.classList.toggle('sprint', !!this.input.keys.ShiftLeft);
  }

  _move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (p.kind === 'stick') this._stick(p, e.clientX, e.clientY);
    else if (p.kind === 'look' || p.btn === 'fire') {
      // guard against the odd jump when a finger is re-detected
      if (Math.abs(dx) > 160 || Math.abs(dy) > 160) return;
      this.input.dx += dx * LOOK_GAIN;
      this.input.dy += dy * LOOK_GAIN;
    }
  }

  _up(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    const inp = this.input;
    if (p.kind === 'stick') {
      inp.stick = null;
      inp.keys.ShiftLeft = false;
      this.base.classList.remove('on', 'sprint');
      this.knob.style.transform = '';
    } else if (p.kind === 'btn') {
      const b = this.btn[p.btn];
      if (b) b.classList.remove('down');
      if (p.btn === 'fire') inp.left = false;
      if (p.btn === 'jump') inp.keys.Space = false;
    }
  }

  // Per frame, before the player update: gentle aim assist while firing.
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const P = g.player;
    this._syncToggles();
    this.assist = null;
    if (!g.settings.aimAssist || !this.input.left || !P.alive) return;
    const cam = P.cam;
    const fx = -Math.sin(P.yaw) * Math.cos(P.pitch), fy = Math.sin(P.pitch), fz = -Math.cos(P.yaw) * Math.cos(P.pitch);
    let best = null, bestA = 0.11; // ~6 degrees
    for (const e of g.enemies.list) {
      if (!e.alive || e.civilian) continue;
      const j = e.joints;
      const tx = (j[1].x + j[2].x) / 2, ty = (j[1].y + j[2].y) / 2 + 0.05, tz = (j[1].z + j[2].z) / 2;
      const vx = tx - cam.x, vy = ty - cam.y, vz = tz - cam.z;
      const d = Math.hypot(vx, vy, vz);
      if (d > 45 || d < 0.5) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, (vx * fx + vy * fy + vz * fz) / d)));
      if (a >= bestA) continue;
      if (!g.world.clear(cam.x, cam.y, cam.z, tx, ty, tz, 2)) continue;
      best = { vx, vy, vz }; bestA = a;
    }
    if (!best) return;
    const yaw = Math.atan2(-best.vx, -best.vz);
    const pitch = Math.atan2(best.vy, Math.hypot(best.vx, best.vz));
    const dyaw = Math.atan2(Math.sin(yaw - P.yaw), Math.cos(yaw - P.yaw));
    const dp = pitch - P.pitch;
    this.assist = { dyaw, dp }; // for tests
    const k = Math.min(1, dt * 10) * 0.5;
    const sens = 0.0021 * g.settings.sensitivity * (P.aiming ? 0.7 : 1);
    this.input.dx += (-dyaw * k) / sens;
    this.input.dy += (-dp * k) / sens * (g.settings.invertY ? -1 : 1);
  }
}
