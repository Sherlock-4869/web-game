/* ============================================================
   enemy.js — enemy entity, movement, status effects, death.
   Status effects: burn, poison, slow, freeze, stun, shock, armorBreak, bleed.
   ============================================================ */
(function (TD) {
  let _id = 1;

  class Enemy {
    constructor(typeKey, scaling, map, game, pathIndex) {
      const def = TD.ENEMIES[typeKey];
      this.id = _id++;
      this.def = def;
      this.type = typeKey;
      this.map = map;
      this.pathIndex = pathIndex || 0;
      this.game = game;
      this.name = def.name;
      this.color = def.color;
      this.r = def.r;
      this.flying = !!def.flying;
      this.boss = !!def.boss;

      const s = scaling || { hpMul: 1, spdMul: 1, rewardMul: 1, armorAdd: 0 };
      this.maxHp = Math.round(def.hp * s.hpMul);
      this.hp = this.maxHp;
      this.baseSpeed = def.speed * s.spdMul;
      // randomized movement speed (e.g. Fairy God Mother — faster or slower than the wave)
      if (def.randomSpeed) {
        const [lo, hi] = def.randomSpeed;
        this.baseSpeed *= lo + Math.random() * (hi - lo);
      }
      // fairy reflection spell is armed until her first tower hit
      this.reflectArmed = !!def.reflect;
      this.armor = def.armor + (s.armorAdd || 0);
      this.baseArmor = this.armor;
      this.reward = Math.round(def.reward * (s.rewardMul || 1));
      this.regen = def.regen || 0;

      // shield (absorbs a fraction of max hp before health)
      this.shield = def.shield ? Math.round(this.maxHp * def.shield) : 0;
      this.maxShield = this.shield;

      // path — all enemies (including flyers) follow the maze path.
      // Flyers keep the `flying` flag for visuals + anti-air targeting,
      // but they hover ABOVE the same path rather than taking a shortcut.
      this.path = (map.paths && map.paths[this.pathIndex]) || map.waypoints;
      this.flyHover = this.flying ? -8 : 0; // small vertical offset so they read as airborne
      this.wp = 1;
      this.x = this.path[0].x;
      this.y = this.path[0].y;
      this.dir = 0;
      this.distTravelled = 0;

      // status effect containers
      this.effects = { slow: 0, slowTimer: 0, freezeTimer: 0, stunTimer: 0, shockTimer: 0,
        armorBreak: 0, armorBreakTimer: 0 };
      this.dots = []; // {dps, time, type}

      this.dead = false;
      this.reachedExit = false;
      this.healTimer = 0;
      // ice wizard: ready to cast as soon as a tower is in range; `casting` is the
      // brief movement pause while it freezes.
      this.castTimer = def.caster ? 1.5 : 0; // short grace before an Ice Wizard's first freeze
      this.casting = 0;
      this.mindTimer = 0; // dark wizard mind-control cooldown
      this.fairyTimer = def.reflect ? (def.reflect.reset || 5) : 0; // reflect re-arm + haste cadence
      // death-effect buffs (granted by a dying wizard nearby)
      this.invulnTimer = 0;     // immune to all damage (Dark Wizard death)
      this.speedBuffMul = 1;    // movement speed multiplier (Dark Wizard death)
      this.speedBuffTimer = 0;
      this.dmgReduction = 0;    // fractional damage reduction (Ice Wizard death)
      this.dmgReductionTimer = 0;
      this.permSlow = 0;        // permanent slow from the Guardian's snow ability
      this.blinkTimer = 0;      // Blink debuff remaining (Frost Wizard death)
      this.blinkTick = 0;
      // every wizard is immune to damage for its first 5 seconds on screen
      this.spawnInvuln = (def.caster || def.mind || def.reflect) ? 5 : 0;
      // arsonist stealth/burn cycle
      this.stealthed = !!def.arson;             // invisible + untargetable while stealthed
      this.revealTimer = 0;                     // forced out of stealth (support pulse)
      this.arsonTimer = def.arson ? this._rollStealth(def.arson) : 0; // random 1–15s window
      this.arsonActive = 0;
      // paladin guard aura (set each frame on nearby mobs by the game)
      this.paladinGuard = 0;
      this.shieldDown = 0;      // Paladin: seconds its protection is broken (support pulse)
      this.auraSpeedTimer = 0;  // refreshed each frame while inside a Paladin aura
      this.auraSpeedCap = Infinity;
    }

    /* random stealth window (defaults 1–15s) */
    _rollStealth(A) { const lo = A.stealthMin != null ? A.stealthMin : 1, hi = A.stealthMax != null ? A.stealthMax : 15; return lo + Math.random() * (hi - lo); }

    /* truly hidden = stealthed and not currently revealed by a support pulse */
    get isHidden() { return this.stealthed && this.revealTimer <= 0; }

    /* effective speed after slow/freeze/stun. */
    get speed() {
      if (this.casting > 0) return 0; // wizard pauses while it casts a freeze
      if (this.effects.freezeTimer > 0 || this.effects.stunTimer > 0) return 0;
      let mul = 1 - this.effects.slow;
      if (this.effects.shockTimer > 0) mul *= 0.85;
      mul *= this.speedBuffMul; // death-effect rally (+25%)
      if (this.permSlow > 0) mul *= (1 - this.permSlow); // Guardian permanent slow
      let spd = Math.max(0, this.baseSpeed * mul);
      // inside a Paladin aura, fast mobs are slowed to linger (then slowly pull ahead)
      if (this.auraSpeedTimer > 0 && spd > this.auraSpeedCap) spd = this.auraSpeedCap;
      return spd;
    }

    get effectiveArmor() {
      return Math.max(0, this.armor * (1 - this.effects.armorBreak));
    }

    applySlow(amount, dur) {
      if (amount >= this.effects.slow) { this.effects.slow = Math.min(0.85, amount); this.effects.slowTimer = dur; }
      else this.effects.slowTimer = Math.max(this.effects.slowTimer, dur);
    }
    applyFreeze(dur) { this.effects.freezeTimer = Math.max(this.effects.freezeTimer, dur); }
    applyStun(dur) { this.effects.stunTimer = Math.max(this.effects.stunTimer, dur); }
    applyShock(dur) { this.effects.shockTimer = Math.max(this.effects.shockTimer, dur); }
    applyArmorBreak(amount, dur = 4) { this.effects.armorBreak = Math.max(this.effects.armorBreak, amount); this.effects.armorBreakTimer = dur; }
    addDot(dps, dur, type) { this.dots.push({ dps, time: dur, type: type || 'poison' }); }
    applyInvuln(dur) { this.invulnTimer = Math.max(this.invulnTimer, dur); }
    applySpeedBuff(mul, dur) { this.speedBuffMul = Math.max(this.speedBuffMul, mul); this.speedBuffTimer = Math.max(this.speedBuffTimer, dur); }
    applyDmgReduction(frac, dur) { this.dmgReduction = Math.max(this.dmgReduction, frac); this.dmgReductionTimer = Math.max(this.dmgReductionTimer, dur); }
    applyBlink(dur) { this.blinkTimer = Math.max(this.blinkTimer, dur); if (this.blinkTick <= 0) this.blinkTick = 0.1; }

    /* Damage application honoring armor & damage type. Returns actual damage dealt. */
    damage(amount, dmgType, isCrit, source) {
      if (this.dead) return 0;
      // Shadow Wizard: the FIRST tower to hit her gets its attack reflected —
      // every tower of that type is shut down. The triggering hit deals no damage.
      if (this.reflectArmed && source && source.key) {
        this.reflectArmed = false;
        this.game.fairyReflect(this, source);
        return 0;
      }
      // spawn protection (wizards, first 5s) — no damage, no label spam
      if (this.spawnInvuln > 0) return 0;
      // Paladin: immune to everything except specific tower types (Archers & Cannons),
      // UNLESS its shield has been broken by a Support pulse.
      if (this.def.immuneExcept && this.shieldDown <= 0 && (!source || !source.key || this.def.immuneExcept.indexOf(source.key) < 0)) {
        return 0;
      }
      // protected by a living Paladin's guard aura
      if (this.paladinGuard > 0) { this.game.fx.floatText(this.x, this.y - this.r - 4, '✚', '#ffe08a'); return 0; }
      // death-effect protections
      if (this.invulnTimer > 0) { this.game.fx.floatText(this.x, this.y - this.r - 4, 'IMMUNE', '#c07bff'); return 0; }
      if (this.dmgReduction > 0) amount *= (1 - this.dmgReduction);
      let dmg = amount;
      if (dmgType === TD.DMG.PHYSICAL) dmg = Math.max(1, dmg - this.effectiveArmor);
      // magic, poison, energy ignore armor
      // shield soaks first
      if (this.shield > 0) {
        const soak = Math.min(this.shield, dmg);
        this.shield -= soak; dmg -= soak;
      }
      if (dmg > 0) this.hp -= dmg;
      if (source) { source.damageDone += amount; }
      this.game.fx.damageNumber(this.x, this.y - this.r - 4, Math.round(amount), isCrit, dmgType);
      if (this.hp <= 0) this._die(source);
      return amount;
    }

    _die(source) {
      if (this.dead) return;
      this.dead = true;
      if (source) source.kills++;
      this.game.onEnemyKilled(this, source);
      this.game.fx.deathBurst(this.x, this.y, this.color, this.boss);
      // splitter
      if (this.def.split) this.game.spawnSplit(this);
      // on-death explosion effect granting buffs to nearby enemies
      if (this.def.deathEffect) this.game.triggerDeathEffect(this);
      // Paladin death: heal nearby mobs to full
      if (this.def.deathHeal) this.game.paladinDeathHeal(this);
    }

    /* Instantly move forward along the path by `dist` pixels (Blink). */
    advance(dist) {
      let move = dist;
      while (move > 0 && this.wp < this.path.length) {
        const tgt = this.path[this.wp];
        const dx = tgt.x - this.x, dy = tgt.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d <= move) { this.x = tgt.x; this.y = tgt.y; move -= d; this.wp++; this.distTravelled += d; }
        else { this.x += (dx / d) * move; this.y += (dy / d) * move; this.dir = Math.atan2(dy, dx); this.distTravelled += move; move = 0; }
      }
      if (this.wp >= this.path.length) { this.reachedExit = true; this.dead = true; }
    }

    update(dt) {
      if (this.dead) return;

      // tick status timers
      const e = this.effects;
      if (e.slowTimer > 0) { e.slowTimer -= dt; if (e.slowTimer <= 0) e.slow = 0; }
      if (e.freezeTimer > 0) e.freezeTimer -= dt;
      if (e.stunTimer > 0) e.stunTimer -= dt;
      if (e.shockTimer > 0) e.shockTimer -= dt;
      if (e.armorBreakTimer > 0) { e.armorBreakTimer -= dt; if (e.armorBreakTimer <= 0) e.armorBreak = 0; }

      // spawn protection countdown
      if (this.spawnInvuln > 0) this.spawnInvuln -= dt;
      if (this.paladinGuard > 0) this.paladinGuard -= dt; // refreshed each frame by the game
      if (this.shieldDown > 0) this.shieldDown -= dt;
      if (this.auraSpeedTimer > 0) this.auraSpeedTimer -= dt;
      if (this.revealTimer > 0) this.revealTimer -= dt;
      // death-effect buff timers
      if (this.invulnTimer > 0) this.invulnTimer -= dt;
      if (this.speedBuffTimer > 0) { this.speedBuffTimer -= dt; if (this.speedBuffTimer <= 0) this.speedBuffMul = 1; }
      if (this.dmgReductionTimer > 0) { this.dmgReductionTimer -= dt; if (this.dmgReductionTimer <= 0) this.dmgReduction = 0; }
      if (this.blinkTimer > 0) {
        this.blinkTimer -= dt;
        this.blinkTick -= dt;
        if (this.blinkTick <= 0 && this.blinkTimer > 0) {
          const de = TD.DEATH_EFFECTS.blink;
          this.blinkTick = de.blinkEvery;
          const spaces = de.minSpaces + Math.floor(Math.random() * (de.maxSpaces - de.minSpaces + 1));
          this.game.fx.frostBurst(this.x, this.y, 18);
          this.advance(spaces * TD.CONFIG.tileSize);
          this.game.fx.floatText(this.x, this.y - this.r - 6, '✦ blink ' + spaces, '#bfe0ff');
          if (this.reachedExit) return;
        }
      }

      // damage-over-time (suppressed while immune to damage)
      const immune = this.spawnInvuln > 0 || this.invulnTimer > 0;
      for (let i = this.dots.length - 1; i >= 0; i--) {
        const d = this.dots[i];
        if (!immune) this.hp -= d.dps * dt;
        d.time -= dt;
        if (d.time <= 0) this.dots.splice(i, 1);
      }
      if (this.dots.length && this.hp > 0 && Math.random() < dt * 6)
        this.game.fx.poisonPuff(this.x, this.y);
      if (this.hp <= 0 && !this.dead) { this._die(this.game.lastDotSource || null); return; }

      // regen (elite bosses)
      if (this.regen) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);

      // healer aura
      if (this.def.heal) {
        this.healTimer -= dt;
        if (this.healTimer <= 0) {
          this.healTimer = this.def.heal.every;
          this.game.healAround(this, this.def.heal.amount, this.def.heal.radius);
          this.game.fx.healPulse(this.x, this.y, this.def.heal.radius);
        }
      }

      // ice wizard: when a tower is in range, pause, freeze a random tower (+ its
      // touching cluster) for the rest of the wave, then keep moving. 5s cooldown.
      if (this.def.caster) {
        if (this.casting > 0) this.casting -= dt;
        if (this.castTimer > 0) this.castTimer -= dt;
        if (this.castTimer <= 0 && this.casting <= 0 && this.game.wizardInRange(this)) {
          this.game.wizardCast(this);
          this.castTimer = this.def.caster.cooldown;
          this.casting = this.def.caster.pause;
        }
      }

      // dark wizard: every 5s, pause and mind-control ALL towers on the map.
      if (this.def.mind) {
        if (this.casting > 0) this.casting -= dt;
        if (this.mindTimer > 0) this.mindTimer -= dt;
        if (this.mindTimer <= 0 && this.casting <= 0 && this.game.darkWizardInRange(this)) {
          this.game.darkWizardCast(this);
          this.mindTimer = this.def.mind.cooldown;
          this.casting = this.def.mind.pause;
        }
      }

      // arsonist: hide for a random 1–15s, surface for 5s to torch ONE nearby tower,
      // then slip back into stealth.
      if (this.def.arson) {
        const A = this.def.arson;
        if (this.stealthed) {
          this.arsonTimer -= dt;
          if (this.arsonTimer <= 0) { this.stealthed = false; this.arsonActive = A.active; this.game.arsonistIgnite(this); }
        } else {
          this.arsonActive -= dt;
          if (this.arsonActive <= 0) { this.stealthed = true; this.arsonTimer = this._rollStealth(A); }
        }
      }

      // shadow wizard: every 5s re-arm her reflect and haste a random mob by +50%.
      if (this.def.reflect) {
        this.fairyTimer -= dt;
        if (this.fairyTimer <= 0) {
          this.fairyTimer = (this.def.reflect.reset || 5);
          this.reflectArmed = true;
          this.game.fairyHaste(this);
        }
      }

      // movement along waypoints
      const spd = this.speed;
      if (spd > 0) {
        let move = spd * dt;
        while (move > 0 && this.wp < this.path.length) {
          const tgt = this.path[this.wp];
          const dx = tgt.x - this.x, dy = tgt.y - this.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= move) {
            this.x = tgt.x; this.y = tgt.y; move -= dist; this.wp++;
          } else {
            this.x += (dx / dist) * move;
            this.y += (dy / dist) * move;
            this.dir = Math.atan2(dy, dx);
            this.distTravelled += move;
            move = 0;
          }
        }
        if (this.wp >= this.path.length) { this.reachedExit = true; this.dead = true; }
      }
    }

    serialize() {
      return { type: this.type, hp: this.hp, maxHp: this.maxHp, shield: this.shield,
        x: this.x, y: this.y, wp: this.wp, baseSpeed: this.baseSpeed, armor: this.armor, reward: this.reward };
    }
  }

  TD.Enemy = Enemy;
})(window.TD);
