// Endless Mode: shuffled sections of the campaign maps. Each section is an
// arena (a start point plus reinforcement entries) on one level; clear three
// waves to move on. Every wave is bigger and tougher. Ends on death and keeps
// the best wave and score.
import { DIFFICULTY, WEAPONS } from './config.js';
import { progress, saveProgress } from './save.js';
import { t } from './i18n.js';

const WAVES_PER_SECTION = 3;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Endless {
  constructor(game) {
    this.game = game;
    this.active = false;
  }

  start(levelCount) {
    this.active = true;
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.section = 0;
    this.order = shuffle(Array.from({ length: levelCount }, (_, i) => i + 1));
    this.loadout = null;
    this.over = false;
    return this.order[0];
  }

  nextLevel() {
    this.section++;
    return this.order[this.section % this.order.length];
  }

  // Called once the section's level is built and the mission started.
  beginSection(level) {
    const g = this.game;
    const arenas = level.data.arenas.length ? level.data.arenas : [{ ...level.data.start, entries: level.data.entries.map((e) => e.id) }];
    this.arena = arenas[Math.floor(Math.random() * arenas.length)];
    const a = this.arena;
    g.player.reset({ x: a.x, y: a.y, z: a.z, yaw: a.yaw }, this.loadout || level.def.loadout);
    this.inSection = 0;
    this.gap = 2.5;
    this.state = 'gap';
    g.ui.toast(t('endless.section', { n: this.section + 1, name: t(level.def.id + '.name') }));
  }

  _diff() {
    const base = DIFFICULTY[this.game.difficulty] || DIFFICULTY.normal;
    const w = this.wave;
    return { ...base, damage: base.damage * (1 + w * 0.05), spread: base.spread * Math.max(0.6, 1 - w * 0.03), react: base.react * Math.max(0.6, 1 - w * 0.03), regenCap: base.regenCap };
  }

  _spawnWave() {
    const g = this.game;
    this.wave++;
    this.inSection++;
    g.diff = this._diff();
    const pool = ['pistol', 'smg'];
    if (this.wave >= 2) pool.push('rifle', 'shotgun');
    if (this.wave >= 4) pool.push('heavy');
    if (this.wave >= 6) pool.push('smg', 'rifle', 'heavy');
    const roles = shuffle(Array.from({ length: 12 }, (_, i) => pool[i % pool.length]));
    g.mission.wave({ count: Math.min(12, 3 + Math.floor(this.wave * 1.3)), roles, entries: this.arena.entries, hp: 1 + this.wave * 0.07, gap: 0.8, announce: false });
    g.ui.toast(t('endless.wave', { n: this.wave }));
    g.audio.play('alert', { gain: 0.5 });
    g.setCombatMusic(true);
  }

  onKill(e, pts) {
    this.score += pts;
    this.kills++;
  }

  update(dt) {
    if (!this.active || this.over) return;
    const g = this.game;
    if (this.state === 'gap') {
      this.gap -= dt;
      if (this.gap <= 0) { this._spawnWave(); this.state = 'fight'; }
      return;
    }
    if (this.state === 'travel') {
      this.travelT -= dt;
      if (this.travelT <= 0) { this.state = 'loading'; g.loadEndlessSection(this.nextLevel()); }
      return;
    }
    if (this.state === 'fight' && g.enemies.alive === 0 && g.mission.queue.length === 0) {
      // wave cleared: small reward, then the next wave or the next section
      this.score += 250 * this.wave;
      const P = g.player;
      P.health = Math.min(100, P.health + 25);
      for (const w of [P.slots.main, P.slots.side]) if (w) w.reserve = Math.min(WEAPONS[w.id].reserve, w.reserve + w.def.mag);
      g.audio.play('objective', { gain: 0.6 });
      g.setCombatMusic(false);
      if (this.inSection >= WAVES_PER_SECTION) {
        this.state = 'travel';
        this.loadout = P.getLoadout();
        g.ui.toast(t('endless.clear'));
        this.travelT = 1.8;
      } else {
        this.state = 'gap';
        this.gap = 4;
        g.ui.toast(t('endless.next', { s: 4 }));
      }
    }
  }

  // Player died: the run is over. Returns the result for the card.
  finish() {
    this.over = true;
    const e = progress.endless;
    const newBest = this.wave > e.bestWave || this.score > e.bestScore;
    e.bestWave = Math.max(e.bestWave, this.wave);
    e.bestScore = Math.max(e.bestScore, this.score);
    saveProgress();
    return { wave: this.wave, score: this.score, kills: this.kills, bestWave: e.bestWave, bestScore: e.bestScore, newBest };
  }

  stop() { this.active = false; }
}
