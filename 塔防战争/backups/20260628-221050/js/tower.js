/* ============================================================
   tower.js — tower entity: stat computation, targeting, firing,
   upgrades, evolution, support auras, beam handling.
   ============================================================ */
(function (TD) {
  let _id = 1;

  class Tower {
    constructor(key, tc, tr, game) {
      const def = TD.TOWERS[key];
      this.id = _id++;
      this.key = key;
      this.def = def;
      this.game = game;
      this.tc = tc; this.tr = tr;
      const c = game.map.tileCenter(tc, tr);
      this.x = c.x; this.y = c.y;
      this.level = def.startLevel || 1; // Support towers start at level 2
      this.evolution = null;     // 'ranger', 'sniper', ...
      this.angle = -Math.PI / 2;
      this.cooldown = 0;
      this.target = null;
      this.kills = 0;
      this.damageDone = 0;
      this.recoil = 0;
      this.muzzle = 0;
      this.totalSpent = def.cost;
      this.targetMode = def.defaultTarget || 'first'; // first | last | strong | weak
      this.isSupport = !!def.isSupport;
      this.beamTarget = null;
      this.beamRamp = 0;
      this.frozen = 0;          // legacy timed freeze (seconds)
      this.permaFrozen = false; // frozen by ice wizard for the rest of the wave
      // ---- hit points (scale with level) + mind-control state ----
      this.maxHp = this._hpForLevel(this.level);
      this.hp = this.maxHp;
      this.mindControlled = 0;  // seconds remaining under dark-wizard control
      this.mcFlash = 0;         // combat flash timer
      this.shutdown = 0;        // seconds offline (fairy reflection)
      // arsonist fire state
      this.burning = 0;         // seconds until fully burned down (fire in progress)
      this._burnDur = 0;        // how long this fire burns (used when it spreads)
      this.burnedDown = false;  // offline rubble until repaired
      this.repairing = 0;       // seconds left rebuilding (paid)
      this.repairProgress = 0;  // 0–1 rebuilt by Support pulses
      this._dmgCooldown = 0;    // delay before hp regen after taking damage
      this.pulseTimer = 0;      // support tower pulse charge
      this._buff = { damage: 0, fireRate: 0, range: 0, crit: 0, multishot: 0, chainRange: 0 };
      this._buffTimer = 0;      // seconds remaining on a support pulse buff
      this._auraRange = 0;      // passive range bonus while in a Support aura (continuous)
      // flamethrower fuel: fire for `fuel` seconds, then `recharge` to refuel
      this.fuelMax = (def.base && def.base.fuel) || 0;
      this.fuel = this.fuelMax;
      this.recharge = 0;        // seconds left refueling (can't fire)
      this.rechargeBoost = 0;   // seconds of 2x recharge speed (lvl-3 support pulse)
      this.frozenTarget = null; // ice tower's single freeze-in-place target
    }

    /* Support pulse cadence by level: L1 20s · L2 15s · L3 10s. */
    pulsePeriod() { return { 1: 20, 2: 15, 3: 10 }[this.level] || 20; }
    /* Buff magnitude a pulse grants, scaling with the support's level. */
    pulseBuff() {
      return { 1: { damage: 0.15, fireRate: 0.12, range: 0.10, crit: 0.05 },
               2: { damage: 0.25, fireRate: 0.20, range: 0.15, crit: 0.08 },
               3: { damage: 0.35, fireRate: 0.30, range: 0.20, crit: 0.12 } }[this.level]
             || { damage: 0.15, fireRate: 0.12, range: 0.10, crit: 0.05 };
    }
    /* Apply a temporary buff (Math.max so overlapping pulses keep the strongest).
       Range is NOT pulsed — it's a steady aura (see Game.applyAuraRange) so the
       tower's range ring doesn't jump every pulse. */
    applyPulseBuff(b, special, dur) {
      this._buff.damage = Math.max(this._buff.damage, b.damage);
      this._buff.fireRate = Math.max(this._buff.fireRate, b.fireRate);
      this._buff.crit = Math.max(this._buff.crit, b.crit);
      if (special) {
        if (this.key === 'archer') this._buff.multishot = Math.max(this._buff.multishot, 1);
        if (this.key === 'tesla')  this._buff.chainRange = Math.max(this._buff.chainRange, 45);
      }
      this._buffTimer = Math.max(this._buffTimer, dur);
    }

    /* Freeze immunity: flame towers never freeze; Support towers become immune at L3. */
    get freezeImmune() { return !!this.def.cannotFreeze || (this.isSupport && this.level >= 3); }

    /* Freeze this tower solid for `dur` seconds. */
    freeze(dur) { if (this.freezeImmune) return; this.frozen = Math.max(this.frozen, dur); }
    /* Ice-wizard freeze. Normal towers freeze for the rest of the wave; Support towers
       only freeze briefly by level (L1 = 5s, L2 = 2.5s, L3 = immune). */
    freezeForLevel() {
      if (this.freezeImmune) return;
      if (this.isSupport) {
        const dur = { 1: 5, 2: 2.5 }[this.level] || 0;
        if (dur) this.frozen = Math.max(this.frozen, dur);
        return;
      }
      this.permaFrozen = true;
    }
    /* Clear all freezes (called when a wave is cleared). */
    thaw() { this.frozen = 0; this.permaFrozen = false; }
    get isFrozen() { return this.permaFrozen || this.frozen > 0; }

    /* ---- hit points & damage-driven level reversion ---- */
    _hpForLevel(lv) { return 50 + lv * 25; } // L1=75 … L10=300

    /* Cumulative gold invested to reach the current level (for sell value after revert). */
    _recomputeSpent() {
      const u = this.def.upgradeCost;
      let s = this.def.cost;
      for (let i = 1; i < this.level; i++) s += Math.round(u.base * Math.pow(u.growth, i - 1));
      this.totalSpent = s;
    }

    /* Take combat damage. A tower can never be destroyed — instead, each full
       "chunk" of HP lost reverts one upgrade level (scaled by health), all the
       way down to level 1 base. Returns levels lost. */
    takeDamage(dmg) {
      if (dmg <= 0) return 0;
      this.hp -= dmg;
      this._dmgCooldown = 2;
      this.mcFlash = 0.25;
      let lost = 0;
      while (this.hp <= 0 && this.level > 1) {
        this.level--;
        lost++;
        if (this.level < TD.MAX_LEVEL) this.evolution = null; // lose evolution below max
        this.maxHp = this._hpForLevel(this.level);
        this.hp += this.maxHp; // carry remaining damage into the lower level's pool
      }
      if (this.hp <= 0) this.hp = Math.max(1, this.maxHp * 0.05); // level 1: indestructible
      if (lost) { this._recomputeSpent();
        if (this.game) this.game.fx.floatText(this.x, this.y - 24, '▼ Lv ' + this.level, '#c07bff'); }
      return lost;
    }

    /* approximate damage-per-second for tower-vs-tower combat */
    dps() {
      if (this.isSupport) return 0;
      if (this.def.base.beam) return this.damage * 3;
      return this.damage * this.fireRate;
    }

    mindControl(dur) { if (this.isSupport) return; this.mindControlled = Math.max(this.mindControlled, dur); this.target = null; }

    /* ---- arsonist fire / repair ---- */
    startBurning(t) { if (this.burnedDown || this.burning > 0 || this.repairing > 0) return; this.burning = t; this._burnDur = t; }
    /* Repair cost equals an upgrade at the tower's current level. Rebuild takes 5s/level. */
    repairCost() { return this.upgradeCost(); }
    repairTime() { return this.level * 5; }
    beginRepair() { if (!this.burnedDown) return; this.burnedDown = false; this.repairProgress = 0; this.repairing = this.repairTime(); }
    /* Shut this tower offline for `dur` seconds (fairy reflection). */
    shutDown(dur) { this.shutdown = Math.max(this.shutdown, dur); this.target = null; this.beamTarget = null; }

    /* ---- computed stats (base + per-level + evolution + support buffs) ---- */
    stat(name) {
      const def = this.def;
      let v = def.base[name] != null ? def.base[name] : 0;
      const per = def.perLevel || {};
      const lv = this.level - 1;
      // additive per-level (perLevel keys can target stat directly)
      if (per[name] != null) v += per[name] * lv;
      // special per-level handlers
      if (name === 'splash' && per.splash) v = def.base.splash + per.splash * lv;
      return v;
    }

    get damage() {
      let v = this.def.base.damage || 0;
      v += (this.def.perLevel.damage || 0) * (this.level - 1);
      v *= this._evoMul('damage');
      v *= (1 + this._buff.damage);
      return v;
    }
    get range() {
      let v = this.def.base.range || 0;
      v += (this.def.perLevel.range || 0) * (this.level - 1);
      v *= this._evoMul('range');
      v *= (1 + this._auraRange); // continuous while inside a Support aura (no pulsing)
      return v;
    }
    get fireRate() {
      let v = this.def.base.fireRate || 0;
      v += (this.def.perLevel.fireRate || 0) * (this.level - 1);
      v *= this._evoMul('fireRate');
      v *= (1 + this._buff.fireRate);
      return v;
    }
    get crit() {
      let v = this.def.base.crit || 0;
      v += (this.def.perLevel.crit || 0) * (this.level - 1);
      v += this._evoAdd('crit');
      v += this._buff.crit;
      return Math.min(0.9, v);
    }
    get splash() {
      let v = this.def.base.splash || 0;
      v += (this.def.perLevel.splash || 0) * (this.level - 1);
      v *= this._evoMul('splash');
      if (this.evolution && this._evo().mods.splash && !this.def.base.splash)
        v = this._evo().mods.splash; // grant splash where none existed (toxic/plasma)
      return v;
    }
    get projSpeed() {
      let v = this.def.base.projSpeed || 6;
      v += (this.def.perLevel.projSpeed || 0) * (this.level - 1);
      v *= this._evoMul('projSpeed');
      return v;
    }
    get dotInfo() {
      if (!this.def.base.dot) return null;
      let dps = this.def.base.dot.dps + (this.def.perLevel.dotDps || 0) * (this.level - 1);
      let dur = this.def.base.dot.dur;
      const m = this.evolution ? this._evo().mods : {};
      if (m.dotDps) dps *= m.dotDps;
      if (m.dotDur) dur *= m.dotDur;
      return { dps, dur };
    }
    get burnInfo() {
      if (!this.def.base.burn) return null;
      let dps = this.def.base.burn.dps + (this.def.perLevel.burnDps || 0) * (this.level - 1);
      let dur = this.def.base.burn.dur;
      const m = this.evolution ? this._evo().mods : {};
      if (m.burnDps) dps *= m.burnDps;
      return { dps, dur };
    }

    _evo() { return this.def.evolve[this.evolution]; }
    _evoMul(name) {
      if (!this.evolution) return 1;
      const m = this._evo().mods;
      return m[name] != null && m[name] > 0 && ['damage','range','fireRate','splash','projSpeed'].includes(name) ? m[name] : 1;
    }
    _evoAdd(name) {
      if (!this.evolution) return 0;
      const m = this._evo().mods;
      return m[name] != null ? m[name] : 0;
    }

    get displayColor() { return this.evolution ? this._evo().color : this.def.color; }
    get displayName() { return this.evolution ? this._evo().name : this.def.name; }

    /* ---- upgrade economy ---- */
    upgradeCost() {
      const u = this.def.upgradeCost;
      return Math.round(u.base * Math.pow(u.growth, this.level - 1));
    }
    maxLevel() { return this.def.maxLevel || TD.MAX_LEVEL; }
    canUpgrade() { return this.level < this.maxLevel(); }
    canEvolve() { return this.level >= this.maxLevel() && !this.evolution && !!this.def.evolve; }

    upgrade() {
      if (!this.canUpgrade()) return false;
      this.totalSpent += this.upgradeCost(); // record the cost actually paid, then level up
      this.level++;
      this.maxHp = this._hpForLevel(this.level); this.hp = this.maxHp; // upgrading fully repairs
      return true;
    }
    evolve(branch) {
      if (!this.canEvolve() || !this.def.evolve[branch]) return false;
      this.evolution = branch;
      return true;
    }
    sellValue() { return Math.round(this.totalSpent * TD.CONFIG.sellRefund); }

    resetBuffs() { this._buff = { damage: 0, fireRate: 0, range: 0, crit: 0, multishot: 0, chainRange: 0 }; }

    /* ---- targeting ---- */
    _acquire() {
      const range = this.range;
      let best = null, bestScore = -Infinity, bestDist = Infinity;
      for (const e of this.game.enemies) {
        if (e.dead || e.isHidden) continue; // can't see stealthed arsonists
        if (e.flying && !this.def.base.antiAir) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d > range + e.r) continue;
        let score;
        switch (this.targetMode) {
          case 'last':   score = -e.distTravelled; break;
          case 'strong': score = e.hp; break;
          case 'weak':   score = -e.hp; break;
          default:       score = e.distTravelled; break; // first
        }
        if (score > bestScore) { bestScore = score; best = e; bestDist = d; }
      }
      return best;
    }

    update(dt) {
      if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);
      if (this.muzzle > 0) this.muzzle = Math.max(0, this.muzzle - dt * 8);
      if (this.mcFlash > 0) this.mcFlash = Math.max(0, this.mcFlash - dt * 4);

      // support pulse buff decays after its window
      if (this._buffTimer > 0) { this._buffTimer -= dt; if (this._buffTimer <= 0) this.resetBuffs(); }
      if (this.rechargeBoost > 0) this.rechargeBoost = Math.max(0, this.rechargeBoost - dt);

      // arsonist fire: being rebuilt → offline; burned down → offline; on fire → still
      // fights for 5s then collapses offline.
      if (this.repairing > 0) { this.repairing -= dt; if (this.repairing <= 0) { this.hp = this.maxHp; } this.target = null; this.beamTarget = null; return; }
      if (this.burnedDown) { this.target = null; this.beamTarget = null; return; }
      if (this.burning > 0) {
        this.burning -= dt;
        if (this.burning <= 0) {
          this.burnedDown = true; this.repairProgress = 0;
          this.target = null; this.beamTarget = null;
          this.game.spreadFire(this); // fire jumps to touching towers
          return;
        }
      }

      // mind-controlled: combat is resolved centrally by the game; don't act normally
      if (this.mindControlled > 0) {
        this.mindControlled -= dt;
        if (this.mindControlled <= 0) this.hp = this.maxHp; // regain current-level HP when freed
        return;
      }

      // shut down by a fairy reflection: offline, can't act
      if (this.shutdown > 0) { this.shutdown = Math.max(0, this.shutdown - dt); this.target = null; this.beamTarget = null; return; }

      // slow HP regen (current level only — lost upgrade levels do NOT come back)
      if (this._dmgCooldown > 0) this._dmgCooldown -= dt;
      else if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 18 * dt);

      // frozen by an ice wizard: tower can't act (no targeting, firing or beam)
      if (this.isFrozen) { if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt); this.target = null; this.beamTarget = null; return; }

      // support tower: charge a pulse that cleanses + temporarily buffs nearby towers.
      // Pulse cadence shortens with level: L1 = 20s, L2 = 15s, L3 = 10s.
      if (this.isSupport) {
        this.pulseTimer += dt;
        if (this.pulseTimer >= this.pulsePeriod()) { this.pulseTimer = 0; this.game.supportPulse(this); }
        return;
      }

      // re-validate target
      if (this.target && (this.target.dead ||
          Math.hypot(this.target.x - this.x, this.target.y - this.y) > this.range + this.target.r ||
          (this.target.flying && !this.def.base.antiAir)))
        this.target = null;
      if (!this.target) this.target = this._acquire();

      if (this.target) {
        const dx = this.target.x - this.x, dy = this.target.y - this.y;
        const want = Math.atan2(dy, dx);
        // smooth rotation
        let diff = want - this.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.angle += diff * Math.min(1, dt * 12);
      }

      if (this.def.cone) { this._updateCone(dt); return; }
      if (this.def.base.beam) { this._updateBeam(dt); return; }

      this.cooldown -= dt;
      if (this.target && this.cooldown <= 0) {
        this._fire();
        this.cooldown = 1 / Math.max(0.05, this.fireRate);
      }
    }

    _updateBeam(dt) {
      // laser: continuous damage to current target, ramping the longer it holds
      if (this.target) {
        if (this.beamTarget !== this.target) { this.beamTarget = this.target; this.beamRamp = 0; }
        const m = this.evolution ? this._evo().mods : {};
        const rampMax = (this.def.base.rampMax) * (m.rampMax || 1);
        const rampRate = (this.def.base.rampRate) * (m.rampRate || 1);
        this.beamRamp = Math.min(rampMax, this.beamRamp + rampRate * dt);
        const dps = this.damage * (1 + this.beamRamp);
        const isCrit = Math.random() < this.crit * dt * 2;
        this.target.damage(dps * dt * (isCrit ? 2 : 1), this.dmgType(), false, this);
        const burn = this.burnInfo;
        if (burn && Math.random() < dt * 3) this.target.addDot(burn.dps, burn.dur, 'burn');
        if (this.splash > 0) {
          for (const e of this.game.enemies) {
            if (e === this.target || e.dead) continue;
            if (Math.hypot(e.x - this.target.x, e.y - this.target.y) <= this.splash)
              e.damage(dps * dt * 0.4, this.dmgType(), false, this);
          }
        }
        this.muzzle = 0.2;
      } else { this.beamTarget = null; this.beamRamp = 0; }
    }

    get coneAngle() {
      let a = this.def.base.coneAngle || 0.5;
      const m = this.evolution ? this._evo().mods : {};
      if (m.coneAngle) a *= m.coneAngle;
      return a;
    }

    get isRecharging() { return this.recharge > 0; }

    _updateCone(dt) {
      // Flamethrower: continuous cone of fire. `damage` is damage-per-second.
      // Fuel lasts `fuelMax` seconds of firing, then a `rechargeTime` refuel during
      // which it can't fire. A lvl-3 Support pulse doubles the recharge speed.
      if (this.recharge > 0) {
        this.recharge -= dt * (this.rechargeBoost > 0 ? 2 : 1);
        if (this.recharge <= 0) { this.recharge = 0; this.fuel = this.fuelMax; }
        this.muzzle = 0;
        return;
      }
      if (!this.target) return;

      const half = this.coneAngle;
      const range = this.range;
      const ice = !!this.def.slowGas;

      // ice gas parameters (slow + chance to freeze) scaled by level/evolution
      let slowAmt = 0, freezeChance = 0, freezeDur = 0, slowDur = 3;
      if (ice) {
        const lvl = this.level - 1, m = this.evolution ? this._evo().mods : {};
        slowAmt = Math.min(0.85, ((this.def.base.slow || 0.5) + (this.def.perLevel.slow || 0) * lvl) * (m.slow || 1));
        freezeChance = ((this.def.base.freezeChance || 0.05) + (this.def.perLevel.freezeChance || 0) * lvl) * (m.freezeChance || 1);
        freezeDur = (this.def.base.freezeDur || 10) * (m.freezeDur || 1);
        slowDur = this.def.base.slowDur || 3;
      }
      const dps = this.damage;
      const burn = this.burnInfo;

      let hitAny = false;
      for (const e of this.game.enemies) {
        if (e.dead || e.isHidden) continue;
        if (e.flying && !this.def.base.antiAir) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > range + e.r) continue;
        let diff = Math.atan2(dy, dx) - this.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const slack = d < 30 ? half + 0.4 : half;
        if (Math.abs(diff) > slack) continue;

        if (ice) {
          // no effect on bosses, wizards, or Paladin-guarded mobs (incl. the Paladin)
          if (e.def.boss || e.def.guardRadius || e.paladinGuard > 0 || e.def.caster || e.def.mind || e.def.reflect) continue;
          e.applySlow(slowAmt, slowDur); // debuff lingers `slowDur` s after leaving the cone
          // 5%/s chance to freeze in place — only ONE frozen target per tower at a time
          if (!this._frozenAlive() && Math.random() < freezeChance * dt) {
            e.applyFreeze(freezeDur); this.frozenTarget = e;
            this.game.fx.frostBurst(e.x, e.y, 22);
            this.game.fx.floatText(e.x, e.y - e.r - 8, '❄ FROZEN', '#aee9ff');
          }
          hitAny = true;
        } else {
          e.damage(dps * dt, TD.DMG.FIRE, false, this);
          if (burn && Math.random() < dt * 4) e.addDot(burn.dps, burn.dur, 'burn');
          hitAny = true;
        }
      }
      // burn fuel only while actually spraying something
      if (hitAny) { this.fuel -= dt; if (this.fuel <= 0) { this.fuel = 0; this.recharge = this.def.base.rechargeTime || 10; } }
      this.muzzle = hitAny ? 1 : 0.4;
    }

    /* is this tower's single frozen target still frozen & alive? */
    _frozenAlive() {
      const t = this.frozenTarget;
      if (t && !t.dead && t.effects.freezeTimer > 0) return true;
      this.frozenTarget = null;
      return false;
    }

    dmgType() { return this.def.dmgType; }

    _fire() {
      const isCrit = Math.random() < this.crit;
      const dmg = this.damage * (isCrit ? 2 : 1);
      const m = this.evolution ? this._evo().mods : {};
      const shots = (m.multishot || 1) + (this._buff.multishot || 0); // +arrows from a lvl-3 Support

      TD.AUDIO.play(this.def.projectile === 'cannonball' ? 'cannon' :
                    this.def.projectile === 'lightning' ? 'zap' :
                    this.def.projectile === 'magicbolt' ? 'magic' : 'shot');

      const targets = [this.target];
      if (shots > 1) {
        // pick additional distinct targets
        const extra = this.game.enemies.filter(e =>
          e !== this.target && !e.dead && !(e.flying && !this.def.base.antiAir) &&
          Math.hypot(e.x - this.x, e.y - this.y) <= this.range);
        for (let i = 0; i < shots - 1 && i < extra.length; i++) targets.push(extra[i]);
      }

      for (const tgt of targets) {
        if (!tgt) continue;
        const p = new TD.Projectile({
          x: this.x + Math.cos(this.angle) * 16,
          y: this.y + Math.sin(this.angle) * 16,
          target: tgt,
          speed: this.projSpeed,
          damage: dmg,
          dmgType: this.def.dmgType,
          kind: this.def.projectile,
          splash: this.splash,
          crit: isCrit,
          source: this,
          color: this.displayColor,
          dot: this.dotInfo,
          burn: this.burnInfo,
          slow: m.slow ? { amount: m.slow, dur: m.slowDur || 1.5 } : null,
          freezeChance: m.freezeChance || 0,
          chain: this.def.base.chain ? Math.floor((this.def.base.chain) + (this.def.perLevel.chainAdd || 0) * (this.level - 1)) * (m.chain ? m.chain / this.def.base.chain : 1) : (m.chain || 0),
          chainFalloff: m.chainFalloff || this.def.base.chainFalloff || 0.8,
          chainRange: 95 + (this._buff.chainRange || 0), // wider jumps from a lvl-3 Support
          shock: m.shock || this.def.base.shock || 0,
          stun: m.stun || 0,
          armorBreak: m.armorBreak || 0,
          pierce: m.pierce || 0,
        }, this.game);
        this.game.projectiles.push(p);
      }
      this.recoil = 1;
      this.muzzle = 1;
    }

    serialize() {
      return { key: this.key, tc: this.tc, tr: this.tr, level: this.level,
        evolution: this.evolution, kills: this.kills, damageDone: Math.round(this.damageDone),
        totalSpent: this.totalSpent, targetMode: this.targetMode };
    }
    static deserialize(s, game) {
      const t = new Tower(s.key, s.tc, s.tr, game);
      t.level = s.level; t.evolution = s.evolution; t.kills = s.kills || 0;
      t.damageDone = s.damageDone || 0; t.totalSpent = s.totalSpent; t.targetMode = s.targetMode || 'first';
      return t;
    }
  }

  TD.Tower = Tower;
})(window.TD);
