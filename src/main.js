// Way Through: game bootstrap, level loading, state machine and render loop.
import * as THREE from 'three';
import { Materials } from './materials.js';
import { World, SIGHT, BULLET, GLASS } from './world.js';
import { LevelKit, disposeGroup } from './levelkit.js';
import { LEVELS } from './levels/index.js';
import { FX } from './fx.js';
import { Bullets } from './bullets.js';
import { ViewModel, HOLD } from './viewmodel.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Enemies } from './enemies.js';
import { Player } from './player.js';
import { Items } from './items.js';
import { Hazards } from './hazards.js';
import { Env } from './env.js';
import { Mission, LEVEL_COUNT } from './mission.js';
import { Endless } from './endless.js';
import { UI } from './ui.js';
import { DIFFICULTY } from './config.js';
import { settings, loadSettings, saveSettings, loadStyle, saveStyle } from './settings.js';
import { progress, loadProgress, saveProgress, resetProgressForTests } from './save.js';
import { makeSkyTexture, makeBeltTexture } from './textures.js';
import { t } from './i18n.js';

// Quality never touches gameplay: resolution, shadow map, particles, decals,
// outline width.
const QUALITY = {
  low: { ratio: 0.75, shadow: 1024, particles: 0.4, decals: 0.35, lines: 0.8 },
  medium: { ratio: 1.25, shadow: 1536, particles: 0.7, decals: 0.7, lines: 1 },
  high: { ratio: 2, shadow: 2048, particles: 1, decals: 1, lines: 1 },
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const PREVIEW_KEY = 'waythrough.preview.v1.';

class Game {
  constructor() {
    loadSettings();
    loadProgress();
    this.settings = settings;
    this.style = loadStyle();
    this.state = 'boot';
    this.time = 0;
    this.previews = {};
    this.previewCache = {};
    this.previewQueue = Promise.resolve();
    this.drawCalls = 0;
    this.levels = LEVELS;
    this.level = null;
    this.endlessMode = false;
    this.combatMusic = false;
    this.forcedCombat = false;
    this.combatHold = 0;
    this.perf = { t: 0, frames: 0, slow: 0, hinted: false, hintT: 0 };

    const canvas = document.getElementById('game');
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new THREE.Fog(0xffffff, 30, 150);

    this.materials = new Materials();
    this.beltTex = makeBeltTexture();
    const belt = this.materials.get('belt');
    belt.map = this.beltTex; belt.emissiveMap = this.beltTex; belt.needsUpdate = true;
    this.world = new World({ x0: -10, z0: -10, x1: 10, z1: 10 });
    this.doors = [];
    this.nav = null;

    // lights (only matter for the Neobrutalist toon shading)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8c8ff, 0);
    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sunOffset = new THREE.Vector3(26, 48, 20);
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 160;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.07;
    this._shadowBox(38);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.skyCache = {};
    this.white = new THREE.Color(0xffffff);
    this._clouds();

    this.fx = new FX(this.scene, this.materials, this.world);
    this.bullets = new Bullets(this.scene, this.materials, this.world, this.fx);
    this.vm = new ViewModel(this.materials);
    this.audio = new Audio();
    this.audio.load();
    this.input = new Input(canvas);
    this.items = new Items(this);
    this.enemies = new Enemies(this);
    this.hazards = new Hazards(this);
    this.env = new Env(this);
    this.player = new Player(this);
    this.mission = new Mission(this);
    this.endless = new Endless(this);
    this.difficulty = settings.difficulty;
    this.diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.normal;
    this.quality = QUALITY[settings.quality] || QUALITY.high;
    this.ui = new UI(this);
    this.orbitA = 0.6;

    this._wire();
    this.applySettings(false);
    this.setStyle(this.style, false);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (this.input.fallback) document.body.classList.add('fallback-look');
    this.last = performance.now();
    requestAnimationFrame((tt) => this.frame(tt));
    // the menu backdrop is the level the player will continue on
    this.loadLevel(Math.min(progress.last || 1, LEVELS.length), { backdrop: true }).then(() => {
      window.__wtStarted = true;
      document.getElementById('boot').classList.add('hidden');
      this.state = 'menu';
      this.ui.show('menu');
      this.audio.setMusic('musicMenu');
    });
  }

  _shadowBox(h) {
    const c = this.sun.shadow.camera;
    c.left = -h; c.right = h; c.top = h; c.bottom = -h;
    c.updateProjectionMatrix();
    this.shadowHalf = h;
  }

  _clouds() {
    const geo = new THREE.PlaneGeometry(1, 0.5);
    const n = 16;
    const mesh = new THREE.InstancedMesh(geo, this.materials.cloud, n);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    mesh.name = 'clouds';
    this.cloudMesh = mesh;
    this.scene.add(mesh);
    this._placeClouds(-14, -30);
  }

  _placeClouds(cx, cz) {
    const mesh = this.cloudMesh;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let seed = 3;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.3;
      const R = 330 + r() * 80;
      p.set(cx + Math.sin(a) * R, 55 + r() * 70, cz + Math.cos(a) * R);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI);
      const w = 90 + r() * 70;
      s.set(w, w, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  _wire() {
    const P = () => this.player;
    this.bullets.onEnemyHit = (e, part, point, dir, b) => {
      let dmg = b.damage;
      if (b.weapon === 'shotgun') dmg *= Math.max(0.35, Math.min(1, 1.15 - b.d / 22));
      const r = this.enemies.damage(e, dmg, part, point, dir);
      P().registerHit(b);
      if (!r.killed) this.ui.hitMarker(part === 'head');
    };
    this.bullets.onWorldHit = (hit, b) => {
      if (hit.tag && hit.tag.startsWith('destructible:')) {
        this.hazards.damage(hit.tag, b.damage, hit);
        P().registerHit(b);
        this.ui.hitMarker(false);
      }
    };
    this.bullets.onPlayerHit = (b) => {
      const s = b.shooter.body;
      P().damage(b.damage, s.x, s.z, 'enemy');
    };
    this.bullets.onWhiz = (b, x, y, z) => {
      const p = P();
      const dx = x - p.cam.x, dz = z - p.cam.z;
      const pan = (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / (Math.hypot(dx, dz) || 1);
      this.audio.play('whiz', { gain: 0.55 * Math.max(0.3, 1 - b.minD / 1.8), pan: pan * 0.9, rate: 0.9 + Math.random() * 0.25 });
    };
    this.input.onKey = (code) => {
      if (code === 'KeyV' && ['playing', 'paused', 'lockwait', 'dead'].includes(this.state)) {
        this.setStyle(this.style === 'neo' ? 'classic' : 'neo');
        this.ui.styleToast(this.style);
      }
      if (code === 'Escape') {
        if (this.state === 'playing' && !this.input.locked) this.pause();
        else if (this.state === 'paused' && this.input.fallback) this.resume();
        else if (this.state === 'lockwait') this.pause();
      }
      if ((code === 'Enter' || code === 'Space') && this.state === 'ready' && !this.endlessMode) {
        // keyboard start from the loading card
      }
    };
    this.input.onLockChange = (locked, becameFallback) => {
      if (becameFallback) {
        document.body.classList.add('fallback-look');
        if (this.state === 'lockwait') this._enterPlaying();
        return;
      }
      if (locked) {
        if (this.state === 'lockwait') this._enterPlaying();
      } else if (this.state === 'playing') {
        this.pause();
      }
    };
    this.input.onLockRefused = () => {
      // e.g. re-lock requested too soon after Esc: stay paused, ask for a click
      if (this.state === 'playing' || this.state === 'lockwait' || this.state === 'paused') {
        this.state = 'lockwait';
        this.input.capture = false;
        this.ui.show('clicklock');
      }
    };
    // auto-pause whenever the page loses focus
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autoPause(); });
    window.addEventListener('blur', () => this.autoPause());
  }

  autoPause() {
    if (this.state === 'playing' || this.state === 'lockwait') this.pause();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const q = this.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
  }

  applySettings(save = true) {
    const s = settings;
    if (!this.endlessMode) {
      this.difficulty = s.difficulty;
      this.diff = DIFFICULTY[s.difficulty] || DIFFICULTY.normal;
    }
    this.audio.setVolumes({ master: s.master, sfx: s.sfx, ambience: s.ambience, music: s.music });
    const q = this.quality = QUALITY[s.quality] || QUALITY.high;
    if (this.sun.shadow.mapSize.x !== q.shadow) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.fx.q.particles = q.particles;
    this.fx.q.decals = q.decals;
    if (this.materials.lineScale !== q.lines) this.materials.setLineScale(q.lines);
    if (this.renderer.getPixelRatio() !== Math.min(window.devicePixelRatio || 1, q.ratio)) this.resize();
    if (save) saveSettings();
  }

  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } catch (e) { /* not supported */ }
  }

  _sky(key, cols) {
    if (!this.skyCache[key]) this.skyCache[key] = makeSkyTexture(...cols);
    return this.skyCache[key];
  }

  // Recolour shared materials in place and apply the level's look for this
  // style. Nothing is rebuilt: position, health, ammo, enemies, bodies and
  // decals are untouched.
  setStyle(style, save = true) {
    this.style = style;
    this.materials.apply(style);
    this._applyEnv(this.scene, this.level ? this.level.def : null, style);
    this.vm.sun.intensity = style === 'neo' ? Math.PI * 0.5 : 0;
    this.vm.ambient.intensity = style === 'neo' ? Math.PI * 0.72 : 0;
    this.ui.setStyle(style);
    if (save) saveStyle(style);
  }

  _applyEnv(scene, def, style, lights = { hemi: this.hemi, sun: this.sun }) {
    const neo = style === 'neo';
    const env = def ? def.env : { classic: { paper: 0xffffff, fog: [28, 150] }, neo: { sky: ['#3aa8ff', '#77ccff', '#ffe0f0', '#ffd6ea'], fog: 0xffe0f0, fogRange: [70, 300], sun: [26, 48, 20], sunI: 0.42, hemiI: 0.76, hemiSky: 0xffffff, hemiGround: 0xd8c8ff, clouds: true } };
    if (neo) {
      const n = env.neo;
      scene.background = this._sky(n.sky.join(), n.sky);
      scene.fog.color.set(n.fog);
      scene.fog.near = n.fogRange[0]; scene.fog.far = n.fogRange[1];
      lights.sun.castShadow = true;
      lights.sun.intensity = Math.PI * n.sunI;
      lights.sun.color.set(n.sunColor ?? 0xffffff);
      lights.hemi.intensity = Math.PI * n.hemiI;
      lights.hemi.color.set(n.hemiSky ?? 0xffffff);
      lights.hemi.groundColor.set(n.hemiGround ?? 0xd8c8ff);
      if (lights.sun === this.sun) this.sunOffset.set(...n.sun);
    } else {
      const c = env.classic;
      scene.background = new THREE.Color(c.paper ?? 0xffffff);
      scene.fog.color.set(c.fogColor ?? c.paper ?? 0xffffff);
      scene.fog.near = c.fog[0]; scene.fog.far = c.fog[1];
      lights.sun.castShadow = false;
      lights.sun.intensity = 0;
      lights.hemi.intensity = 0;
    }
    if (scene === this.scene) this.cloudMesh.visible = neo && env.neo.clouds !== false;
  }

  spatialAt(x, y, z, base) {
    const cam = this.camera.position;
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const yaw = this.player.yaw;
    const pan = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d;
    const occluded = !this.world.clear(cam.x, cam.y, cam.z, x, y, z, SIGHT);
    return { gain: base / (1 + d / 9), pan: pan * 0.8, lowpass: occluded ? 900 : Math.max(2500, 20000 - d * 220) };
  }

  // ------------------------------------------------------------------ levels
  // Staged build: geometry, colliders and nav over several frames with a
  // progress bar, then the old level is disposed.
  async loadLevel(n, { backdrop = false, endless = false } = {}) {
    const def = LEVELS[n - 1];
    this.loadToken = (this.loadToken || 0) + 1;
    const token = this.loadToken;
    if (this.level && this.level.def === def && !this.level.dirty) {
      this.ui.loadProgress(1);
      return this.level;
    }
    this.state = backdrop ? this.state : 'loading';
    this._disposeLevel();
    const K = new LevelKit(def, this.materials);
    let t0 = performance.now();
    const budget = 14;
    const run = async (gen, from, to) => {
      for (;;) {
        const r = gen.next();
        if (r.done) return r.value;
        if (typeof r.value === 'number') this.ui.loadProgress(from + (to - from) * Math.min(1, r.value));
        if (performance.now() - t0 > budget) { await nextFrame(); t0 = performance.now(); }
        if (token !== this.loadToken) throw new Error('superseded');
      }
    };
    await run(def.build(K), 0, 0.45);
    const fin = await run(K.finalize(), 0.45, 1);
    const level = {
      def, n, data: K.data, world: K.world, nav: K.nav, doors: K.doors, group: K.group, map: K.map,
      named: fin.named, beltTex: this.beltTex, dirty: false,
    };
    this.scene.add(K.group);
    this.level = level;
    this.world = level.world;
    this.fx.world = this.world;
    this.bullets.world = this.world;
    this.nav = level.nav;
    this.doors = level.doors;
    this.hazards.load(level);
    this.env.load(level);
    const mo = def.menuOrbit;
    this._placeClouds(mo.x, mo.z);
    this._shadowBox(def.env.neo.shadowBox || 38);
    this._applyEnv(this.scene, def, this.style);
    this.player.reset(level.data.start, def.loadout);
    this.mission.start(level, { endless });
    this.materials.get('lamp').emissiveIntensity = 1;
    // warm up shaders for this level so the first frame doesn't hitch
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
    return level;
  }

  _disposeLevel() {
    const L = this.level;
    if (!L) return;
    disposeGroup(L.group);
    this.items.clear();
    this.enemies.clear();
    this.hazards.reset();
    this.env.clear();
    this.fx.reset();
    this.bullets.reset();
    this.level = null;
  }

  // Reset a built level to its start (instant restart / replay).
  _freshStart(endless = false) {
    const L = this.level;
    for (const d of this.doors) d.reset();
    this.hazards.load(L);
    this.env.load(L);
    this.fx.reset();
    this.bullets.reset();
    this.player.reset(L.data.start, L.def.loadout);
    this.mission.start(L, { endless });
    if (L.def.onStart) L.def.onStart(this);
  }

  startCampaign() {
    this.startLevel(Math.min(progress.last || 1, progress.unlocked, LEVELS.length));
  }

  async startLevel(n) {
    this.audio.unlock();
    this.endlessMode = false;
    this.endless.stop();
    this.applySettings(false);
    this.input.capture = false;
    this.input.exitLock();
    progress.last = n;
    saveProgress();
    const def = LEVELS[n - 1];
    this.ui.showLoading(def);
    this.state = 'loading';
    try {
      await this.loadLevel(n);
    } catch (e) {
      if (e.message === 'superseded') return;
      throw e;
    }
    this._freshStart(false);
    this._prepareLevelAudio();
    this.state = 'ready';
    this.ui.loadReady();
  }

  _prepareLevelAudio() {
    const env = this.level.def.env;
    this.audio.setMusic(null);
    this.audio.setAmbience(env.ambience || ['wind']);
    this.audio.setReverb(env.reverb || 0);
    this.combatMusic = false;
    this.forcedCombat = false;
  }

  // Click on the loading card: capture the mouse and go.
  beginLevel() {
    if (this.state !== 'ready') return;
    this.audio.unlock();
    this.ui.resetRun();
    this.input.requestLock();
    const def = this.level.def;
    if (def.tutorial && !this.endlessMode) this.ui.showOverlay();
    if (!this.endlessMode) this.ui.objective(this.mission.label, false);
    this.time = Math.max(this.time, 0);
    if (this.input.fallback || this.input.locked) this._enterPlaying();
    else {
      this.state = 'lockwait';
      this.ui.show('hud');
    }
  }

  async startEndless() {
    this.audio.unlock();
    this.endlessMode = true;
    this.input.capture = false;
    this.input.exitLock();
    const n = this.endless.start(LEVELS.length);
    this.difficulty = settings.difficulty;
    this.ui.showLoading(LEVELS[n - 1], { endless: true, section: 0 });
    this.state = 'loading';
    await this.loadLevel(n, { endless: true });
    this._freshStart(true);
    this.endless.beginSection(this.level);
    this._prepareLevelAudio();
    this.state = 'ready';
    this.ui.loadReady();
  }

  // Next Endless section: keeps the mouse captured and continues on its own.
  async loadEndlessSection(n) {
    const locked = this.input.locked;
    this.ui.showLoading(LEVELS[n - 1], { endless: true, section: this.endless.section });
    this.state = 'loading';
    await this.loadLevel(n, { endless: true });
    this._freshStart(true);
    this.endless.beginSection(this.level);
    this._prepareLevelAudio();
    this.ui.resetRun();
    this.state = 'ready';
    if (locked && this.input.locked) { this._enterPlaying(); } else this.ui.loadReady();
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
    this.input.releaseAll();
    this.input.exitLock();
    this.ui.show('pause');
  }

  // Resume only once the pointer is captured again (or in fallback mode).
  resume() {
    this.audio.unlock();
    if (this.state !== 'paused' && this.state !== 'lockwait') return;
    if (this.input.fallback) { this._enterPlaying(); return; }
    this.state = 'lockwait';
    this.ui.show('hud');
    this.input.requestLock();
    if (this.input.locked) this._enterPlaying();
  }

  restartCheckpoint() {
    if (this.endlessMode) { this.startEndless(); return; }
    this.audio.unlock();
    this.mission.restoreCheckpoint();
    this.fx.reset();
    this._afterRestart();
  }

  restartLevel() {
    if (this.endlessMode) { this.startEndless(); return; }
    this.audio.unlock();
    this._freshStart(false);
    this._afterRestart();
  }

  _afterRestart() {
    this.ui.resetRun();
    this._prepareLevelAudio();
    this.state = 'lockwait';
    this.ui.show('hud');
    this.input.requestLock();
    if (this.input.fallback || this.input.locked) this._enterPlaying();
  }

  toMainMenu() {
    this.state = 'menu';
    this.endlessMode = false;
    this.endless.stop();
    this.applySettings(false);
    document.body.classList.remove('is-dead');
    this.input.capture = false;
    this.input.exitLock();
    this.ui.setFade(0);
    this.ui.hideOverlay();
    this.audio.setMusic('musicMenu');
    this.audio.setAmbience([]);
    this.audio.setReverb(0);
    this.ui.show('menu');
  }

  setCombatMusic(on) {
    this.forcedCombat = on;
  }

  onPlayerShot() {
    const p = this.player;
    this.enemies.hearShot(p.cam.x, p.cam.y, p.cam.z);
    // bullets pass through window panes: crack the glass on the way
    const b = this.bullets.player[this.bullets.player.length - 1];
    if (!b) return;
    const hit = {};
    let stop = 60;
    if (this.world.raycast(b.ox, b.oy, b.oz, b.dx, b.dy, b.dz, 60, BULLET, hit)) stop = hit.t;
    if (this.world.raycast(b.ox, b.oy, b.oz, b.dx, b.dy, b.dz, stop, GLASS, hit)) {
      this.fx.glass(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz);
      this.audio.play('glass', this.spatialAt(hit.x, hit.y, hit.z, 0.7));
      this.enemies.hearNoise(hit.x, hit.y, hit.z, 10);
    }
  }

  onNoise(x, y, z, r) { this.enemies.hearNoise(x, y, z, r); }

  onEnemyKilled(e, head, cause) {
    this.mission.onEnemyKilled(e, head, cause);
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.deathClock = 0;
    this.cardShown = false;
    this.ui.onDeath();
    this.ui.hideOverlay();
  }

  onLevelComplete(r) {
    this.state = 'results';
    this.input.capture = false;
    this.input.exitLock();
    this.audio.play('levelComplete', { gain: 0.8, priority: true });
    this.audio.setMusic('musicMenu');
    this.ui.hideOverlay();
    this.ui.showResults(r, this.level.def);
  }

  // ------------------------------------------------------------------ previews
  // A small shot of a level from its preview camera, in a given style. Built
  // off-screen in preview mode (no nav), cached in memory and localStorage.
  levelPreview(n, style) {
    const key = `${n}.${style}`;
    if (this.previewCache[key]) return Promise.resolve(this.previewCache[key]);
    try {
      const stored = window.localStorage.getItem(PREVIEW_KEY + key);
      if (stored) { this.previewCache[key] = stored; return Promise.resolve(stored); }
    } catch (e) { /* no storage */ }
    const job = this.previewQueue.then(() => this._renderPreview(n, style)).catch(() => '');
    this.previewQueue = job;
    return job;
  }

  stylePreview(style) {
    return this.levelPreview(this.level ? this.level.n : 1, style).then((u) => { this.previews[style] = u; return u; });
  }

  async _renderPreview(n, style) {
    const key = `${n}.${style}`;
    if (this.previewCache[key]) return this.previewCache[key];
    // wait until the game isn't busy loading or playing
    while (this.state === 'loading' || this.state === 'playing') await nextFrame();
    const def = LEVELS[n - 1];
    const K = new LevelKit(def, this.materials, { preview: true });
    let t0 = performance.now();
    const gen = def.build(K);
    for (let r = gen.next(); !r.done; r = gen.next()) {
      if (performance.now() - t0 > 10) { await nextFrame(); t0 = performance.now(); }
    }
    const fin = K.finalize();
    for (let r = fin.next(); !r.done; r = fin.next()) { /* merge */ }
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 30, 150);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8c8ff, 0);
    const sun = new THREE.DirectionalLight(0xffffff, 0);
    sun.castShadow = false;
    scene.add(hemi, sun, sun.target, K.group);
    const saved = this.style;
    this.materials.apply(style);
    this._applyEnv(scene, def, style, { hemi, sun });
    sun.castShadow = false;
    const pc = def.previewCam;
    sun.position.set(pc.p[0] + def.env.neo.sun[0], def.env.neo.sun[1], pc.p[2] + def.env.neo.sun[2]);
    sun.target.position.set(pc.p[0], 0, pc.p[2]);
    const W = 480, H = 270;
    const cam = new THREE.PerspectiveCamera(70, W / H, 0.05, 700);
    cam.position.set(...pc.p);
    cam.rotation.set(pc.pitch, pc.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    const oldLines = Object.values(this.materials.lines).map((m) => m.resolution.clone());
    for (const m of Object.values(this.materials.lines)) m.resolution.set(W, H);
    r.setRenderTarget(rt);
    r.clear();
    r.render(scene, cam);
    const px = new Uint8Array(W * H * 4);
    r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    r.setRenderTarget(null);
    Object.values(this.materials.lines).forEach((m, i) => m.resolution.copy(oldLines[i]));
    this.materials.apply(saved);
    rt.dispose();
    disposeGroup(K.group);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(img, 0, 0);
    let url = '';
    try { url = c.toDataURL('image/jpeg', 0.8); } catch (e) { url = ''; }
    this.previewCache[key] = url;
    try { window.localStorage.setItem(PREVIEW_KEY + key, url); } catch (e) { /* full */ }
    return url;
  }

  // ------------------------------------------------------------------ loop
  frame(now) {
    requestAnimationFrame((tt) => this.frame(tt));
    if (this.manual) { this.last = now; return; } // tests drive step() themselves
    const realDt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const dt = Math.min(realDt, 1 / 30);
    this.step(dt, realDt);
  }

  step(dt, realDt = dt) {
    const st = this.state;
    const L = this.level;
    if (st === 'playing' && L) {
      this.time += dt;
      this.player.update(dt, this.input, settings);
      this.enemies.update(dt, true);
      this.bullets.update(dt, this.enemies, this.player);
      this.items.update(dt);
      this.hazards.update(dt);
      for (const d of this.doors) d.update(dt);
      this.mission.update(dt);
      if (this.endlessMode) this.endless.update(dt);
      this._music(dt);
      this._perf(realDt);
    } else if (st === 'dead' && L) {
      this.time += dt;
      this.deathClock += dt;
      this.player.update(dt, this.input, settings);
      this.enemies.update(dt, true);
      this.bullets.update(dt, this.enemies, this.player);
      this.items.update(dt);
      this.hazards.update(dt);
      for (const d of this.doors) d.update(dt);
      // light grey -> grey -> charcoal, then the card
      const tt = this.deathClock;
      const stops = [[0, 0, [217, 217, 217]], [0.5, 0.5, [205, 205, 205]], [1.3, 0.78, [130, 130, 130]], [2.1, 0.94, [40, 40, 42]]];
      let a = stops[stops.length - 1][1], c = stops[stops.length - 1][2];
      for (let i = 0; i < stops.length - 1; i++) {
        const [t0, a0, c0] = stops[i], [t1, a1, c1] = stops[i + 1];
        if (tt >= t0 && tt < t1) {
          const k = (tt - t0) / (t1 - t0);
          a = a0 + (a1 - a0) * k;
          c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
          break;
        }
      }
      this.ui.setFade(a, `rgb(${c[0]},${c[1]},${c[2]})`);
      if (tt > 2.2 && !this.cardShown) {
        this.cardShown = true;
        this.input.capture = false;
        this.input.exitLock();
        this.ui.showDeath(this.endlessMode ? this.endless.finish() : null);
        this.audio.setMusic(null);
      }
    } else if ((st === 'menu' || st === 'boot' || st === 'loading') && L) {
      this.orbitA += dt * 0.045;
      const o = L.def.menuOrbit;
      this.camera.position.set(o.x + Math.sin(this.orbitA) * o.r, o.h, o.z + Math.cos(this.orbitA) * o.r);
      this.camera.lookAt(o.x, o.look, o.z);
      for (const d of this.doors) d.update(dt);
      this.hazards.update(dt);
    } else if (st === 'ready' && L) {
      this.player.applyCamera(settings);
      this.vm.update(dt, { moving: 0, aim: false, sprint: false, lookDX: 0, lookDY: 0, bob: false });
      this.hazards.update(dt);
    }
    this.input.endFrame();
    this.fx.update(dt, this.camera);
    if (L) this.env.update(st === 'paused' ? 0 : dt, this.camera);
    this.ui.update(st === 'playing' || st === 'dead' ? dt : 0, realDt);
    if (this.noRender || !L) return;
    this._updateSun();
    this._render(['playing', 'paused', 'lockwait', 'ready'].includes(st) || (st === 'dead' && this.deathClock < 1.5));
  }

  // Low-intensity combat loop while anyone is fighting you, fading out a few
  // seconds after the last fight.
  _music(dt) {
    const fighting = this.forcedCombat || this.enemies.anyInCombat();
    if (fighting) this.combatHold = 6;
    else this.combatHold = Math.max(0, this.combatHold - dt);
    const want = this.combatHold > 0;
    if (want !== this.combatMusic) {
      this.combatMusic = want;
      this.audio.setMusic(want ? 'musicCombat' : null);
    }
  }

  // Watch the frame rate; if it stays low, suggest (never force) a lower
  // quality setting.
  _perf(realDt) {
    const p = this.perf;
    p.t += realDt; p.frames++;
    if (p.hintT > 0) { p.hintT -= realDt; if (p.hintT <= 0) this.ui.perfHint(false); }
    if (p.t < 5) return;
    const fps = p.frames / p.t;
    p.t = 0; p.frames = 0;
    if (fps < 40 && settings.quality !== 'low') p.slow++; else p.slow = 0;
    if (p.slow >= 2 && !p.hinted) {
      p.hinted = true;
      p.hintT = 9;
      this.ui.perfHint(true);
    }
  }

  _updateSun() {
    if (!this.sun.castShadow) return;
    const L = this.level;
    const p = this.player;
    // props that would throw shadows into interiors switch off while inside
    for (const tg of L.data.shadowToggles) {
      const inside = this.state !== 'menu' && p.y < tg.yMax && p.x > tg.x0 && p.x < tg.x1 && p.z > tg.z0 && p.z < tg.z1;
      const named = L.named[tg.builder];
      if (named) for (const m of named.meshes) m.castShadow = !inside;
    }
    const o = L.def.menuOrbit;
    const c = this.state === 'menu' || this.state === 'loading' ? new THREE.Vector3(o.x, 0, o.z) : this.camera.position;
    const texel = (this.shadowHalf * 2) / this.sun.shadow.mapSize.x;
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
    this.items.beginGuns();
    this.enemies.render();
    this.items.render();
    this.fx.updateFlashes(this.camera);
    r.clear();
    r.render(this.scene, this.camera);
    if (withViewModel && this.player.alive !== undefined) {
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
      items: this.items.snapshot(),
      fx: this.fx.snapshot(),
      doors: this.doors.map((d) => [d.angle, d.isOpen, d.id, d.locked]),
      mission: this.mission.obj ? { index: this.mission.index, type: this.mission.obj.type, label: this.mission.label, cp: this.mission.cpIndex, done: this.mission.done } : null,
      level: this.level ? this.level.def.id : null,
      style: this.style,
      state: this.state,
      drawCalls: this.drawCalls,
    };
  }
}

function boot() {
  try {
    const game = new Game();
    window.WT = { game, snapshot: () => game.snapshot(), THREE, HOLD, progress, resetProgress: resetProgressForTests, t };
  } catch (err) {
    console.error(err);
    const l = document.getElementById('boot-msg');
    if (l) { l.textContent = t('loading.error', { msg: err && err.message ? err.message : String(err) }); l.classList.remove('hidden'); }
    window.__wtStarted = true;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
