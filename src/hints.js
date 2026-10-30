// Onboarding after the first-kill tutorial: one short line, once, at the
// moment it matters — the magazine running low, an empty gun with a loaded one
// on the other slot, a gun lying in front of you, taking a beating, the first
// checkpoint, the first runt or brute in sight, a long walk without sprinting,
// a long spray without steady aim, kills without a headshot. Each line is
// shown once per player (remembered in the save) and never two close
// together; touch screens get their own wording (see i18n.js).
import { t } from './i18n.js';
import { progress, saveProgress } from './save.js';

const GAP = 7; // real seconds between two lines

export class Hints {
  constructor(game) {
    this.game = game;
    this.cool = 4; // a moment to settle in first
    this.walkT = 0;
    this.shotsNoAim = 0;
    this.lastShots = 0;
    this.killsNoHead = 0;
    this.pending = null;
  }

  seen(id) { return !!(progress.hints && progress.hints[id]); }

  // Shows the line if it is new and nothing was shown just before; true if shown.
  show(id) {
    if (this.seen(id) || this.cool > 0) return false;
    if (!progress.hints) progress.hints = {};
    progress.hints[id] = true;
    saveProgress();
    this.game.ui.tip(t('hint.' + id));
    this.cool = GAP;
    return true;
  }

  onKill(e, head) {
    if (head) this.killsNoHead = -Infinity; // they know
    else this.killsNoHead++;
  }

  onCheckpoint() { if (!this.seen('checkpoint')) this.pending = 'checkpoint'; }

  // Real seconds; only while playing (see main.js).
  update(realDt) {
    const g = this.game;
    const P = g.player;
    // what the player does is counted even while a line is cooling down
    const shots = P.stats.shots;
    if (shots > this.lastShots && !P.aiming) this.shotsNoAim += shots - this.lastShots;
    if (P.aiming) this.shotsNoAim = 0;
    this.lastShots = shots;
    if (P.moving > 0.6 && !P.sprinting && P.body.grounded) this.walkT += realDt; else if (P.sprinting) this.walkT = -Infinity;
    if (g.tutorial.active || g.endlessMode || !P.alive) return;
    this.cool = Math.max(0, this.cool - realDt);
    if (this.cool > 0) return;
    // most urgent first
    if (this.pending && this.show(this.pending)) { this.pending = null; return; }
    for (const e of g.enemies.list) {
      if (!e.alive || !e.sees || (e.role !== 'brute' && e.role !== 'runt') || this.seen(e.role)) continue;
      if (Math.hypot(e.body.x - P.x, e.body.z - P.z) < 30 && this.show(e.role)) return;
    }
    if (P.health < 45 && this.show('cover')) return;
    const w = P.weapon;
    const other = P.slots[P.active === 'main' ? 'side' : 'main'];
    if (w.mag === 0 && w.reserve === 0 && other && other.mag + other.reserve > 0 && this.show('switch')) return;
    if (!P.reloading && w.reserve > 0 && w.mag > 0 && w.mag <= Math.ceil(w.def.mag * 0.25) && this.show('reload')) return;
    const tg = P.lookTarget;
    if (tg && tg.kind === 'pickup' && this.show('pickup')) return;
    if (this.killsNoHead >= 5 && this.show('head')) return;
    if (this.shotsNoAim >= 45 && this.show('aim')) return;
    if (this.walkT > 6 && this.show('sprint')) return;
  }
}
