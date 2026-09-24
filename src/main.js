// Way Through: game bootstrap, state machine and render loop.
import * as THREE from 'three';
import { Materials } from './materials.js';
import { World } from './world.js';
import { buildLevel } from './level.js';
import { FX } from './fx.js';
import { Bullets } from './bullets.js';
import { ViewModel, HOLD } from './viewmodel.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Enemies } from './enemies.js';
import { Player } from './player.js';
import { UI, areaAt } from './ui.js';
import { DIFFICULTY, PLAYER_START } from './config.js';
import { settings, loadSettings, saveSettings, loadStyle, saveStyle, loadBest, saveBest } from './settings.js';
import { makeSkyTexture } from './textures.js';

const QUALITY = {
  low: { ratio: 0.75, shadow: 1024 },
  medium: { ratio: 1.25, shadow: 2048 },
  high: { ratio: 2, shadow: 2048 },
};

class Game {
  constructor() {
    loadSettings();
    this.settings = settings;
    this.style = loadStyle();
    this.state = 'loading';
    this.time = 0;
    this.previews = {};
    this.drawCalls = 0;

    const canvas = document.getElementById('game');
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new THREE.Fog(0xffffff, 30, 150);

    this.materials = new Materials();
    this.world = new World();
    this.level = buildLevel(this.scene, this.materials, this.world);
    this.doors = this.level.doors;
    this.nav = this.level.nav;

    // lights (only matter for the Neobrutalist toon shading)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8c8ff, 0);
    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sunOffset = new THREE.Vector3(26, 48, 20);
    this.sun.shadow.camera.left = -38; this.sun.shadow.camera.right = 38;
    this.sun.shadow.camera.top = 38; this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 140;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.07;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.skyNeo = makeSkyTexture('#3aa8ff', '#77ccff', '#ffe0f0', '#ffd6ea');
    this.white = new THREE.Color(0xffffff);
    this._clouds();

    this.fx = new FX(this.scene, this.materials, this.world);
    this.bullets = new Bullets(this.scene, this.materials, this.world, this.fx);
    this.vm = new ViewModel(this.materials);
    this.audio = new Audio();
    this.audio.load();
    this.input = new Input(canvas);
    this.enemies = new Enemies(this);
    this.enemies.spawnAll(this.level.spawns);
    this.player = new Player(this);
    this.player.reset(PLAYER_START);
    this.ui = new UI(this);
    this.diff = DIFFICULTY[settings.difficulty];
    this.best = loadBest();
    this.orbitA = 0.6;

    this._wire();
    this.applySettings(false);
    this.setStyle(this.style, false);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._makePreviews();
    document.getElementById('loading').classList.add('hidden');
    this.state = 'menu';
    this.ui.show('menu');
    if (this.input.fallback) document.body.classList.add('fallback-look');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  _clouds() {
    const geo = new THREE.PlaneGeometry(1, 0.5);
    const n = 16;
    const mesh = new THREE.InstancedMesh(geo, this.materials.cloud, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let seed = 3;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.3;
      const R = 330 + r() * 80;
      p.set(-14 + Math.sin(a) * R, 55 + r() * 70, -30 + Math.cos(a) * R);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI);
      const w = 90 + r() * 70;
      s.set(w, w, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    mesh.name = 'clouds';
    this.scene.add(mesh);
  }

  _wire() {
    const P = () => this.player;
    this.bullets.onEnemyHit = (e, part, point, dir, b) => {
      let dmg = b.damage;
      if (b.weapon === 'shotgun') dmg *= Math.max(0.35, Math.min(1, 1.15 - b.d / 22));
      this.enemies.damage(e, dmg, part, point, dir);
      P().registerHit(b);
      this.ui.hitMarker(part === 'head');
    };
    this.bullets.onPlayerHit = (b) => {
      const s = b.shooter.body;
      P().damage(b.damage, s.x, s.z);
    };
    this.bullets.onWhiz = (b, x, y, z) => {
      const p = P();
      const dx = x - p.cam.x, dz = z - p.cam.z;
      const pan = (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / (Math.hypot(dx, dz) || 1);
      this.audio.play('whiz', { gain: 0.55 * Math.max(0.3, 1 - b.minD / 1.8), pan: pan * 0.9, rate: 0.9 + Math.random() * 0.25 });
    };
    this.input.onKey = (code, e) => {
      if (code === 'KeyV' && (this.state === 'playing' || this.state === 'paused')) {
        this.setStyle(this.style === 'neo' ? 'classic' : 'neo');
        this.ui.styleToast(this.style);
      }
      if (code === 'Escape') {
        if (this.state === 'playing' && !this.input.locked) this.pause();
        else if (this.state === 'paused' && this.input.fallback) this.resume();
        else if (this.state === 'lockwait') this.pause();
      }
    };
    this.input.onLockChange = (locked, becameFallback) => {
      if (becameFallback) {
        document.body.classList.add('fallback-look');
        if (this.state === 'lockwait') this._enterPlaying();
        return;
      }
      if (locked) {
        if (this.state === 'lockwait' || this.state === 'paused') this._enterPlaying();
      } else if (this.state === 'playing') {
        this.pause();
      }
    };
    this.input.onLockRefused = () => {
      // e.g. re-lock requested too soon after Esc: pause again, ask for a click
      if (this.state === 'playing' || this.state === 'lockwait' || this.state === 'paused') {
        this.state = 'lockwait';
        this.input.capture = false;
        this.ui.show('clicklock');
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const q = QUALITY[settings.quality] || QUALITY.high;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
  }

  applySettings(save = true) {
    const s = settings;
    this.diff = DIFFICULTY[s.difficulty] || DIFFICULTY.normal;
    this.audio.setVolumes({ master: s.master, sfx: s.sfx, ambience: s.ambience });
    const q = QUALITY[s.quality] || QUALITY.high;
    if (this.sun.shadow.mapSize.x !== q.shadow) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    if (this.renderer.getPixelRatio() !== Math.min(window.devicePixelRatio || 1, q.ratio)) this.resize();
    if (save) saveSettings();
  }

  // Recolour shared materials in place. No object is rebuilt, so position,
  // health, ammo, enemies, bodies and decals are untouched.
  setStyle(style, save = true) {
    this.style = style;
    const neo = style === 'neo';
    this.materials.apply(style);
    this.scene.background = neo ? this.skyNeo : this.white;
    this.scene.fog.color.set(neo ? 0xffe0f0 : 0xffffff);
    this.scene.fog.near = neo ? 70 : 28;
    this.scene.fog.far = neo ? 300 : 150;
    this.sun.castShadow = neo;
    this.sun.intensity = neo ? Math.PI * 0.42 : 0;
    this.hemi.intensity = neo ? Math.PI * 0.76 : 0;
    this.vm.sun.intensity = neo ? Math.PI * 0.5 : 0;
    this.vm.ambient.intensity = neo ? Math.PI * 0.72 : 0;
    this.ui.setStyle(style);
    if (save) saveStyle(style);
  }

  // Render both styles from inside the game for the Visual Style menu.
  _makePreviews() {
    const saved = this.style;
    const r = this.renderer;
    const W = 640, H = 360;
    const oldRatio = r.getPixelRatio();
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    const cam = this.camera;
    const oldAspect = cam.aspect;
    cam.aspect = W / H; cam.updateProjectionMatrix();
    this.vm.setAspect(W / H);
    cam.position.set(-19.5, 1.62, -3.5);
    cam.rotation.set(0.07, 0.22, 0, 'YXZ');
    this.vm.setWeapon('smg', true);
    this.vm.update(0.016, { moving: 0, aim: false, sprint: false, lookDX: 0, lookDY: 0, bob: false });
    this.enemies.render();
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    for (const st of ['classic', 'neo']) {
      this.setStyle(st, false);
      this._updateSun();
      this._render(true);
      ctx.drawImage(r.domElement, 0, 0, W, H);
      try { this.previews[st] = out.toDataURL('image/jpeg', 0.85); } catch (e) { this.previews[st] = ''; }
    }
    this.setStyle(saved, false);
    r.setPixelRatio(oldRatio);
    cam.aspect = oldAspect; cam.updateProjectionMatrix();
    this.resize();
  }

  // ------------------------------------------------------------------ states
  resetRun() {
    this.time = 0;
    this.player.reset(PLAYER_START);
    this.enemies.spawnAll(this.level.spawns);
    for (const d of this.doors) d.reset();
    this.fx.reset();
    this.bullets.reset();
    this.ui.resetRun();
    this.vm.setWeapon(this.player.weapon.id, false);
    this.cardShown = false;
    this.wonAt = null;
  }

  startGame() {
    this.audio.unlock();
    this.audio.startAmbience();
    this.resetRun();
    this.input.requestLock();
    this._enterPlaying();
  }

  _enterPlaying() {
    this.state = 'playing';
    this.input.capture = true;
    this.input.takeLook();
    this.ui.show('hud');
    this.last = performance.now();
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'lockwait') return;
    this.state = 'paused';
    this.input.capture = false;
    this.input.left = this.input.right = false;
    this.input.exitLock();
    this.ui.show('pause');
  }

  resume() {
    this.audio.unlock();
    if (this.state !== 'paused' && this.state !== 'lockwait') return;
    this.input.requestLock();
    this._enterPlaying();
  }

  restart() {
    this.audio.unlock();
    this.audio.startAmbience();
    this.resetRun();
    this.input.requestLock();
    this._enterPlaying();
  }

  toMainMenu() {
    this.state = 'menu';
    document.body.classList.remove('is-dead');
    this.input.capture = false;
    this.input.exitLock();
    this.ui.setFade(0);
    this.ui.show('menu');
  }

  onPlayerShot() {
    const p = this.player;
    this.enemies.hearShot(p.cam.x, p.cam.y, p.cam.z);
  }

  onNoise(x, y, z, r) { this.enemies.hearNoise(x, y, z, r); }

  onEnemyKilled(e, head) {
    this.player.stats.kills++;
    if (head) this.player.stats.headshots++;
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.deathClock = 0;
    this.ui.onDeath();
  }

  win() {
    if (this.state !== 'playing') return;
    this.state = 'won';
    this.input.capture = false;
    this.input.exitLock();
    const st = this.player.stats;
    const acc = st.shots ? st.hits / st.shots : 0;
    const diffMul = { easy: 0.75, normal: 1, hard: 1.4 }[settings.difficulty] || 1;
    const score = Math.round((st.kills * 100 + st.headshots * 50 + acc * 1000 + Math.max(0, 600 - st.time) * 4 + 500) * diffMul);
    const newBest = score > this.best;
    if (newBest) { this.best = score; saveBest(score); }
    this.audio.play('win', { gain: 0.8, priority: true });
    this.ui.showWin({ time: st.time, kills: st.kills, total: this.enemies.list.length, headshots: st.headshots, accuracy: acc, score, best: this.best, newBest });
  }

  // ------------------------------------------------------------------ loop
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (this.manual) { this.last = now; return; } // tests drive step() themselves
    const realDt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const dt = Math.min(realDt, 1 / 30);
    this.step(dt, realDt);
  }

  step(dt, realDt = dt) {
    const st = this.state;
    if (st === 'playing') {
      this.time += dt;
      this.player.update(dt, this.input, settings);
      this.enemies.update(dt, true);
      this.bullets.update(dt, this.enemies, this.player);
      for (const d of this.doors) d.update(dt);
      const p = this.player;
      this.ui.area(areaAt(p.x, p.y, p.z));
    } else if (st === 'dead') {
      this.time += dt;
      this.deathClock += dt;
      this.player.update(dt, this.input, settings);
      this.enemies.update(dt, true);
      this.bullets.update(dt, this.enemies, this.player);
      for (const d of this.doors) d.update(dt);
      // light grey -> grey -> charcoal, then the card
      const t = this.deathClock;
      const stops = [[0, 0, [217, 217, 217]], [0.5, 0.5, [205, 205, 205]], [1.3, 0.78, [130, 130, 130]], [2.3, 0.97, [40, 40, 42]]];
      let a = stops[stops.length - 1][1], c = stops[stops.length - 1][2];
      for (let i = 0; i < stops.length - 1; i++) {
        const [t0, a0, c0] = stops[i], [t1, a1, c1] = stops[i + 1];
        if (t >= t0 && t < t1) {
          const k = (t - t0) / (t1 - t0);
          a = a0 + (a1 - a0) * k;
          c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
          break;
        }
      }
      this.ui.setFade(a, `rgb(${c[0]},${c[1]},${c[2]})`);
      if (t > 2.6 && !this.cardShown) {
        this.cardShown = true;
        this.input.capture = false;
        this.input.exitLock();
        this.ui.show('death');
      }
    } else if (st === 'menu') {
      this.orbitA += dt * 0.045;
      const cx = -14, cz = -26;
      this.camera.position.set(cx + Math.sin(this.orbitA) * 58, 24, cz + Math.cos(this.orbitA) * 58);
      this.camera.lookAt(cx, 4, cz);
      this.enemies.update(dt, false);
      for (const d of this.doors) d.update(dt);
    }
    this.input.endFrame();
    this.fx.update(dt, this.camera);
    this.ui.update(st === 'playing' || st === 'dead' ? dt : 0, realDt);
    if (this.noRender) return; // headless tests can skip drawing
    this._updateSun();
    this._render(st === 'playing' || st === 'paused' || st === 'lockwait' || (st === 'dead' && this.deathClock < 1.5) || st === 'won');
  }

  _updateSun() {
    if (!this.sun.castShadow) return;
    // rooftop props don't cast into the building while you're inside it
    const p = this.player;
    const inside = this.state !== 'menu' && p.y < 4.6 && p.x > -34 && p.x < 3 && p.z > 0 && p.z < 18;
    for (const m of this.level.roofProps) m.castShadow = !inside && m.userData.cast !== false;
    const c = this.state === 'menu' ? new THREE.Vector3(-14, 0, -26) : this.camera.position;
    const texel = 76 / this.sun.shadow.mapSize.x;
    const tx = Math.round(c.x / texel) * texel, tz = Math.round(c.z / texel) * texel;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunOffset.x, this.sunOffset.y, tz + this.sunOffset.z);
    this.sun.target.updateMatrixWorld();
  }

  _render(withViewModel) {
    const r = this.renderer;
    r.info.reset();
    this.camera.fov = settings.fov * (1 - 0.1 * (this.player.aiming ? 1 : 0));
    this.camera.updateProjectionMatrix();
    this.bullets.render();
    this.enemies.render();
    this.fx.updateFlashes(this.camera);
    r.clear();
    r.render(this.scene, this.camera);
    if (withViewModel) {
      r.clearDepth();
      r.render(this.vm.scene, this.vm.camera);
      this.vm.frameRendered();
    }
    this.drawCalls = r.info.render.calls;
  }

  // ------------------------------------------------------------------ testing hooks
  snapshot() {
    return {
      player: this.player.snapshot(),
      enemies: this.enemies.snapshot(),
      fx: this.fx.snapshot(),
      doors: this.doors.map((d) => [d.angle, d.isOpen]),
      style: this.style,
      state: this.state,
    };
  }
}

function boot() {
  try {
    const game = new Game();
    window.WT = { game, snapshot: () => game.snapshot(), THREE, HOLD };
  } catch (err) {
    console.error(err);
    const l = document.getElementById('loading');
    if (l) l.textContent = 'Could not start: ' + (err && err.message ? err.message : err) + ' (WebGL required)';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
