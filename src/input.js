// Keyboard + mouse, with pointer lock handled defensively:
//  * lock is only ever requested from inside a click handler;
//  * if the browser refuses a re-lock (e.g. right after Esc), the game pauses
//    again and asks the player to click;
//  * if pointer lock never works (unsupported, sandboxed iframe), we fall back
//    to plain mouse-move look with a visible cursor.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);
    this.pressed = Object.create(null);
    this.left = false;
    this.right = false;
    this.leftPressed = false;
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.everLocked = false;
    this.failures = 0;
    this.lastUnlock = 0;
    this.capture = false; // game wants mouse look
    const params = new URLSearchParams(location.search);
    this.inIframe = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
    this.fallback = params.has('nolock') || !('requestPointerLock' in canvas);
    this.onLockChange = null; // (locked) => {}
    this.onLockRefused = null; // () => {}
    this.onKey = null; // (code, event) => {}
    this.lastX = null;
    this.lastY = null;
    this.ignoreNext = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (this.capture && ['Space', 'Tab'].includes(e.code)) e.preventDefault(); return; }
      this.keys[e.code] = true;
      this.pressed[e.code] = true;
      if (this.capture && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyF'].includes(e.code)) e.preventDefault();
      if (this.onKey) this.onKey(e.code, e);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.left = this.right = false; });
    canvas.addEventListener('mousedown', (e) => this._down(e));
    window.addEventListener('mousedown', (e) => { if (this.locked && e.target !== canvas) this._down(e); });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    window.addEventListener('contextmenu', (e) => { if (this.capture || this.locked) e.preventDefault(); });
    window.addEventListener('mousemove', (e) => this._move(e));
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (locked === this.locked) return;
      this.locked = locked;
      if (locked) { this.everLocked = true; this.failures = 0; this.ignoreNext = 2; } else this.lastUnlock = performance.now();
      if (this.onLockChange) this.onLockChange(locked);
    });
    document.addEventListener('pointerlockerror', () => this._lockFailed(null));
  }

  _down(e) {
    if (e.button === 0) { this.left = true; this.leftPressed = true; }
    if (e.button === 2) this.right = true;
  }

  _move(e) {
    let dx = e.movementX, dy = e.movementY;
    if (dx === undefined) {
      dx = this.lastX === null ? 0 : e.clientX - this.lastX;
      dy = this.lastY === null ? 0 : e.clientY - this.lastY;
    }
    this.lastX = e.clientX; this.lastY = e.clientY;
    if (!this.capture) return;
    if (!this.locked && !this.fallback) return;
    if (this.ignoreNext > 0 && (Math.abs(dx) > 150 || Math.abs(dy) > 150)) { this.ignoreNext--; return; }
    // guard against the occasional huge spike some browsers report
    if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
    this.dx += dx;
    this.dy += dy;
  }

  // Must be called from inside a click/keydown handler.
  requestLock() {
    if (this.fallback) return;
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch((err) => this._lockFailed(err));
    } catch (err) {
      this._lockFailed(err);
    }
  }

  exitLock() {
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (e) { /* ignore */ }
    }
  }

  _lockFailed(err) {
    if (this.locked) return;
    this.failures++;
    const name = err && err.name;
    const msg = (err && err.message) || '';
    const never = this.inIframe && !this.everLocked;
    const unsupported = name === 'NotSupportedError' || name === 'SecurityError' || /sandbox|not allowed|unsupported/i.test(msg);
    if (!this.everLocked && (never || unsupported || this.failures >= 2)) {
      // pointer lock does not work here at all: use plain mouse-move look
      this.fallback = true;
      if (this.onLockChange) this.onLockChange(false, true);
      return;
    }
    if (this.onLockRefused) this.onLockRefused(err);
  }

  // Look deltas since last call.
  takeLook() {
    const r = [this.dx, this.dy];
    this.dx = 0; this.dy = 0;
    return r;
  }

  endFrame() {
    this.pressed = Object.create(null);
    this.leftPressed = false;
  }

  down(code) { return !!this.keys[code]; }
  hit(code) { return !!this.pressed[code]; }
}
