// DOM overlay: HUD (health bar, ammo, objective + marker, score/combo, boss
// bar, notices), menus (Play, Level Select, Endless, settings...), and the
// loading / death / results cards. Styling for both visual styles lives in
// index.html; switching style swaps a class on <body>. All text comes from
// the localisation table via t().
import * as THREE from 'three';
import { handwrite } from './handwriting.js';
import { PLAYER, WEAPONS } from './config.js';
import { t } from './i18n.js';
import { progress, levelRecord } from './save.js';
import { campaignStats } from './mission.js';

const $ = (sel) => document.querySelector(sel);
const _v = new THREE.Vector3();

const CONTROLS = [
  [['W', 'A', 'S', 'D'], 'controls.move'],
  [['Mouse'], 'controls.look'],
  [['LMB'], 'controls.fire'],
  [['RMB'], 'controls.aim'],
  [['Space'], 'controls.jump'],
  [['Shift'], 'controls.sprint'],
  [['C'], 'controls.crouch'],
  [['F'], 'controls.interact'],
  [['R'], 'controls.reload'],
  [['1', '2', 'Q'], 'controls.switch'],
  [['W'], 'controls.climb'],
  [['V'], 'controls.style'],
  [['Esc'], 'controls.pause'],
];

export function fmtTime(s) {
  if (!s && s !== 0) return '-';
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function stars(n, max = 3) {
  let s = '';
  for (let i = 0; i < max; i++) s += i < n ? '<span>&#9733;</span>' : '<span class="off">&#9733;</span>';
  return s;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.body = document.body;
    this.hud = $('#hud');
    this.prompt = $('#prompt');
    this.vignette = $('#vignette');
    this.healflash = $('#healflash');
    this.hitdir = $('#hitdir');
    this.hitdirText = $('#hitdir span');
    this.edges = { AHEAD: $('#edge-top'), BEHIND: $('#edge-bottom'), LEFT: $('#edge-left'), RIGHT: $('#edge-right') };
    this.edgeT = { AHEAD: 0, BEHIND: 0, LEFT: 0, RIGHT: 0 };
    this.hitdirT = 0;
    this.hitmarker = $('#hitmarker');
    this.hitmarkerT = 0;
    this.healthEl = $('#health');
    this.hpNum = $('#health .num');
    this.hpFill = $('#hpfill');
    this.hpTrail = $('#hptrail');
    this.hpCap = $('#hpbar .cap');
    this.trail = 100;
    this.trailHold = 0;
    this.ammo = $('#ammo');
    this.fps = $('#fps');
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    this.toastEl = $('#toast');
    this.toastT = 0;
    this.styleToastEl = $('#styletoast');
    this.styleToastT = 0;
    this.areaEl = $('#area');
    this.areaT = 0;
    this.tipEl = $('#tip');
    this.tipT = 0;
    this.objEl = $('#objective');
    this.objTimer = $('#objective .timer');
    this.markerEl = $('#marker');
    this.scoreEl = $('#scorebox .sc');
    this.comboEl = $('#scorebox .combo');
    this.feedEl = $('#scorebox .feed');
    this.feedT = 0;
    this.bossEl = $('#bossbar');
    this.cpEl = $('#cpnote');
    this.overlayEl = $('#overlay');
    this.perfEl = $('#perf');
    this.fade = $('#fade');
    this.promptKey = '';
    this.menuSection = 'levels';
    this.pauseSection = 'mission';
    this.healT = 0;
    this.lowBeatT = 0;
    this.overlayOn = false;

    this.applyTexts();
    for (const n of document.querySelectorAll('.logo-hw')) n.appendChild(handwrite('Way through', { height: 58, stroke: 6, animate: true, delay: 0.1 }));
    this._wireNav('#menu', '#menu-panel', (s) => { this.menuSection = s; });
    this._wireNav('#pause', '#pause-panel', (s) => { this.pauseSection = s; });
    $('#clicklock').addEventListener('click', () => this.game.resume());
    $('#lc-start').addEventListener('click', () => { this.click(); this.game.beginLevel(); });
    document.addEventListener('mouseover', (e) => {
      const b = e.target.closest && e.target.closest('button, .lcard');
      if (b && b !== this._hovered && !b.disabled) { this._hovered = b; this.game.audio.play('uiHover', { bus: 'ui', gain: 0.45 }); }
      if (!b) this._hovered = null;
    });
  }

  // Fill every [data-t] element from the localisation table.
  applyTexts() {
    for (const n of document.querySelectorAll('[data-t]')) n.textContent = t(n.dataset.t);
    $('#health .h').textContent = t('hud.health');
    $('#objective .h').textContent = t('hud.objective');
    this.cpEl.textContent = t('hud.checkpoint');
    this.refreshPlay();
  }

  refreshPlay() {
    const n = progress.last || 1;
    const def = this.game.levels ? this.game.levels[n - 1] : null;
    const anyDone = Object.values(progress.levels).some((r) => r.completed);
    $('#btn-play').innerHTML = `${t(anyDone ? 'menu.continue' : 'menu.play')}${def ? `<small>${t('menu.playLevel', { n, name: t(def.id + '.name') })}</small>` : ''}`;
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
          if (go === 'play') this.game.startCampaign();
          else if (go === 'resume') this.game.resume();
          else if (go === 'checkpoint') this.game.restartCheckpoint();
          else if (go === 'restart') this.game.restartLevel();
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
    for (const [id, sec] of [['#menu-panel', this.menuSection], ['#pause-panel', this.pauseSection]]) {
      const p = $(id);
      if (!p.closest('.screen').classList.contains('hidden')) this.renderSection(sec, p);
    }
  }

  styleToast(style) {
    this.styleToastEl.textContent = t('style.toast', { name: t(style === 'neo' ? 'style.neo' : 'style.classic') });
    this.styleToastT = 1.6;
  }

  // ------------------------------------------------------------------ screens
  show(which) {
    for (const id of ['#menu', '#pause', '#death', '#results', '#clicklock', '#loadcard']) $(id).classList.add('hidden');
    this.hud.classList.toggle('hidden', !(which === 'hud' || which === 'clicklock' || which === 'dead'));
    if (which === 'menu') {
      this.refreshPlay();
      $('#menu').classList.remove('hidden');
      this.renderSection(this.menuSection, $('#menu-panel'));
      this._markActive('#menu', this.menuSection);
      setTimeout(() => $('#btn-play').focus({ preventScroll: true }), 30);
    } else if (which === 'pause') {
      $('#pause').classList.remove('hidden');
      const cp = document.querySelector('#pause [data-go="checkpoint"]');
      cp.classList.toggle('hidden', !!this.game.endlessMode);
      document.querySelector('#pause [data-go="restart"]').classList.toggle('hidden', !!this.game.endlessMode);
      this.renderSection(this.pauseSection, $('#pause-panel'));
      this._markActive('#pause', this.pauseSection);
    } else if (which === 'death') {
      $('#death').classList.remove('hidden');
    } else if (which === 'results') {
      $('#results').classList.remove('hidden');
    } else if (which === 'clicklock') {
      $('#clicklock').classList.remove('hidden');
    } else if (which === 'loading') {
      $('#loadcard').classList.remove('hidden');
    }
    this.body.classList.toggle('playing', which === 'hud');
  }

  _markActive(rootSel, sec) {
    for (const o of document.querySelectorAll(`${rootSel} nav button`)) o.classList.toggle('active', o.dataset.sec === sec);
  }

  // ---- loading card: level name, objective, control reminder, progress
  showLoading(def, { endless = false, section = 0 } = {}) {
    $('#lc-kicker').textContent = endless ? t('endless.title') + ' · ' + t('endless.section', { n: section + 1, name: '' }).replace(/:\s*$/, '') : t('load.level', { n: def.num });
    $('#lc-name').textContent = t(def.id + '.name');
    $('#lc-place').textContent = t(def.id + '.place');
    $('#lc-goal').innerHTML = `<b>${t('load.objective')}:</b> ${endless ? t('endless.desc') : t(def.id + '.goal')}`;
    $('#lc-rem').textContent = t('controls.reminder');
    $('#lc-bar').style.width = '0%';
    const b = $('#lc-start');
    b.disabled = true;
    b.textContent = t('load.building');
    this.show('loading');
  }

  loadProgress(p) { $('#lc-bar').style.width = `${Math.round(p * 100)}%`; }

  loadReady() {
    const b = $('#lc-start');
    $('#lc-bar').style.width = '100%';
    b.disabled = false;
    b.textContent = t('load.start');
    b.focus({ preventScroll: true });
  }

  // ---- death card: checkpoint / level / menu (or the Endless summary)
  showDeath(endlessResult = null) {
    const title = $('#death-title');
    title.innerHTML = '';
    title.appendChild(handwrite(endlessResult ? t('endless.over') : t('death.title'), { height: 58, stroke: 6.5, delay: 0.05, seed: 3 }));
    const extra = $('#death-extra');
    const btns = $('#death-btns');
    extra.innerHTML = '';
    btns.innerHTML = '';
    const mk = (cls, label, fn) => {
      const b = el('button', cls, label);
      b.addEventListener('click', () => { this.click(); fn(); });
      btns.appendChild(b);
      return b;
    };
    let first;
    if (endlessResult) {
      const r = endlessResult;
      extra.innerHTML = `<dl class="stats"><dt>${t('endless.reached')}</dt><dd>${r.wave}</dd><dt>${t('res.kills')}</dt><dd>${r.kills}</dd><dt>${t('res.score')}</dt><dd>${r.score}</dd><dt>${t('res.best')}</dt><dd>${t('endless.best', { w: r.bestWave, s: r.bestScore })}${r.newBest ? ` (${t('res.new')})` : ''}</dd></dl>`;
      first = mk('btn-try', t('endless.start'), () => this.game.startEndless());
      mk('btn-ghost', t('death.main'), () => this.game.toMainMenu());
    } else {
      first = mk('btn-try', t('death.checkpoint'), () => this.game.restartCheckpoint());
      mk('btn-ghost', t('death.level'), () => this.game.restartLevel());
      mk('btn-ghost', t('death.main'), () => this.game.toMainMenu());
    }
    this.show('death');
    setTimeout(() => first.focus({ preventScroll: true }), 60);
  }

  // ---- results card
  showResults(r, def) {
    const title = $('#res-title');
    title.innerHTML = '';
    title.appendChild(handwrite(r.campaign ? t('res.campaign') : t('res.title'), { height: 56, stroke: 6.5, delay: 0.05, seed: 5 }));
    $('#res-level').textContent = `${t('load.level', { n: def.num })} · ${t(def.id + '.name')}`;
    $('#res-stars').innerHTML = stars(r.stars);
    const rec = levelRecord(def.num);
    const badges = [];
    if (r.newBest) badges.push(t('res.newBest'));
    if (r.noDamage) badges.push(t('ach.flawless'));
    if (r.campaignFirst) badges.push(t('res.endlessUnlocked'));
    $('#res-badges').innerHTML = badges.map((b) => `<span class="badge">${b}</span> `).join('');
    const rows = [
      [t('res.time'), fmtTime(r.time)],
      [t('res.kills'), String(r.kills)],
      [t('res.headshots'), String(r.headshots)],
      [t('res.accuracy'), `${Math.round(r.accuracy * 100)}%`],
      [t('res.damage'), String(r.damage)],
      [t('res.secrets'), `${r.secrets} / 3`],
    ];
    $('#res-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')
      + `<div class="total" style="display:contents"><dt>${t('res.score')}</dt><dd>${r.score}</dd></div>`
      + `<dt>${t('res.best')}</dt><dd>${rec.bestScore} · ${fmtTime(rec.bestTime)}</dd>`;
    const cs = r.campaign;
    $('#res-campaign').textContent = cs ? t('res.campaignStats', { time: fmtTime(cs.time), kills: cs.kills, secrets: `${cs.secrets}/24`, score: cs.score }) : '';
    const btns = $('#res-btns');
    btns.innerHTML = '';
    const mk = (cls, label, fn) => {
      const b = el('button', cls, label);
      b.addEventListener('click', () => { this.click(); fn(); });
      btns.appendChild(b);
      return b;
    };
    let first;
    if (def.num < 8) first = mk('btn-try', t('res.next'), () => this.game.startLevel(def.num + 1));
    else first = mk('btn-try', t('res.endless'), () => this.game.startEndless());
    mk('btn-ghost', t('res.replay'), () => this.game.startLevel(def.num));
    mk('btn-ghost', t('res.main'), () => this.game.toMainMenu());
    this.show('results');
    setTimeout(() => first.focus({ preventScroll: true }), 60);
  }

  // ------------------------------------------------------------------ sections
  renderSection(sec, panel) {
    const g = this.game;
    panel.innerHTML = '';
    const title = (s) => panel.appendChild(el('h2', '', s));
    if (sec === 'levels') this._levels(panel, title);
    else if (sec === 'endless') {
      title(t('endless.title'));
      panel.appendChild(el('p', '', t('endless.desc')));
      const e = progress.endless;
      panel.appendChild(el('p', 'hint', t('endless.best', { w: e.bestWave, s: e.bestScore })));
      if (!progress.campaignWon) panel.appendChild(el('p', '', `<b>${t('endless.locked')}</b>`));
      else {
        const b = el('button', 'btn-try', t('endless.start'));
        b.addEventListener('click', () => { g.audio.unlock(); this.click(); g.startEndless(); });
        panel.appendChild(b);
      }
    } else if (sec === 'style') {
      title(t('style.title'));
      const grid = el('div', 'styles');
      for (const id of ['classic', 'neo']) {
        const c = el('button', 'style-card' + (g.style === id ? ' selected' : ''));
        const img = document.createElement('img');
        img.alt = t('style.' + id);
        if (g.previews[id]) img.src = g.previews[id];
        else g.stylePreview(id).then((u) => { img.src = u; });
        c.appendChild(img);
        c.appendChild(el('div', 't', t('style.' + id)));
        c.appendChild(el('div', 'd', t('style.' + id + '.d')));
        c.addEventListener('click', () => { this.click(); g.setStyle(id); this.renderSection('style', panel); });
        grid.appendChild(c);
      }
      panel.appendChild(grid);
      panel.appendChild(el('p', 'hint', '<br>' + t('style.hint')));
    } else if (sec === 'controls') {
      title(t('controls.title'));
      const tb = el('table', 'keys');
      tb.innerHTML = CONTROLS.map(([keys, what]) => `<tr><td>${keys.map((k) => `<kbd class="k">${k}</kbd>`).join('')}</td><td>${t(what)}</td></tr>`).join('');
      panel.appendChild(tb);
      if (g.input.fallback) panel.appendChild(el('p', 'hint', '<br>' + t('controls.fallback')));
    } else if (sec === 'settings') {
      title(t('settings.title'));
      panel.appendChild(this._settings());
      panel.appendChild(el('p', 'hint', '<br>' + t('settings.qualityHint') + '<br>' + t('settings.diffHint')));
    } else if (sec === 'howto') {
      title(t('howto.title'));
      panel.appendChild(el('div', '', t('howto.body')));
    } else if (sec === 'achievements') {
      title(t('ach.title'));
      const box = el('div', 'ach');
      for (const id of ['campaign', 'secrets', 'flawless', 'hard']) {
        const got = !!progress.achievements[id];
        const a = el('div', 'a' + (got ? ' got' : ''), `<div class="ic">${got ? '&#10003;' : '?'}</div><div><div class="nm">${t('ach.' + id)}</div><div class="d">${t('ach.' + id + '.d')} · ${t(got ? 'ach.unlocked' : 'ach.locked')}</div></div>`);
        box.appendChild(a);
      }
      panel.appendChild(box);
      const cs = campaignStats();
      panel.appendChild(el('p', 'hint', '<br>' + t('res.campaignStats', { time: fmtTime(cs.time), kills: cs.kills, secrets: `${cs.secrets}/24`, score: cs.score })));
    } else if (sec === 'credits') {
      title(t('credits.title'));
      panel.appendChild(el('div', '', t('credits.body')));
    } else if (sec === 'mission') {
      this._mission(panel, title);
    }
  }

  _levels(panel, title) {
    const g = this.game;
    title(t('levels.title'));
    const top = el('div', 'toprow');
    top.appendChild(el('span', 'hint', t('levels.hint')));
    const diffWrap = el('div', '', `<span style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;margin-right:8px">${t('levels.difficulty')}</span>`);
    diffWrap.appendChild(this._seg('difficulty', [['easy', t('settings.easy')], ['normal', t('settings.normal')], ['hard', t('settings.hard')]]));
    top.appendChild(diffWrap);
    panel.appendChild(top);
    const grid = el('div', 'levels');
    for (const def of g.levels) {
      const n = def.num;
      const rec = progress.levels[n];
      const locked = n > progress.unlocked;
      const c = el('button', 'lcard' + (locked ? ' locked' : '') + (n === progress.last && !locked ? ' next' : ''));
      const wrap = el('div', 'pvwrap');
      const img = document.createElement('img');
      img.className = 'pv pending';
      img.alt = t(def.id + '.name');
      wrap.appendChild(img);
      wrap.appendChild(el('span', 'num', String(n)));
      c.appendChild(wrap);
      const info = el('div', 'info');
      info.appendChild(el('div', 'nm', t(def.id + '.name')));
      if (locked) info.appendChild(el('div', 'row', `<span>&#128274; ${t('levels.lockedHint', { n: n - 1 })}</span>`));
      else {
        info.appendChild(el('div', 'row', `<span class="stars">${stars(rec ? rec.stars : 0)}</span><span>&#9734; ${rec ? rec.secrets.filter(Boolean).length : 0}/3</span>`));
        info.appendChild(el('div', 'row', `<span>${t('levels.best')} ${rec && rec.bestScore ? rec.bestScore : t('levels.none')}</span><span>${t('levels.time')} ${rec && rec.bestTime ? fmtTime(rec.bestTime) : t('levels.none')}</span>`));
      }
      c.appendChild(info);
      if (!locked) c.addEventListener('click', () => { g.audio.unlock(); this.click(); g.startLevel(n); });
      else c.addEventListener('click', () => g.audio.play('locked', { bus: 'ui', gain: 0.5 }));
      grid.appendChild(c);
      g.levelPreview(n, g.style).then((url) => { if (url) { img.src = url; img.classList.remove('pending'); } });
    }
    panel.appendChild(grid);
  }

  _mission(panel, title) {
    const g = this.game;
    const m = g.mission;
    const def = g.level && g.level.def;
    title(g.endlessMode ? t('endless.title') : def ? `${t('load.level', { n: def.num })}: ${t(def.id + '.name')}` : t('menu.mission'));
    if (!def) return;
    const wrap = el('div', 'mission');
    const left = el('div', '');
    if (g.endlessMode) {
      left.appendChild(el('p', '', t('endless.desc')));
      left.appendChild(el('p', '', `<b>${t('endless.wave', { n: g.endless.wave })}</b> · ${t('res.score')} ${g.endless.score}`));
    } else {
      left.appendChild(el('p', '', t(def.id + '.goal')));
      const ul = el('ul', 'route');
      def.objectives.forEach((o, i) => {
        const cls = i < m.index ? 'done' : i === m.index ? 'now' : '';
        const txt = i === m.index ? m.label : t(o.key, { n: o.type === 'kill' ? '' : 0 }).replace(/\s*\(\s*\/?\s*\d*\s*(left)?\)/, '');
        ul.appendChild(el('li', cls, `${i + 1}. ${txt}`));
      });
      left.appendChild(ul);
      const found = m.secretsFound.filter(Boolean).length;
      left.appendChild(el('p', 'hint', `<br>${t('res.kills')}: ${m.run.kills} · ${t('res.secrets')}: ${found}/3 · ${t('settings.difficulty')}: ${t('settings.' + g.difficulty)}`));
    }
    wrap.appendChild(left);
    const cv = document.createElement('canvas');
    cv.width = 440; cv.height = 440;
    wrap.appendChild(cv);
    panel.appendChild(wrap);
    this.drawMinimap(cv);
  }

  _seg(key, options, after) {
    const g = this.game;
    const s = g.settings;
    const d = el('div', 'seg');
    for (const [val, label] of options) {
      const b = el('button', '', label);
      b.classList.toggle('on', s[key] === val);
      b.addEventListener('click', () => {
        this.click();
        s[key] = val;
        for (const o of d.children) o.classList.toggle('on', o === b);
        g.applySettings();
        if (after) after(val);
      });
      d.appendChild(b);
    }
    return d;
  }

  _settings() {
    const g = this.game;
    const s = g.settings;
    const box = el('div', 'settings');
    const row = (label, e) => { box.appendChild(el('label', '', label)); box.appendChild(e); };
    const slider = (key, min, max, step, fmt) => {
      const wrap = el('div', '');
      const i = document.createElement('input');
      i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = s[key];
      const v = el('span', 'val', fmt(s[key]));
      i.addEventListener('input', () => { s[key] = Number(i.value); v.textContent = fmt(s[key]); g.applySettings(); });
      wrap.style.display = 'flex'; wrap.style.alignItems = 'center';
      wrap.appendChild(i); wrap.appendChild(v);
      return wrap;
    };
    const pct = (v) => `${Math.round(v * 100)}%`;
    const onoff = [[false, t('settings.off')], [true, t('settings.on')]];
    row(t('settings.sensitivity'), slider('sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)));
    row(t('settings.invertY'), this._seg('invertY', onoff));
    row(t('settings.fov'), slider('fov', 60, 100, 1, (v) => `${v}°`));
    row(t('settings.master'), slider('master', 0, 1, 0.05, pct));
    row(t('settings.music'), slider('music', 0, 1, 0.05, pct));
    row(t('settings.sfx'), slider('sfx', 0, 1, 0.05, pct));
    row(t('settings.ambience'), slider('ambience', 0, 1, 0.05, pct));
    row(t('settings.difficulty'), this._seg('difficulty', [['easy', t('settings.easy')], ['normal', t('settings.normal')], ['hard', t('settings.hard')]]));
    row(t('settings.quality'), this._seg('quality', [['low', t('settings.low')], ['medium', t('settings.medium')], ['high', t('settings.high')]]));
    const fs = el('div', 'seg');
    const fsBtn = el('button', '', document.fullscreenElement ? t('settings.exit') : t('settings.enter'));
    fsBtn.addEventListener('click', () => { this.click(); g.toggleFullscreen(); setTimeout(() => { fsBtn.textContent = document.fullscreenElement ? t('settings.exit') : t('settings.enter'); }, 250); });
    fs.appendChild(fsBtn);
    row(t('settings.fullscreen'), fs);
    row(t('settings.shake'), slider('shake', 0, 1, 0.05, pct));
    row(t('settings.viewBob'), this._seg('viewBob', onoff));
    row(t('settings.fps'), this._seg('fps', onoff));
    return box;
  }

  // Top-down map of the level with the objective and the player's arrow.
  drawMinimap(cv) {
    const g = this.game;
    const map = g.level.map;
    const B = map.bounds;
    const ctx = cv.getContext('2d');
    const neo = g.style === 'neo';
    const pad = 14;
    const sc = Math.min((cv.width - pad * 2) / (B.x1 - B.x0), (cv.height - pad * 2) / (B.z1 - B.z0));
    const ox = pad + ((cv.width - pad * 2) - (B.x1 - B.x0) * sc) / 2;
    const oz = pad + ((cv.height - pad * 2) - (B.z1 - B.z0) * sc) / 2;
    const tx = (x) => ox + (x - B.x0) * sc;
    const tz = (z) => oz + (z - B.z0) * sc;
    ctx.fillStyle = neo ? '#a8f0c0' : '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const fillFor = { building: neo ? '#ff8cc6' : '#fff', path: neo ? '#f5ead0' : '#f3f3f3', block: neo ? '#ffc89c' : '#eee', pad: neo ? '#d5d8ec' : '#f3f3f3', table: neo ? '#ff9a3d' : '#fff', prop: neo ? '#e9ebff' : '#fff', cover: neo ? '#ffb13d' : '#fff', walk: neo ? '#d5d8ec' : '#fafafa', stair: neo ? '#d5d8ec' : '#fff', water: neo ? '#46d2f0' : '#eef4f8', wall: '#111' };
    const order = ['water', 'path', 'building', 'pad', 'walk', 'block', 'prop', 'table', 'cover', 'stair', 'wall'];
    ctx.lineWidth = neo ? 1.6 : 1;
    ctx.strokeStyle = '#111';
    for (const k of order) {
      for (const r of map.rects) {
        if (r.k !== k) continue;
        const x = tx(r.x0), y = tz(r.z0), w = Math.max(1.5, (r.x1 - r.x0) * sc), hh = Math.max(1.5, (r.z1 - r.z0) * sc);
        ctx.fillStyle = fillFor[k] || '#fff';
        ctx.fillRect(x, y, w, hh);
        if (k !== 'path' && k !== 'wall' && k !== 'water') ctx.strokeRect(x, y, w, hh);
      }
    }
    ctx.setLineDash([3, 3]);
    for (const l of map.lines) { ctx.beginPath(); ctx.moveTo(tx(l.ax), tz(l.az)); ctx.lineTo(tx(l.bx), tz(l.bz)); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const c of map.circles) {
      ctx.beginPath();
      ctx.arc(tx(c.x), tz(c.z), Math.max(1.5, c.r * sc), 0, Math.PI * 2);
      ctx.fillStyle = c.k === 'tree' ? (neo ? '#2ecf78' : '#fff') : c.k === 'rock' ? (neo ? '#e0b070' : '#f3f3f3') : '#111';
      ctx.fill();
      ctx.stroke();
    }
    const m = g.mission;
    if (m && m.hasMarker) {
      const x = tx(m.marker.x), y = tz(m.marker.z);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = neo ? '#ff2bd6' : '#fff'; ctx.lineWidth = 2; ctx.strokeStyle = '#111';
      ctx.fillRect(-6, -6, 12, 12); ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();
    }
    ctx.fillStyle = '#111';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('N ↑', 8, 12);
    const P = g.player;
    ctx.save();
    ctx.translate(tx(P.x), tz(P.z));
    ctx.rotate(-P.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fillStyle = neo ? '#ff2bd6' : '#111';
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ HUD events
  hit(dir, amount = 10) {
    this.hitdirText.textContent = t('hud.hit', { dir: t('hud.dir.' + dir) });
    this.hitdirT = 1.3;
    this.edgeT[dir] = Math.min(1, 0.55 + amount / 25);
    this.trailHold = 0.45;
  }

  hitMarker(head, kill = false) {
    this.hitmarker.classList.toggle('head', !!head);
    this.hitmarker.classList.toggle('kill', !!kill);
    this.hitmarkerT = kill ? 0.22 : 0.14;
  }

  toast(msg, cls = '') {
    this.toastEl.textContent = msg;
    this.toastEl.className = cls;
    this.toastT = 2.0;
  }

  area(text) {
    this.areaEl.querySelector('span').textContent = text;
    this.areaT = 2.6;
  }

  tip(text) {
    this.tipEl.textContent = text;
    this.tipT = 6;
  }

  objective(text, isNew) {
    this.objEl.querySelector('.txt').textContent = text;
    if (isNew) {
      this.objEl.classList.remove('flash');
      void this.objEl.offsetWidth;
      this.objEl.classList.add('flash');
      this.toast(t('hud.done'));
    }
  }

  checkpoint() {
    this.cpEl.classList.remove('hidden', 'show');
    void this.cpEl.offsetWidth;
    this.cpEl.classList.add('show');
    this.cpT = 1.9;
  }

  killFeed(pts, mult, head) {
    this.feedEl.textContent = `+${pts}${head ? ' HS' : ''}`;
    this.feedT = 1.4;
    this.hitMarker(head, true);
  }

  healFlash() { this.healT = 0.6; }

  perfHint(show) {
    this.perfEl.textContent = t('hud.lowPerf');
    this.perfEl.classList.toggle('hidden', !show);
  }

  showOverlay() {
    const k = (s) => `<kbd class="k">${s}</kbd>`;
    this.overlayEl.innerHTML = `<div class="h">${t('overlay.title')}</div><div class="grid">
      <div>${k('W')}${k('A')}${k('S')}${k('D')}</div><div>${t('overlay.move')}</div><div>${k('Mouse')}</div><div>${t('overlay.look')}</div>
      <div>${k('LMB')}</div><div>${t('overlay.fire')}</div><div>${k('R')}</div><div>${t('overlay.reload')}</div>
      <div>${k('F')}</div><div>${t('overlay.use')}</div><div>${k('1')}${k('2')}</div><div>${t('overlay.swap')}</div>
      <div>${k('V')}</div><div>${t('overlay.style')}</div><div>${k('Esc')}</div><div>${t('controls.pause')}</div>
      </div><div class="foot">${t('overlay.dismiss')}</div>`;
    this.overlayEl.classList.remove('hidden');
    this.overlayEl.style.opacity = '1';
    this.overlayOn = true;
    this.overlayShownAt = this.game.time;
  }

  hideOverlay() {
    if (!this.overlayOn) return;
    this.overlayOn = false;
    this.overlayEl.style.opacity = '0';
    setTimeout(() => { if (!this.overlayOn) this.overlayEl.classList.add('hidden'); }, 450);
  }

  onDeath() {
    this.body.classList.add('is-dead');
    this.toastT = 0;
    this.hitdirT = Math.min(this.hitdirT, 0.6);
  }

  resetRun() {
    this.body.classList.remove('is-dead');
    this.hitdirT = 0;
    this.toastT = 0;
    this.tipT = 0;
    this.areaT = 0;
    this.feedT = 0;
    this.trail = this.game.player.health;
    for (const k in this.edgeT) this.edgeT[k] = 0;
    this.cpEl.classList.add('hidden');
    this.setFade(0, '#d9d9d9');
    this.markerEl.classList.add('hidden');
    this.objective(this.game.mission.label || '', false);
  }

  setFade(alpha, color) {
    this.fade.style.opacity = String(alpha);
    if (color) this.fade.style.background = color;
  }

  // ------------------------------------------------------------------ per frame
  update(dt, realDt) {
    const g = this.game;
    const P = g.player;
    const s = g.settings;
    this.fpsAcc += realDt; this.fpsN++; this.fpsT += realDt;
    if (this.fpsT > 0.5) {
      this.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${g.drawCalls} draws`;
      this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    }
    this.fps.classList.toggle('hidden', !s.fps);
    // ---- health bar with a delayed trailing segment
    const hp = Math.max(0, P.alive ? P.health : 0);
    this.trailHold = Math.max(0, this.trailHold - dt);
    if (hp > this.trail) this.trail = hp;
    else if (this.trailHold <= 0) this.trail = Math.max(hp, this.trail - dt * 38);
    this.hpFill.style.width = `${hp}%`;
    this.hpTrail.style.width = `${this.trail}%`;
    this.hpCap.style.left = `${g.diff.regenCap}%`;
    this.hpCap.style.display = g.diff.regenCap < 100 ? '' : 'none';
    this.hpNum.textContent = `${Math.ceil(hp)} / ${PLAYER.maxHealth}`;
    this.healthEl.classList.toggle('mid', hp < 50 && hp >= 25);
    this.healthEl.classList.toggle('low', hp < 25);
    const hurt = 1 - hp / 100;
    this.vignette.style.opacity = String(Math.max(0, hurt - 0.35) * 1.2);
    this.healT = Math.max(0, this.healT - dt);
    this.healflash.style.opacity = String(this.healT > 0 ? 1 : 0);
    if (P.alive && hp < 25 && hp > 0) {
      this.lowBeatT -= dt;
      if (this.lowBeatT <= 0) { g.audio.play('heartbeat', { gain: 0.5 }); this.lowBeatT = 1.05; }
    } else this.lowBeatT = 0;
    // ---- hit direction + edge flash
    this.hitdirT = Math.max(0, this.hitdirT - dt);
    this.hitdir.style.opacity = String(Math.min(1, this.hitdirT * 2.5));
    for (const k of Object.keys(this.edgeT)) {
      this.edgeT[k] = Math.max(0, this.edgeT[k] - dt * 1.8);
      this.edges[k].style.opacity = String(this.edgeT[k]);
    }
    this.hitmarkerT = Math.max(0, this.hitmarkerT - dt);
    this.hitmarker.style.opacity = this.hitmarkerT > 0 ? '1' : '0';
    // ---- prompt pill
    let key = '';
    const tg = P.alive ? P.lookTarget : null;
    if (tg) {
      if (tg.kind === 'door') key = tg.door.locked ? 'locked' : tg.door.isOpen ? 'close' : 'open';
      else if (tg.kind === 'interact') key = 'it:' + tg.it.prompt;
      else {
        const slot = WEAPONS[tg.pickup.weapon].slot;
        const cur = P.slots[slot];
        key = cur && cur.id === tg.pickup.weapon ? `ammo:${tg.pickup.weapon}` : `swap:${tg.pickup.weapon}`;
      }
    }
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.prompt.classList.toggle('locked', key === 'locked');
      if (!key) this.prompt.classList.add('hidden');
      else {
        this.prompt.classList.remove('hidden');
        let label;
        if (key === 'open' || key === 'close' || key === 'locked') label = t('prompt.' + key);
        else if (key.startsWith('it:')) label = t(key.slice(3));
        else {
          const [kind, w] = key.split(':');
          label = t(kind === 'swap' ? 'prompt.swap' : 'prompt.take', { name: t('weapon.' + w) });
        }
        this.prompt.innerHTML = `<kbd>F</kbd> ${label}`;
      }
    }
    // ---- ammo panel
    this.ammo.classList.toggle('hidden', !P.alive);
    const w = P.weapon;
    if (w) {
      const s1 = P.slots.main, s2 = P.slots.side;
      const a = this.ammo;
      const sl1 = a.querySelector('.s1'), sl2 = a.querySelector('.s2');
      sl1.textContent = `1 ${s1 ? t('weapon.' + s1.id) : '-'}`;
      sl2.textContent = `2 ${s2 ? t('weapon.' + s2.id) : '-'}`;
      sl1.classList.toggle('on', P.active === 'main');
      sl2.classList.toggle('on', P.active === 'side');
      a.querySelector('.mag').textContent = String(w.mag);
      a.querySelector('.res').textContent = String(w.reserve);
      a.classList.toggle('empty', w.mag === 0);
      const rp = P.reloading ? Math.min(1, w.def.shellReload ? w.mag / w.def.mag : P.reloadT / w.def.reload) : 0;
      a.querySelector('.reload i').style.width = `${Math.round(rp * 100)}%`;
    }
    // ---- objective, survive timer, marker, score, boss
    const m = g.mission;
    if (m && m.obj && m.obj.type === 'survive' && !g.endlessMode) {
      this.objTimer.classList.remove('hidden');
      this.objTimer.textContent = t('hud.survive', { s: fmtTime(Math.ceil(m.surviveLeft)) });
    } else this.objTimer.classList.add('hidden');
    if (g.endlessMode) this.objEl.querySelector('.txt').textContent = `${t('endless.wave', { n: g.endless.wave })}`;
    this._marker(m);
    const score = g.endlessMode ? g.endless.score : m && m.run ? m.run.killScore + m.run.bonus : 0;
    this.scoreEl.textContent = String(score);
    const mult = m && m.run ? m.comboMult : 1;
    this.comboEl.textContent = t('hud.combo', { m: mult.toFixed(1) });
    this.comboEl.classList.toggle('on', mult > 1.01);
    this.feedT = Math.max(0, this.feedT - dt);
    if (this.feedT <= 0) this.feedEl.textContent = '';
    const boss = g.enemies.boss;
    if (boss && boss.alive && boss.state !== 'idle') {
      this.bossEl.classList.remove('hidden');
      this.bossEl.querySelector('span').textContent = t('hud.boss');
      this.bossEl.querySelector('i').style.width = `${Math.max(0, boss.health / boss.maxHealth) * 100}%`;
    } else this.bossEl.classList.add('hidden');
    if (this.cpT > 0) { this.cpT -= dt; if (this.cpT <= 0) this.cpEl.classList.add('hidden'); }
    // ---- tutorial overlay: gone once the player moves or fires
    if (this.overlayOn && P.lastActed > this.overlayShownAt + 0.05) this.hideOverlay();
    // ---- toasts / tips / area label
    this.toastT = Math.max(0, this.toastT - dt);
    this.toastEl.style.opacity = this.toastT > 0 ? '1' : '0';
    this.tipT = Math.max(0, this.tipT - dt);
    this.tipEl.style.opacity = this.tipT > 0.3 ? '1' : '0';
    this.styleToastT = Math.max(0, this.styleToastT - realDt);
    this.styleToastEl.style.opacity = this.styleToastT > 0 ? '1' : '0';
    this.areaT = Math.max(0, this.areaT - dt);
    this.areaEl.style.opacity = this.areaT > 0.3 ? '1' : '0';
  }

  _marker(m) {
    const g = this.game;
    if (!m || !m.hasMarker || !g.player.alive || g.endlessMode) { this.markerEl.classList.add('hidden'); return; }
    const cam = g.camera;
    _v.copy(m.marker).project(cam);
    const W = window.innerWidth, H = window.innerHeight;
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    const behind = _v.z > 1;
    if (behind) { x = W - x; y = H - 30; }
    const mg = 40;
    x = Math.max(mg, Math.min(W - mg, x));
    y = Math.max(mg + 40, Math.min(H - mg - 60, y));
    const d = Math.hypot(m.marker.x - g.player.x, m.marker.y - g.player.y, m.marker.z - g.player.z);
    this.markerEl.classList.remove('hidden');
    this.markerEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.markerEl.querySelector('.dist').textContent = `${Math.round(d)} m`;
    this.markerEl.style.opacity = d < 3 ? '0.35' : '1';
  }
}
