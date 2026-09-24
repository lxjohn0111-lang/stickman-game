// DOM overlay: HUD, menus, cards, minimap. Styling for both visual styles is
// in index.html; switching style just swaps a class on <body>.
import { handwrite } from './handwriting.js';
import { DIFFICULTY } from './config.js';

const $ = (sel) => document.querySelector(sel);

const CONTROLS = [
  [['W', 'A', 'S', 'D'], 'Move'],
  [['Mouse'], 'Look'],
  [['Left click'], 'Fire (hold for automatic weapons)'],
  [['Right click'], 'Steady aim (hold)'],
  [['Space'], 'Jump'],
  [['Shift'], 'Sprint'],
  [['C'], 'Crouch (hold). Left Ctrl works too'],
  [['F'], 'Interact: open / close doors, swap guns, take ammo'],
  [['R'], 'Reload'],
  [['V'], 'Toggle visual style (Classic / Neobrutalist)'],
  [['Esc'], 'Pause'],
];

const AREAS = {
  roof: 'Roof',
  stairs: 'Stair room',
  kitchen: 'Kitchen',
  canteen: 'Canteen',
  yard: 'Yard',
  gate: 'North Gate',
};
const AREA_ORDER = ['roof', 'stairs', 'kitchen', 'canteen', 'yard', 'gate'];

export function areaAt(x, y, z) {
  if (z > 0 && x > -34 && x < 3) {
    if (y > 4.6 && z > 14.2 - 0.1 && Math.abs(x) < 1.1 && z < 15.8) return 'roof';
    if (y > 4.9) return 'roof';
    if (x > -3) return 'stairs';
    if (x > -12) return 'kitchen';
    return 'canteen';
  }
  if (z < -66) return 'gate';
  return 'yard';
}

export class UI {
  constructor(game) {
    this.game = game;
    this.body = document.body;
    this.hud = $('#hud');
    this.prompt = $('#prompt');
    this.vignette = $('#vignette');
    this.hitdir = $('#hitdir');
    this.hitdirText = $('#hitdir span');
    this.edges = { AHEAD: $('#edge-top'), BEHIND: $('#edge-bottom'), LEFT: $('#edge-left'), RIGHT: $('#edge-right') };
    this.edgeT = { AHEAD: 0, BEHIND: 0, LEFT: 0, RIGHT: 0 };
    this.hitdirT = 0;
    this.hitmarker = $('#hitmarker');
    this.hitmarkerT = 0;
    this.ammo = $('#ammo');
    this.fps = $('#fps');
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    this.toastEl = $('#toast');
    this.toastT = 0;
    this.styleToastEl = $('#styletoast');
    this.styleToastT = 0;
    this.areaEl = $('#area');
    this.areaT = 0;
    this.lastArea = null;
    this.visited = new Set();
    this.fade = $('#fade');
    this.promptKey = '';
    this.menuSection = 'style';
    this.pauseSection = 'mission';

    for (const el of document.querySelectorAll('.logo-hw')) el.appendChild(handwrite('Way through', { height: 58, stroke: 6, animate: true, delay: 0.1 }));
    this._wireNav('#menu', '#menu-panel', (s) => { this.menuSection = s; });
    this._wireNav('#pause', '#pause-panel', (s) => { this.pauseSection = s; });
    $('#btn-try').addEventListener('click', () => { this.click(); this.game.restart(true); });
    $('#btn-again').addEventListener('click', () => { this.click(); this.game.restart(true); });
    $('#btn-win-menu').addEventListener('click', () => { this.click(); this.game.toMainMenu(); });
    for (const a of document.querySelectorAll('#death .links a')) {
      a.addEventListener('click', () => {
        this.click();
        const sub = $('#deathsub');
        sub.classList.remove('hidden');
        this.renderSection(a.dataset.sub, $('#deathsub-panel'), true);
      });
    }
    $('#deathsub').addEventListener('click', (e) => { if (e.target.id === 'deathsub') $('#deathsub').classList.add('hidden'); });
    $('#clicklock').addEventListener('click', () => this.game.resume());
    for (const b of document.querySelectorAll('nav.menu-nav button')) {
      b.addEventListener('mouseenter', () => this.game.audio.play('uiHover', { bus: 'ui', gain: 0.5 }));
    }
  }

  click() { this.game.audio.play('uiClick', { bus: 'ui', gain: 0.7 }); }

  _wireNav(rootSel, panelSel, remember) {
    const root = $(rootSel);
    for (const b of root.querySelectorAll('nav button')) {
      b.addEventListener('click', () => {
        this.game.audio.unlock();
        this.click();
        if (b.dataset.go) {
          const go = b.dataset.go;
          if (go === 'play') this.game.startGame();
          else if (go === 'resume') this.game.resume();
          else if (go === 'restart') this.game.restart(true);
          else if (go === 'mainmenu') this.game.toMainMenu();
          return;
        }
        remember(b.dataset.sec);
        this.renderSection(b.dataset.sec, $(panelSel));
        for (const o of root.querySelectorAll('nav button')) o.classList.toggle('active', o === b);
      });
    }
  }

  setStyle(style) {
    this.body.classList.toggle('style-neo', style === 'neo');
    this.body.classList.toggle('style-classic', style !== 'neo');
    // refresh open panels so previews / minimap match
    for (const [id, sec] of [['#menu-panel', this.menuSection], ['#pause-panel', this.pauseSection]]) {
      const p = $(id);
      if (!p.closest('.screen').classList.contains('hidden')) this.renderSection(sec, p);
    }
  }

  styleToast(style) {
    this.styleToastEl.textContent = `Style: ${style === 'neo' ? 'Neobrutalist' : 'Classic'}`;
    this.styleToastT = 1.6;
  }

  // ------------------------------------------------------------------ screens
  show(which) {
    for (const id of ['#menu', '#pause', '#death', '#win', '#clicklock']) $(id).classList.add('hidden');
    $('#deathsub').classList.add('hidden');
    this.hud.classList.toggle('hidden', !(which === 'hud' || which === 'clicklock' || which === 'dead'));
    if (which === 'menu') {
      $('#menu').classList.remove('hidden');
      this.renderSection(this.menuSection, $('#menu-panel'));
      this._markActive('#menu', this.menuSection);
    } else if (which === 'pause') {
      $('#pause').classList.remove('hidden');
      this.renderSection(this.pauseSection, $('#pause-panel'));
      this._markActive('#pause', this.pauseSection);
    } else if (which === 'death') {
      $('#death').classList.remove('hidden');
      const t = $('#death-title');
      t.innerHTML = '';
      t.appendChild(handwrite('No way through.', { height: 62, stroke: 6.5, delay: 0.05, seed: 3 }));
      setTimeout(() => $('#btn-try').focus({ preventScroll: true }), 50);
    } else if (which === 'win') {
      $('#win').classList.remove('hidden');
    } else if (which === 'clicklock') {
      $('#clicklock').classList.remove('hidden');
    }
    this.body.classList.toggle('playing', which === 'hud');
  }

  _markActive(rootSel, sec) {
    for (const o of document.querySelectorAll(`${rootSel} nav button`)) o.classList.toggle('active', o.dataset.sec === sec);
  }

  showWin(s) {
    const t = $('#win-title');
    t.innerHTML = '';
    t.appendChild(handwrite('Way through.', { height: 62, stroke: 6.5, delay: 0.05, seed: 5 }));
    const mm = Math.floor(s.time / 60), ss = (s.time % 60).toFixed(1).padStart(4, '0');
    const rows = [
      ['Time', `${mm}:${ss}`],
      ['Kills', `${s.kills} / ${s.total}`],
      ['Headshots', String(s.headshots)],
      ['Accuracy', `${Math.round(s.accuracy * 100)}%`],
      ['Score', String(s.score)],
      ['Best', String(s.best) + (s.newBest ? '  (new)' : '')],
    ];
    $('#win-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    this.show('win');
  }

  // ------------------------------------------------------------------ sections
  renderSection(sec, panel, compact = false) {
    const g = this.game;
    panel.innerHTML = '';
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
    const title = (t) => panel.appendChild(h('h2', '', t));
    if (sec === 'style') {
      title('Visual Style');
      const grid = h('div', 'styles');
      for (const [id, name, desc] of [
        ['classic', 'Classic', 'White unlit surfaces, thin black ink edges, solid black stickmen.'],
        ['neo', 'Neobrutalist', 'Saturated colours, 3 px outlines, toon shading and hard sun shadows.'],
      ]) {
        const c = h('button', 'style-card' + (g.style === id ? ' selected' : ''));
        const img = document.createElement('img');
        img.alt = `${name} preview`;
        if (g.previews[id]) img.src = g.previews[id];
        c.appendChild(img);
        c.appendChild(h('div', 't', name));
        c.appendChild(h('div', 'd', desc));
        c.addEventListener('click', () => { this.click(); g.setStyle(id); this.renderSection('style', panel); });
        grid.appendChild(c);
      }
      panel.appendChild(grid);
      panel.appendChild(h('p', 'hint', '<br>Previews are rendered from the game itself. Press <kbd class="k">V</kbd> during play to switch instantly; your choice is saved.'));
    } else if (sec === 'controls') {
      title('Controls');
      const t = h('table', 'keys');
      t.innerHTML = CONTROLS.map(([keys, what]) => `<tr><td>${keys.map((k) => `<kbd class="k">${k}</kbd>`).join('')}</td><td>${what}</td></tr>`).join('');
      panel.appendChild(t);
      if (g.input.fallback) panel.appendChild(h('p', 'hint', '<br>Pointer lock is unavailable here, so the game is using plain mouse-move look.'));
    } else if (sec === 'settings') {
      title('Settings');
      panel.appendChild(this._settings());
    } else if (sec === 'howto') {
      title('How to Play');
      panel.appendChild(h('div', '', `
        <p>You start on a rooftop. Find a way through the building and out across the fenced yard to the <b>North Gate</b> beyond the water tower. Walk through the gate to win.</p>
        <p><b>Route:</b> roof &rarr; stair hut &rarr; stair room &rarr; kitchen &rarr; canteen &rarr; yard &rarr; North Gate.</p>
        <p><b>Fighting.</b> Enemies notice you gradually while they can see you, then fight in bursts, strafe, chase you through doors and search where they last saw you. They hear gunfire, less so through walls. Headshots do about 2.5&times; damage.</p>
        <p><b>Dodge.</b> Enemy bullets are slow teardrops. Watch them come and side-step. A whiz means one just missed.</p>
        <p><b>Health</b> regenerates when you stay out of fire. The screen edges darken as you get hurt, and a <span style="letter-spacing:.2em">HIT - LEFT</span> style note tells you where fire is coming from.</p>
        <p><b>Guns.</b> Fallen enemies drop their weapon. Press <kbd class="k">F</kbd> to swap, or to take its ammo if it is the gun you already carry. Chain-link fences stop you but not bullets.</p>`));
    } else if (sec === 'credits') {
      title('Credits');
      panel.appendChild(h('div', '', `
        <p><b>Way Through</b>: a first-person stickman shooter.</p>
        <p>Rendering: three.js r170 (MIT), bundled with esbuild.</p>
        <p>Art: none. Every object is built at load time from boxes, cylinders and cones, and outlined with screen-space ink lines.</p>
        <p>Sound: none on disk. Every sound is synthesised with the Web Audio API and pre-rendered into buffers.</p>
        <p class="hint">Recreated from a gameplay brief. See README.md for what was reproduced and what was inferred.</p>`));
    } else if (sec === 'mission') {
      title('Mission');
      const wrap = h('div', 'mission');
      const left = h('div', '');
      left.appendChild(h('p', '', 'Get off the roof, fight down through the kitchen and canteen, cross the yard past the water tower and walk out through the <b>North Gate</b>.'));
      const cur = this.lastArea || 'roof';
      const ul = h('ul', 'route');
      for (const a of AREA_ORDER) {
        const li = h('li', a === cur ? 'now' : this.visited.has(a) ? 'done' : '', `${AREA_ORDER.indexOf(a) + 1}. ${AREAS[a]}`);
        ul.appendChild(li);
      }
      left.appendChild(ul);
      const alive = g.enemies.alive, total = g.enemies.list.length;
      left.appendChild(h('p', 'hint', `<br>Hostiles remaining: ${alive} of ${total}. Difficulty: ${DIFFICULTY[g.settings.difficulty].label}.`));
      wrap.appendChild(left);
      const cv = document.createElement('canvas');
      cv.width = 440; cv.height = 620;
      wrap.appendChild(cv);
      panel.appendChild(wrap);
      this.drawMinimap(cv);
    }
    if (compact) {
      const close = h('p', 'hint', '<br>Click outside this panel to close it.');
      panel.appendChild(close);
    }
  }

  _settings() {
    const g = this.game;
    const s = g.settings;
    const box = document.createElement('div');
    box.className = 'settings';
    const row = (label, el) => {
      const l = document.createElement('label');
      l.textContent = label;
      box.appendChild(l);
      box.appendChild(el);
    };
    const slider = (key, min, max, step, fmt) => {
      const wrap = document.createElement('div');
      const i = document.createElement('input');
      i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = s[key];
      const v = document.createElement('span');
      v.className = 'val';
      v.textContent = fmt(s[key]);
      i.addEventListener('input', () => { s[key] = Number(i.value); v.textContent = fmt(s[key]); g.applySettings(); });
      wrap.style.display = 'flex'; wrap.style.alignItems = 'center';
      wrap.appendChild(i); wrap.appendChild(v);
      return wrap;
    };
    const seg = (key, options) => {
      const d = document.createElement('div');
      d.className = 'seg';
      for (const [val, label] of options) {
        const b = document.createElement('button');
        b.textContent = label;
        b.classList.toggle('on', s[key] === val);
        b.addEventListener('click', () => {
          this.click();
          s[key] = val;
          for (const o of d.children) o.classList.toggle('on', o === b);
          g.applySettings();
        });
        d.appendChild(b);
      }
      return d;
    };
    const pct = (v) => `${Math.round(v * 100)}%`;
    row('Mouse sensitivity', slider('sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)));
    row('Invert Y', seg('invertY', [[false, 'Off'], [true, 'On']]));
    row('Field of view', slider('fov', 60, 100, 1, (v) => `${v}°`));
    row('Master volume', slider('master', 0, 1, 0.05, pct));
    row('Effects volume', slider('sfx', 0, 1, 0.05, pct));
    row('Ambience volume', slider('ambience', 0, 1, 0.05, pct));
    row('Difficulty', seg('difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]));
    row('Screen shake', slider('shake', 0, 1, 0.05, pct));
    row('View bob', seg('viewBob', [[false, 'Off'], [true, 'On']]));
    row('Quality', seg('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]));
    row('Ammo readout', seg('ammo', [[false, 'Off'], [true, 'On']]));
    row('FPS counter', seg('fps', [[false, 'Off'], [true, 'On']]));
    return box;
  }

  // Top-down map of the level with the route and the player's arrow.
  drawMinimap(cv) {
    const g = this.game;
    const map = g.level.map;
    const ctx = cv.getContext('2d');
    const neo = g.style === 'neo';
    const X0 = -50, X1 = 22, Z0 = -90, Z1 = 22;
    const pad = 14;
    const sc = Math.min((cv.width - pad * 2) / (X1 - X0), (cv.height - pad * 2) / (Z1 - Z0));
    const ox = pad + ((cv.width - pad * 2) - (X1 - X0) * sc) / 2;
    const tx = (x) => ox + (x - X0) * sc;
    const tz = (z) => pad + (z - Z0) * sc;
    ctx.fillStyle = neo ? '#a8f0c0' : '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const fillFor = { building: neo ? '#ff8cc6' : '#fff', path: neo ? '#f5ead0' : '#f3f3f3', block: neo ? '#ffc89c' : '#eee', pad: neo ? '#d5d8ec' : '#f3f3f3', table: neo ? '#ff9a3d' : '#fff', prop: neo ? '#e9ebff' : '#fff', cover: neo ? '#ffb13d' : '#fff', guard: neo ? '#9b7bff' : '#fff', gate: neo ? '#20c05a' : '#111', hut: neo ? '#3fd6ee' : '#fff', stair: neo ? '#d5d8ec' : '#fff', wall: '#111' };
    const order = ['path', 'building', 'pad', 'block', 'prop', 'table', 'cover', 'stair', 'hut', 'guard', 'wall', 'gate'];
    ctx.lineWidth = neo ? 1.6 : 1;
    ctx.strokeStyle = '#111';
    for (const k of order) {
      for (const r of map.rects) {
        if (r.k !== k) continue;
        const x = tx(r.x0), y = tz(r.z0), w = Math.max(1.5, (r.x1 - r.x0) * sc), hh = Math.max(1.5, (r.z1 - r.z0) * sc);
        ctx.fillStyle = fillFor[k] || '#fff';
        ctx.fillRect(x, y, w, hh);
        if (k !== 'path' && k !== 'wall') ctx.strokeRect(x, y, w, hh);
      }
    }
    ctx.setLineDash([3, 3]);
    for (const l of map.lines) {
      ctx.beginPath(); ctx.moveTo(tx(l.ax), tz(l.az)); ctx.lineTo(tx(l.bx), tz(l.bz)); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const c of map.circles) {
      ctx.beginPath();
      ctx.arc(tx(c.x), tz(c.z), Math.max(1.5, c.r * sc), 0, Math.PI * 2);
      ctx.fillStyle = c.k === 'tree' ? (neo ? '#2ecf78' : '#fff') : c.k === 'watertower' ? (neo ? '#46d2f0' : '#fff') : '#111';
      ctx.fill();
      ctx.stroke();
      if (c.k === 'watertower') {
        ctx.fillStyle = '#111';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('W', tx(c.x), tz(c.z));
      }
    }
    // route
    const route = g.level.route;
    ctx.strokeStyle = neo ? '#ff2bd6' : '#111';
    ctx.lineWidth = neo ? 3 : 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    route.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), tz(p.z)) : ctx.moveTo(tx(p.x), tz(p.z))));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of route) {
      if (!p.label || p.label === 'W') continue;
      ctx.beginPath();
      ctx.arc(tx(p.x), tz(p.z), 8, 0, Math.PI * 2);
      ctx.fillStyle = neo ? '#ffe600' : '#fff';
      ctx.fill();
      ctx.lineWidth = neo ? 2.5 : 1.2;
      ctx.strokeStyle = '#111';
      ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.fillText(p.label, tx(p.x), tz(p.z) + 0.5);
    }
    ctx.fillStyle = '#111';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('N ↑', 8, 12);
    ctx.fillText('NORTH GATE', tx(-11), tz(-86));
    // player arrow
    const P = g.player;
    const px = tx(P.x), pz = tz(P.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-P.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fillStyle = neo ? '#ff2bd6' : '#111';
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ HUD
  hit(dir) {
    this.hitdirText.textContent = `HIT - ${dir}`;
    this.hitdirT = 1.3;
    this.edgeT[dir] = 1;
  }

  hitMarker(head) {
    this.hitmarker.classList.toggle('head', !!head);
    this.hitmarkerT = 0.14;
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastT = 1.8;
  }

  area(key) {
    if (key === this.lastArea) return;
    this.lastArea = key;
    this.visited.add(key);
    this.areaEl.querySelector('span').textContent = AREAS[key];
    this.areaT = 2.6;
  }

  onDeath() {
    this.body.classList.add('is-dead');
    this.toastT = 0;
    this.hitdirT = Math.min(this.hitdirT, 0.6);
  }

  resetRun() {
    this.body.classList.remove('is-dead');
    this.visited.clear();
    this.lastArea = null;
    this.hitdirT = 0;
    for (const k in this.edgeT) this.edgeT[k] = 0;
    this.setFade(0, '#d9d9d9');
  }

  setFade(alpha, color) {
    this.fade.style.opacity = String(alpha);
    if (color) this.fade.style.background = color;
  }

  update(dt, realDt) {
    const g = this.game;
    const P = g.player;
    const s = g.settings;
    // FPS
    this.fpsAcc += realDt; this.fpsN++; this.fpsT += realDt;
    if (this.fpsT > 0.5) {
      const info = g.renderer.info.render;
      this.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps  ${g.drawCalls} draws`;
      this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
      void info;
    }
    this.fps.classList.toggle('hidden', !s.fps);
    // damage vignette (no health bar)
    const hurt = P.alive ? 1 - P.health / 100 : 1;
    this.vignette.style.opacity = String(Math.min(1, Math.pow(hurt, 0.85) * 1.05));
    // hit direction + edge flash
    this.hitdirT = Math.max(0, this.hitdirT - dt);
    this.hitdir.style.opacity = String(Math.min(1, this.hitdirT * 2.5));
    for (const k of Object.keys(this.edgeT)) {
      this.edgeT[k] = Math.max(0, this.edgeT[k] - dt * 1.8);
      this.edges[k].style.opacity = String(this.edgeT[k] * 0.9);
    }
    this.hitmarkerT = Math.max(0, this.hitmarkerT - dt);
    this.hitmarker.style.opacity = this.hitmarkerT > 0 ? '1' : '0';
    // prompt pill
    let key = '';
    const t = P.alive ? P.lookTarget : null;
    if (t) {
      if (t.kind === 'door') key = t.door.isOpen ? 'close' : 'open';
      else key = t.pickup.weapon === P.weapon.id ? `ammo:${t.pickup.weapon}` : `swap:${t.pickup.weapon}`;
    }
    if (key !== this.promptKey) {
      this.promptKey = key;
      if (!key) this.prompt.classList.add('hidden');
      else {
        this.prompt.classList.remove('hidden');
        if (key === 'open' || key === 'close') this.prompt.innerHTML = `<span class="bracket">[F]</span> ${key === 'open' ? 'Open' : 'Close'}`;
        else {
          const [kind, w] = key.split(':');
          const name = { smg: 'SMG', shotgun: 'Shotgun', rifle: 'Rifle', pistol: 'Pistol' }[w];
          this.prompt.innerHTML = kind === 'swap' ? `<kbd>F</kbd> Swap ${name}` : `<kbd>F</kbd> Take ${name} ammo`;
        }
      }
    }
    // ammo readout
    this.ammo.classList.toggle('hidden', !s.ammo || !P.alive);
    if (s.ammo) {
      const w = P.weapon;
      this.ammo.querySelector('.mag').textContent = String(w.mag);
      this.ammo.querySelector('.res').textContent = String(w.reserve);
      this.ammo.querySelector('.wname').textContent = P.reloading ? 'reloading' : w.def.name;
    }
    // toasts / area label
    this.toastT = Math.max(0, this.toastT - dt);
    this.toastEl.style.opacity = this.toastT > 0 ? '1' : '0';
    this.styleToastT = Math.max(0, this.styleToastT - realDt);
    this.styleToastEl.style.opacity = this.styleToastT > 0 ? '1' : '0';
    this.areaT = Math.max(0, this.areaT - dt);
    this.areaEl.style.opacity = this.areaT > 0.3 ? '1' : '0';
  }
}
