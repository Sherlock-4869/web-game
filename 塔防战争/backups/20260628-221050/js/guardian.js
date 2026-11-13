/* ============================================================
   guardian.js — a player-controlled map power embedded in each map.
   Charges over GUARDIAN.chargeTime; when ready, three symbols appear above it
   (⚡ lightning, ❄ snow/slow, 🧊 ice/freeze). Click one to unleash that ability.
   ============================================================ */
(function (TD) {
  class Guardian {
    constructor(game) {
      this.game = game;
      const pos = game.map.guardianPos || game.map.tileCenter(16, 9);
      this.x = pos.x; this.y = pos.y;
      this.charge = 0;
      this.ready = false;
      this.flash = 0;       // activation flash
    }

    cfg() { return TD.GUARDIAN || {}; }
    chargeTime() { return this.cfg().chargeTime || 120; }
    progress() { return Math.min(1, this.charge / this.chargeTime()); }

    update(dt) {
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
      if (this.ready) return;
      this.charge += dt;
      if (this.charge >= this.chargeTime()) { this.charge = this.chargeTime(); this.ready = true; }
    }

    /* the three clickable ability symbols (only meaningful when ready) */
    symbols() {
      const y = this.y - 34;
      return [
        { ability: 'lightning', icon: '⚡', color: '#ffd24a', x: this.x - 24, y },
        { ability: 'slow',      icon: '❄', color: '#bfe6ff', x: this.x,      y: y - 4 },
        { ability: 'freeze',    icon: '🧊', color: '#7fd8ff', x: this.x + 24, y },
      ];
    }

    /* returns true if a click was on a symbol (and activates it) */
    handleClick(px, py) {
      if (!this.ready) return false;
      for (const s of this.symbols()) {
        if (Math.hypot(px - s.x, py - s.y) <= 16) { this.activate(s.ability); return true; }
      }
      return false;
    }

    activate(ability) {
      this.ready = false;
      this.charge = 0;
      this.flash = 0.8;
      this.game.guardianActivate(ability);
    }

    serialize() { return { charge: this.charge, ready: this.ready }; }
    load(s) { if (!s) return; this.charge = s.charge || 0; this.ready = !!s.ready; }
  }

  TD.Guardian = Guardian;
})(window.TD);
