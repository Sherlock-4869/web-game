/* ============================================================
   projectile.js — projectiles & on-hit resolution.
   Types: arrow, cannonball, magicbolt, poisondart, lightning, beam, missile, boomerang.
   ============================================================ */
(function (TD) {
  class Projectile {
    constructor(opts, game) {
      this.game = game;
      this.x = opts.x; this.y = opts.y;
      this.target = opts.target;
      this.speed = opts.speed * TD.CONFIG.tileSize; // tiles/s -> px/s (speed already small int)
      this.damage = opts.damage;
      this.dmgType = opts.dmgType;
      this.kind = opts.kind;
      this.splash = opts.splash || 0;
      this.crit = opts.crit || false;
      this.source = opts.source;
      this.color = opts.color || '#fff';
      this.dot = opts.dot || null;          // {dps,dur}
      this.slow = opts.slow || null;        // {amount,dur}
      this.freezeChance = opts.freezeChance || 0;
      this.chain = opts.chain || 0;
      this.chainFalloff = opts.chainFalloff || 0.8;
      this.shock = opts.shock || 0;
      this.stun = opts.stun || 0;
      this.armorBreak = opts.armorBreak || 0;
      this.pierce = opts.pierce || 0;
      this.chainRange = opts.chainRange || 95;
      this.burn = opts.burn || null;
      this.dead = false;
      this.hitSet = new Set();
      this.trail = [];
      this.angle = 0;
      this.life = 3; // safety timeout (s)
    }

    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      const t = this.target;
      // home toward target; if target gone, fly straight a moment
      let tx, ty;
      if (t && !t.dead) { tx = t.x; ty = t.y; }
      else if (this._lastTx != null) { tx = this._lastTx; ty = this._lastTy; }
      else { this.dead = true; return; }
      this._lastTx = tx; this._lastTy = ty;

      const dx = tx - this.x, dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      this.angle = Math.atan2(dy, dx);
      const step = this.speed * dt;
      if (dist <= step + (t ? t.r : 6)) {
        this._impact(t);
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        if (this.kind === 'arrow' || this.kind === 'missile')
          { this.trail.push({ x: this.x, y: this.y, a: 1 }); if (this.trail.length > 6) this.trail.shift(); }
      }
    }

    _applyEffects(enemy) {
      if (this.dot) enemy.addDot(this.dot.dps, this.dot.dur, 'poison');
      if (this.burn) enemy.addDot(this.burn.dps, this.burn.dur, 'burn');
      if (this.slow) enemy.applySlow(this.slow.amount, this.slow.dur);
      if (this.freezeChance && Math.random() < this.freezeChance) enemy.applyFreeze(0.8);
      if (this.shock) enemy.applyShock(this.shock * 4);
      if (this.stun) enemy.applyStun(this.stun);
      if (this.armorBreak) enemy.applyArmorBreak(this.armorBreak);
      if (this.dot || this.burn) this.game.lastDotSource = this.source;
    }

    _impact(primary) {
      this.dead = true;
      const dmg = this.damage;

      if (this.splash > 0) {
        // splash damage to all enemies in radius
        this.game.fx.explosion(this.x, this.y, this.splash, this.color);
        this.game.screenShake(this.kind === 'cannonball' ? 4 : 2);
        TD.AUDIO.play('explode');
        for (const e of this.game.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d <= this.splash + e.r) {
            const falloff = 1 - 0.4 * (d / this.splash);
            e.damage(dmg * Math.max(0.5, falloff), this.dmgType, this.crit && e === primary, this.source);
            this._applyEffects(e);
          }
        }
      } else if (this.chain > 0) {
        this._chainLightning(primary);
      } else {
        // single target (with optional pierce handled by railgun separately)
        if (primary && !primary.dead) {
          primary.damage(dmg, this.dmgType, this.crit, this.source);
          this._applyEffects(primary);
        }
        this.game.fx.spark(this.x, this.y, this.color);
      }
    }

    _chainLightning(first) {
      let current = first;
      let dmg = this.damage;
      const hit = new Set();
      let links = this.chain;
      let prev = { x: this.source.x, y: this.source.y };
      TD.AUDIO.play('zap');
      while (current && links >= 0 && !current.dead) {
        hit.add(current);
        this.game.fx.lightningArc(prev.x, prev.y, current.x, current.y, this.color);
        current.damage(dmg, this.dmgType, this.crit, this.source);
        this._applyEffects(current);
        prev = { x: current.x, y: current.y };
        dmg *= this.chainFalloff;
        links--;
        // find next nearest unhit enemy within jump range
        let best = null, bestD = this.chainRange;
        for (const e of this.game.enemies) {
          if (e.dead || hit.has(e)) continue;
          const d = Math.hypot(e.x - current.x, e.y - current.y);
          if (d < bestD) { bestD = d; best = e; }
        }
        current = best;
      }
    }

    serialize() { return null; } // projectiles are transient; not saved
  }

  TD.Projectile = Projectile;
})(window.TD);
