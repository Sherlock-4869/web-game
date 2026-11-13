/* ============================================================
   game.js — main controller: game loop, state, build/upgrade/sell,
   wave control, speed, pause, stats, save, win/lose. Boots the app.
   ============================================================ */
(function (TD) {
  class Game {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.state = 'menu';           // menu | playing | paused | over | won
      this.difficulty = 'normal';
      this.speed = 1;
      this.time = 0;                 // total elapsed game seconds
      this.autoCountdown = 0;        // countdown to next wave
      this.lastDotSource = null;
      this.hoverTower = null;

      this.towers = [];
      this.enemies = [];
      this.projectiles = [];
      this.selectedTower = null;

      this.stats = this._freshStats();
      this._accum = 0;
      this._lastTs = 0;
      this._autosaveTimer = 0;

      this.ui = new TD.UI(this);
      this._bindMenu();
      this._handleResize();
      window.addEventListener('resize', () => this._handleResize());

      // resume audio on first interaction
      window.addEventListener('pointerdown', () => { TD.AUDIO.init(); TD.AUDIO.resume(); }, { once: true });

      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    _freshStats() {
      return { kills: 0, bosses: 0, towersBuilt: 0, leaks: 0, highestWave: 0,
        shotsFired: 0, shotsHit: 0, playTime: 0, longestGame: 0 };
    }

    /* ---------------- setup / teardown ---------------- */
    _bindMenu() {
      document.querySelectorAll('.diff-btn').forEach(b => {
        b.addEventListener('click', () => {
          document.querySelectorAll('.diff-btn').forEach(x => x.classList.toggle('active', x === b));
          this.difficulty = b.dataset.diff;
        });
      });
      const cont = document.getElementById('btnContinue');
      cont.disabled = !TD.Save.has();
      document.getElementById('btnNewGame').addEventListener('click', () => this.newGame());
      cont.addEventListener('click', () => this.continueGame());
      const custom = document.getElementById('btnCustomize');
      if (custom) custom.addEventListener('click', () => this.openSettings());
      const hint = document.getElementById('menuHint');
      if (TD.Save.has()) { const s = TD.Save.load(); hint.textContent = `Saved game: Wave ${s.wave} · ${TD.DIFFICULTY[s.difficulty].label}`; }
    }

    openSettings() {
      if (!TD.Settings) return;
      TD.Settings._toast = (m) => this.ui.toast(m);
      document.getElementById('menu').classList.add('hidden');
      const screen = document.getElementById('settings');
      screen.classList.remove('hidden');
      TD.Settings.buildUI(document.getElementById('setBody'), () => {
        screen.classList.add('hidden');
        document.getElementById('menu').classList.remove('hidden');
        this._refreshMenuHint();
      });
    }
    _refreshMenuHint() {
      const cont = document.getElementById('btnContinue');
      if (cont) cont.disabled = !TD.Save.has();
      const hint = document.getElementById('menuHint');
      if (hint && TD.Save.has()) { const s = TD.Save.load(); hint.textContent = `Saved game: Wave ${s.wave} · ${TD.DIFFICULTY[s.difficulty].label}`; }
      else if (hint && TD.Settings && TD.Settings.hasAny()) hint.textContent = '⚙ Custom values active';
    }

    newGame() {
      TD.Save.clear();
      this.phase = 1;
      this._init(this.difficulty, TD.pickMap('single')); // random phase-1 map
      this._enterGame();
      this.ui.toast('Good luck on ' + this.map.name + '! Build towers, then Start Wave.');
    }
    continueGame() {
      const data = TD.Save.load();
      if (!data) return this.newGame();
      this.phase = data.phase || 1;
      const sel = data.mapSel || { pool: 'single', index: 0 };
      this._init(data.difficulty, sel);
      this.economy.load(data.economy);
      this.waves.wave = data.wave || 0;
      this.started = (data.wave || 0) >= 1; // resumed mid-game → already started
      this.stats = Object.assign(this._freshStats(), data.stats || {});
      this.speed = data.speed || 1;
      for (const ts of (data.towers || [])) {
        const t = TD.Tower.deserialize(ts, this);
        this.towers.push(t);
      }
      this._enterGame();
      this.ui.toast('Game restored · Phase ' + this.phase + ' · Wave ' + this.waves.wave);
    }

    _init(difficulty, mapSel) {
      if (TD.Guide) TD.Guide.newSession(); // show the walkthrough again each playthrough
      this.difficulty = difficulty;
      // apply the player's customized values for this difficulty (or defaults)
      if (TD.Settings) TD.Settings.apply(difficulty);
      this.mapSel = mapSel || TD.pickMap('single');
      this.phase = this.mapSel.pool === 'dual' ? 2 : (this.phase || 1);
      this.map = new TD.GameMap(TD.getMap(this.mapSel.pool, this.mapSel.index));
      this.economy = new TD.Economy(difficulty);
      this.waves = new TD.WaveManager(this);
      this.fx = new TD.Effects(this);
      this.renderer = new TD.Renderer(this.canvas, this);
      this.input = new TD.Input(this, this.canvas);
      this.towers = []; this.enemies = []; this.projectiles = [];
      this.selectedTower = null;
      this.guardian = TD.Guardian ? new TD.Guardian(this) : null;
      this.time = 0; this.autoCountdown = 0; this._autosaveTimer = 0;
      this.started = false; // guardian only charges once the first wave starts
      this.fx.clear();
    }

    _enterGame() {
      this.state = 'playing';
      document.getElementById('menu').classList.add('hidden');
      document.getElementById('game').classList.remove('hidden');
      TD.AUDIO.init(); TD.AUDIO.startMusic();
      this.ui.refreshAll();
      this._handleResize();
      // first-time assistant: walk through what's available for the upcoming wave
      if (TD.Guide) TD.Guide.maybeShow(this, (this.waves.wave || 0) + 1);
    }

    toMenu() {
      if (this.state === 'playing' || this.state === 'paused') TD.Save.save(this);
      this.state = 'menu';
      TD.AUDIO.stopMusic();
      this.ui.hideOverlay();
      document.getElementById('game').classList.add('hidden');
      document.getElementById('menu').classList.remove('hidden');
      const cont = document.getElementById('btnContinue');
      cont.disabled = !TD.Save.has();
      if (TD.Save.has()) { const s = TD.Save.load(); document.getElementById('menuHint').textContent = `Saved game: Wave ${s.wave} · ${TD.DIFFICULTY[s.difficulty].label}`; }
    }

    /* ---------------- build / upgrade / sell ---------------- */
    towerAt(c, r) { return this.towers.find(t => t.tc === c && t.tr === r) || null; }

    towerCount(key) { return this.towers.reduce((n, t) => n + (t.key === key ? 1 : 0), 0); }
    /* effective build cap (null = unlimited). Phase-2 caps apply once on a dual map. */
    towerCap(key) {
      const def = TD.TOWERS[key];
      if ((this.phase || 1) >= 2 && def.maxCountP2 != null) return def.maxCountP2;
      return def.maxCount != null ? def.maxCount : null;
    }
    atTowerCap(key) { const m = this.towerCap(key); return m != null && this.towerCount(key) >= m; }

    tryBuild(key, c, r) {
      const def = TD.TOWERS[key];
      if (this.waves.wave < def.unlock) return false;
      if (this.atTowerCap(key)) return false;
      if (!this.map.isBuildable(c, r, this.towers)) return false;
      if (!this.economy.spend(def.cost)) return false;
      const t = new TD.Tower(key, c, r, this);
      this.towers.push(t);
      this.stats.towersBuilt++;
      TD.AUDIO.play('build');
      this.fx.spark(t.x, t.y, def.color);
      this.selectTower(t);
      this.ui.refreshHUD(); this.ui.refreshToolbar();
      return true;
    }

    selectTower(t) {
      if (!t || !this._sellConfirmId || t.id !== this._sellConfirmId) this._sellConfirmId = null; // drop a pending sell-confirm
      this.selectedTower = t;
      this.ui.refreshTowerInfo();
    }
    upgradeSelected() {
      const t = this.selectedTower; if (!t || !t.canUpgrade()) return;
      const cost = t.upgradeCost();
      if (!this.economy.spend(cost)) { this.ui.toast('Not enough gold'); TD.AUDIO.play('deny'); return; }
      t.upgrade();
      TD.AUDIO.play('upgrade');
      this.fx.floatText(t.x, t.y - 20, 'Lv ' + t.level, '#6ee7ff');
      this.ui.refreshHUD(); this.ui.refreshTowerInfo();
    }
    evolveSelected(branch) {
      const t = this.selectedTower; if (!t || !t.canEvolve()) return;
      const cost = Math.round(t.upgradeCost() * 2.2);
      if (!this.economy.spend(cost)) { this.ui.toast('Not enough gold'); TD.AUDIO.play('deny'); return; }
      t.totalSpent += cost;
      t.evolve(branch);
      TD.AUDIO.play('upgrade');
      this.fx.banner(t.displayName + '!', '#ffcf4a');
      this.fx.deathBurst(t.x, t.y, t.displayColor, true);
      this.ui.refreshHUD(); this.ui.refreshTowerInfo();
    }
    sellSelected() {
      const t = this.selectedTower; if (!t) return;
      // first request just arms a confirmation; a second within 4s actually sells
      if (this._sellConfirmId !== t.id) {
        this._sellConfirmId = t.id;
        this._sellConfirmTimer = 4;
        TD.AUDIO.play('deny');
        this.ui.toast('Sell ' + t.displayName + ' for +' + t.sellValue() + 'g? Click Sell again to confirm.');
        this.ui.refreshTowerInfo();
        return;
      }
      this._sellConfirmId = null;
      this.economy.refund(t.sellValue());
      TD.AUDIO.play('sell');
      this.fx.floatText(t.x, t.y, '+' + t.sellValue() + 'g', '#ffcf4a');
      this.towers = this.towers.filter(x => x !== t);
      this.selectTower(null);
      this.ui.refreshHUD(); this.ui.refreshToolbar();
    }

    /* ---------------- waves ---------------- */
    startNextWave() {
      if (this.waves.active) return;
      const n = this.waves.wave + 1;
      this.started = true; // the game is now underway — guardian may charge
      this.autoCountdown = 0;
      this.leaksThisWave = 0; // track for the perfect-clear bonus
      TD.AUDIO.setTrack(n - 1); // rotate through the 5 themes by wave
      this.waves.start(n);
      this.stats.highestWave = Math.max(this.stats.highestWave, n);
      this.ui.refreshHUD();
    }
    onWaveCleared(n) {
      // boss gone — drop back to the rotating theme
      if (this._bossMusic) { this._bossMusic = false; TD.AUDIO.bossMusic(false); }
      // ice-wizard freezes last only for the wave — thaw every tower now
      for (const t of this.towers) { t.thaw(); t.shutdown = 0; }
      // Perfect-clear bonus: +100g if no mob got through the path this wave
      const perfect = (this.leaksThisWave || 0) === 0;
      const bonus = perfect ? 100 : 0;
      if (bonus) {
        this.economy.earn(bonus);
        this.fx.floatText(this.canvas.width / 2, 80, '+' + bonus + 'g flawless wave!', '#4ade80');
      }
      let interestMsg = '';
      if (n % TD.CONFIG.interestEvery === 0) {
        const i = this.economy.applyInterest();
        if (i > 0) interestMsg = ' · +' + i + 'g interest';
      }
      this.fx.banner('Wave ' + n + ' cleared!' , '#4ade80');
      this.ui.toast(perfect ? 'Flawless! +100g' + interestMsg : 'Wave cleared' + (interestMsg || ' (no perfect bonus — a mob leaked)'));
      // One continuous 25-level game; clearing wave 25 wins.
      if (n >= 25 && !this._wonOnce) { this._win(); return; }
      this.autoCountdown = TD.CONFIG.waveCountdown;
      TD.Save.save(this);
      this.ui.refreshAll();
      // assistant: introduce anything new arriving next wave
      if (TD.Guide) TD.Guide.maybeShow(this, n + 1);
    }

    /* Transition to Phase 2: new dual-entrance map, fresh board, wave cycle restarts
       with 300 gold. 20 more waves to win. */
    _enterPhase2() {
      this.phase = 2;
      this.mapSel = TD.pickMap('dual');
      this.map = new TD.GameMap(TD.getMap(this.mapSel.pool, this.mapSel.index));
      this.towers = []; this.enemies = []; this.projectiles = [];
      this.selectedTower = null;
      this.guardian = TD.Guardian ? new TD.Guardian(this) : null; // fresh guardian on the new map
      this.waves.wave = 0; this.waves.active = false; this.waves.spawnQueue = []; this.waves.totals = {};
      this.economy.gold = 300;
      this.autoCountdown = 0; this.leaksThisWave = 0;
      this.fx.clear();
      TD.AUDIO.play('victory');
      this.state = 'playing';
      this.ui.showOverlay('Phase 2 — ' + this.map.name,
        'New territory: two mob entrances, one exit. Your old defenses are gone — rebuild with 300 gold. Tower build caps now apply, so lean on upgrades. Survive 20 waves to win!',
        'win', [{ label: 'Build defenses', primary: true, onClick: () => { this.ui.hideOverlay(); } }]);
      TD.Save.save(this);
      this.ui.refreshAll();
    }

    spawnEnemy(type, scaling) {
      // dual-entrance maps: pick a random entrance per mob
      const pi = this.map.paths.length > 1 ? Math.floor(Math.random() * this.map.paths.length) : 0;
      const e = new TD.Enemy(type, scaling, this.map, this, pi);
      this.enemies.push(e);
    }
    spawnSplit(parent) {
      const info = parent.def.split;
      const sc = { hpMul: 1, spdMul: 1, rewardMul: 1, armorAdd: 0 };
      for (let i = 0; i < info.count; i++) {
        const e = new TD.Enemy(info.into, sc, this.map, this, parent.pathIndex);
        e.x = parent.x + (Math.random() - 0.5) * 16;
        e.y = parent.y + (Math.random() - 0.5) * 16;
        e.wp = parent.wp;
        // scale child hp to wave a bit via parent's current scaling
        e.maxHp = Math.round(e.maxHp * (parent.maxHp / TD.ENEMIES[parent.type].hp));
        e.hp = e.maxHp;
        this.enemies.push(e);
      }
    }
    healAround(healer, amount, radius) {
      for (const e of this.enemies) {
        if (e === healer || e.dead || e.boss) continue; // bosses can't be healed by mobs
        if (Math.hypot(e.x - healer.x, e.y - healer.y) <= radius)
          e.hp = Math.min(e.maxHp, e.hp + amount);
      }
    }

    /* Ice wizard can now freeze ANY tower on the map — it just needs one freezable
       tower to exist anywhere. */
    wizardInRange(w) {
      return this.towers.some(t => !t.isFrozen && !t.freezeImmune);
    }

    /* Ice wizard cast: picks a tower ANYWHERE on the map. 75% of the time it prefers
       a tower that's touching others and freezes the whole connected cluster; 25% it
       freezes a single tower. "Touching" now includes diagonals (corner contact) —
       any of the 8 surrounding tiles counts. Frozen for the rest of the wave. */
    wizardCast(w) {
      const all = this.towers.filter(t => !t.isFrozen && !t.freezeImmune);
      if (!all.length) return false;
      const isAdj = (a, b) => a !== b && Math.abs(a.tc - b.tc) <= 1 && Math.abs(a.tr - b.tr) <= 1;
      const clustered = all.filter(t => all.some(o => isAdj(o, t)));

      let start, frozen;
      if (clustered.length && Math.random() < 0.75) {
        // prefer a clustered tower → freeze its whole connected cluster
        start = clustered[Math.floor(Math.random() * clustered.length)];
        frozen = new Set([start]);
        const stack = [start];
        while (stack.length) {
          const cur = stack.pop();
          for (const t of all) {
            if (frozen.has(t)) continue;
            if (isAdj(t, cur)) { frozen.add(t); stack.push(t); }
          }
        }
      } else {
        // single target
        start = all[Math.floor(Math.random() * all.length)];
        frozen = new Set([start]);
      }
      const affected = [...frozen];
      for (const t of affected) t.freezeForLevel();

      // visuals: bolt to the struck tower, then a frost burst chaining out across the cluster
      this.fx.lightningArc(w.x, w.y, start.x, start.y, '#cdeeff');
      affected.forEach((t, i) => {
        this.fx.frostBurst(t.x, t.y, 26);
        this.fx.floatText(t.x, t.y - 24, 'FROZEN', '#bfe6ff');
        if (t !== start) this.fx.lightningArc(start.x, start.y, t.x, t.y, '#9fd6ff');
      });
      this.fx.floatText(w.x, w.y - w.r - 10, '❄ Freeze!', '#bfe6ff');
      TD.AUDIO.play('magic');
      this.screenShake(3);
      return true;
    }

    /* ---- Dark Wizard: mind control ---- */
    darkWizardInRange(w) {
      // can cast as long as any controllable tower exists
      return this.towers.some(t => !t.isSupport && !t.isFrozen);
    }
    /* Mind-controls ALL towers of ONE type. Only one type may be controlled at a
       time — picking a new type releases (frees) the previously controlled towers. */
    darkWizardCast(w) {
      const m = w.def.mind;
      const controllable = this.towers.filter(t => !t.isSupport && !t.isFrozen);
      if (!controllable.length) return false;

      // pick a tower type — prefer a different type than the one currently controlled
      const currentType = (this.towers.find(t => t.mindControlled > 0) || {}).key;
      let types = [...new Set(controllable.map(t => t.key))];
      if (types.length > 1 && currentType) types = types.filter(k => k !== currentType);
      const type = types[Math.floor(Math.random() * types.length)];

      // free whatever type was controlled before — those towers come back alive
      for (const t of this.towers) if (t.mindControlled > 0) { t.mindControlled = 0; t.hp = t.maxHp; }

      // mind-control every tower of the chosen type
      const affected = this.towers.filter(t => t.key === type && !t.isSupport && !t.isFrozen);
      for (const t of affected) {
        t.mindControl(m.duration);
        this.fx.lightningArc(w.x, w.y, t.x, t.y, '#a04bff');
        this.fx.deathBurst(t.x, t.y, '#a04bff', false);
      }
      const name = TD.TOWERS[type] ? TD.TOWERS[type].name : type;
      this.fx.banner('☠ ' + name + ' towers mind-controlled! ☠', '#c07bff');
      TD.AUDIO.play('magic');
      this.screenShake(4);
      return true;
    }

    /* Guardian power. Every ability reveals stealthed mobs; then one of three:
       lightning (−100 HP each), slow (permanent 50%), or freeze (all in place). */
    guardianActivate(ability) {
      const g = TD.GUARDIAN || {};
      const live = this.enemies.filter(e => !e.dead);
      for (const e of live) if (e.def.arson && e.stealthed) e.revealTimer = Math.max(e.revealTimer, g.revealDuration || 20);

      if (ability === 'lightning') {
        const dmg = g.lightningDamage || 100;
        for (const e of live) {
          this.fx.lightningArc(this.guardian.x, this.guardian.y, e.x, e.y, '#ffd24a');
          this.fx.damageNumber(e.x, e.y - e.r - 4, dmg, false, TD.DMG.ENERGY);
          e.hp -= dmg; // flat, bypasses armor/immunity
          if (e.hp <= 0 && !e.dead) e._die(null);
        }
        this.fx.banner('⚡ Lightning Storm!', '#ffd24a');
        this.screenShake(6);
      } else if (ability === 'slow') {
        const amt = g.slowAmount || 0.5;
        for (const e of live) { e.permSlow = Math.max(e.permSlow || 0, amt); this.fx.frostBurst(e.x, e.y, 14); }
        this.fx.banner('❄ Frozen Winds — mobs slowed!', '#bfe6ff');
      } else if (ability === 'freeze') {
        const dur = g.freezeDuration || 20;
        for (const e of live) { e.applyFreeze(dur); this.fx.frostBurst(e.x, e.y, 16); }
        this.fx.pulseRing(this.guardian.x, this.guardian.y, 200, '#7fd8ff');
        this.fx.banner('🧊 Deep Freeze — all mobs frozen!', '#7fd8ff');
        this.screenShake(5);
      }
      TD.AUDIO.play('magic');
    }

    /* Shadow Wizard haste: pick a random other mob on screen and permanently +50% speed. */
    fairyHaste(fairy) {
      const mul = (fairy.def.haste && fairy.def.haste.mul) || 1.5;
      const cands = this.enemies.filter(e => e !== fairy && !e.dead && !e.boss); // never haste bosses
      if (!cands.length) return;
      const e = cands[Math.floor(Math.random() * cands.length)];
      e.baseSpeed *= mul;
      this.fx.lightningArc(fairy.x, fairy.y, e.x, e.y, '#bfe0ff');
      this.fx.floatText(e.x, e.y - e.r - 8, '⏩ +50% speed', '#bfe0ff');
    }

    /* Shadow Wizard reflection: the first tower type to hit her gets reflected —
       shut down every tower of that type on the board for 10 seconds. */
    fairyReflect(fairy, tower) {
      const type = tower.key;
      const dur = (fairy.def.reflect && fairy.def.reflect.shutdown) || 10;
      const affected = this.towers.filter(t => t.key === type);
      for (const t of affected) {
        t.shutDown(dur);
        this.fx.deathBurst(t.x, t.y, '#ff8ae0', false);
        this.fx.floatText(t.x, t.y - 24, 'SHUT DOWN', '#ffaaf0');
        this.fx.lightningArc(fairy.x, fairy.y, t.x, t.y, '#ff8ae0');
      }
      const name = TD.TOWERS[type] ? TD.TOWERS[type].name : type;
      this.fx.banner('✨ ' + name + ' towers reflected — offline ' + dur + 's! ✨', '#ff8ae0');
      this.ui.toast(affected.length + ' ' + name + ' tower' + (affected.length > 1 ? 's' : '') + ' shut down for ' + dur + 's');
      TD.AUDIO.play('magic');
      this.screenShake(4);
    }

    /* Mind-controlled towers turn traitor: instead of attacking, they HEAL the
       nearest enemy for the damage they would normally deal. */
    resolveMindControl(dt) {
      const mcs = this.towers.filter(t => t.mindControlled > 0 && !t.isSupport);
      if (!mcs.length) return;
      for (const mc of mcs) {
        let target = null, td = Infinity;
        for (const e of this.enemies) {
          if (e.dead || e.boss) continue; // a mind-controlled tower can't heal bosses
          const d = Math.hypot(e.x - mc.x, e.y - mc.y);
          if (d <= mc.range + e.r && d < td) { td = d; target = e; }
        }
        if (target) {
          mc.angle = Math.atan2(target.y - mc.y, target.x - mc.x);
          mc.muzzle = 0.6;
          const heal = mc.dps() * dt; // healing equals the damage it would have dealt
          target.hp = Math.min(target.maxHp, target.hp + heal);
          if (Math.random() < dt * 8) this.fx.lightningArc(mc.x, mc.y, target.x, target.y, '#b57bff');
        }
      }
    }

    /* Continuous range bonus for any tower sitting in a working Support's aura.
       Recomputed each frame, so the range ring is steady (no pulsing/jumping). */
    applyAuraRange() {
      for (const t of this.towers) t._auraRange = 0;
      for (const s of this.towers) {
        if (!s.isSupport || s.isFrozen || s.shutdown > 0 || s.burnedDown || s.repairing > 0) continue;
        const rb = s.pulseBuff().range, sr = s.range;
        if (!rb) continue;
        for (const t of this.towers) {
          if (t === s || t.isSupport) continue;
          if (Math.hypot(t.x - s.x, t.y - s.y) <= sr) t._auraRange = Math.max(t._auraRange, rb);
        }
      }
    }

    /* Support tower cleanse pulse: free nearby towers from Freeze, Mind Control,
       and Shutdown. (Caller guarantees the support itself isn't frozen.) */
    supportPulse(support) {
      const r = support.range;
      const buff = support.pulseBuff();        // magnitude scales with support level
      const special = support.level >= 3;       // Archer +1 arrow, Tesla wider chain
      const dur = 5;                            // buff lasts 5 seconds
      let cleansed = 0, buffed = 0;
      for (const t of this.towers) {
        if (t === support || t.isSupport) continue;
        if (Math.hypot(t.x - support.x, t.y - support.y) > r) continue;
        // cleanse
        if (t.isFrozen || t.mindControlled > 0 || t.shutdown > 0) {
          t.thaw(); t.mindControlled = 0; t.shutdown = 0; t.hp = t.maxHp;
          this.fx.frostBurst(t.x, t.y, 18);
          cleansed++;
        }
        // temporary buff
        t.applyPulseBuff(buff, special, dur);
        // lvl-3 pulse: 2x flamethrower recharge speed for 3s
        if (special) t.rechargeBoost = Math.max(t.rechargeBoost, 3);
        this.fx.spark(t.x, t.y, '#ffe08a');
        buffed++;
      }
      // slowly rebuild nearby burned-down towers (10%/pulse by default; supports too)
      // rebuild rate scales with support level: 5% / 10% / 15% per pulse
      const repairStep = (support.def.repairPerPulse != null ? support.def.repairPerPulse : 0.05) * support.level;
      for (const t of this.towers) {
        if (t === support || !t.burnedDown) continue;
        if (Math.hypot(t.x - support.x, t.y - support.y) > r) continue;
        t.repairProgress = Math.min(1, t.repairProgress + repairStep);
        this.fx.frostBurst(t.x, t.y, 14);
        if (t.repairProgress >= 0.999) { t.burnedDown = false; t.repairProgress = 0; t.hp = t.maxHp; this.fx.floatText(t.x, t.y - 22, '🔧 rebuilt', '#6ee7ff'); }
        else this.fx.floatText(t.x, t.y - 22, Math.round(t.repairProgress * 100) + '%', '#6ee7ff');
      }
      // breaks a nearby Paladin's shield for 3s (it becomes damageable by all towers
      // and its guard aura drops)
      for (const e of this.enemies) {
        if (!e.def.guardRadius || e.dead) continue;
        if (Math.hypot(e.x - support.x, e.y - support.y) <= r) {
          e.shieldDown = Math.max(e.shieldDown, 3);
          this.fx.frostBurst(e.x, e.y, 24);
          this.fx.floatText(e.x, e.y - e.r - 8, '🛡 Shield down!', '#ffe08a');
        }
      }
      // chance to flush nearby Arsonists out of stealth
      const revealChance = support.def.revealChance != null ? support.def.revealChance : 0.5;
      const revealDur = support.def.revealDuration != null ? support.def.revealDuration : 1;
      if (Math.random() < revealChance) {
        for (const e of this.enemies) {
          if (!e.def.arson || !e.stealthed) continue;
          if (Math.hypot(e.x - support.x, e.y - support.y) <= r) {
            e.revealTimer = Math.max(e.revealTimer, revealDur);
            this.fx.floatText(e.x, e.y - e.r - 8, '👁 Revealed!', '#ffd27a');
            this.fx.lightningArc(support.x, support.y, e.x, e.y, '#ffe08a');
          }
        }
      }
      this.fx.pulseRing(support.x, support.y, r, '#ffe08a');
      TD.AUDIO.play('upgrade');
      const msg = (cleansed ? '✦ cleanse ' + cleansed : '') + (buffed ? (cleansed ? ' · ' : '') + '⚡ buff ' + buffed : '');
      if (msg) this.fx.floatText(support.x, support.y - 22, msg, '#ffe08a');
    }

    /* Arsonist surfaces and sets fire to the nearest healthy tower in range. */
    arsonistIgnite(a) {
      const A = a.def.arson;
      let best = null, bd = Infinity;
      for (const t of this.towers) {
        if (t.burning > 0 || t.burnedDown || t.repairing > 0) continue;
        const d = Math.hypot(t.x - a.x, t.y - a.y);
        if (d <= A.burnRange && d < bd) { bd = d; best = t; }
      }
      if (!best) return;
      best.startBurning(A.burnTime);
      this.fx.lightningArc(a.x, a.y, best.x, best.y, '#ff7a2a');
      this.fx.floatText(best.x, best.y - 26, '🔥 BURNING', '#ff7a2a');
      this.screenShake(3);
      TD.AUDIO.play('explode');
    }

    /* When a burning tower finally collapses, the fire jumps to every tower
       TOUCHING it — including diagonally (corner contact) — and they burn too. */
    spreadFire(t) {
      const dur = t._burnDur || ((TD.ENEMIES.arsonist && TD.ENEMIES.arsonist.arson && TD.ENEMIES.arsonist.arson.burnTime) || 5);
      for (const o of this.towers) {
        if (o === t || o.burning > 0 || o.burnedDown || o.repairing > 0) continue;
        if (Math.abs(o.tc - t.tc) <= 1 && Math.abs(o.tr - t.tr) <= 1) {
          o.startBurning(dur);
          this.fx.lightningArc(t.x, t.y, o.x, o.y, '#ff7a2a');
          this.fx.floatText(o.x, o.y - 26, '🔥 caught fire!', '#ff7a2a');
        }
      }
    }

    /* Repair a burned-down tower (cost = an upgrade; rebuild takes 5s/level). */
    repairSelected() {
      const t = this.selectedTower; if (!t || !t.burnedDown) return;
      const cost = t.repairCost();
      if (!this.economy.spend(cost)) { this.ui.toast('Not enough gold'); TD.AUDIO.play('deny'); return; }
      t.beginRepair();
      TD.AUDIO.play('build');
      this.fx.floatText(t.x, t.y - 20, '🔧 Rebuilding ' + t.repairTime() + 's', '#6ee7ff');
      this.ui.refreshHUD(); this.ui.refreshTowerInfo();
    }

    /* Paladins shield every nearby mob from all damage while alive (refreshed each frame). */
    applyPaladinAuras() {
      for (const p of this.enemies) {
        if (p.dead || !p.def.guardRadius || p.shieldDown > 0) continue; // broken shield = no aura
        const cap = p.speed * (p.def.auraSpeedMul || 1.3); // fast mobs clamp to 1.3× the paladin
        for (const e of this.enemies) {
          if (e === p || e.dead || e.boss) continue; // bosses ignore the Paladin's guard aura
          if (Math.hypot(e.x - p.x, e.y - p.y) <= p.def.guardRadius) {
            e.paladinGuard = 0.2;
            e.auraSpeedTimer = 0.2; e.auraSpeedCap = cap;
          }
        }
      }
    }
    /* On a Paladin's death, heal nearby mobs to 100%. */
    paladinDeathHeal(p) {
      const R = p.def.guardRadius || 130;
      let healed = 0;
      for (const e of this.enemies) {
        if (e === p || e.dead || e.boss) continue; // bosses aren't healed by the Paladin's death
        if (Math.hypot(e.x - p.x, e.y - p.y) <= R && e.hp < e.maxHp) { e.hp = e.maxHp; healed++; }
      }
      this.fx.explosion(p.x, p.y, R, '#ffe08a');
      if (healed) this.fx.floatText(p.x, p.y - 28, '✚ full heal ×' + healed, '#7CFC00');
      this.screenShake(4);
    }

    /* On-death explosion buffs to nearby enemies (Ice / Dark / Shadow wizards). */
    triggerDeathEffect(enemy) {
      const de = TD.DEATH_EFFECTS[enemy.def.deathEffect];
      if (!de) return;
      const color = enemy.def.deathEffect === 'rally' ? '#c07bff'
        : enemy.def.deathEffect === 'frostward' ? '#8fb4ff' : '#bfe0ff';
      this.fx.explosion(enemy.x, enemy.y, de.radius, color);
      this.screenShake(5);
      for (const e of this.enemies) {
        if (e === enemy || e.dead) continue;
        if (Math.hypot(e.x - enemy.x, e.y - enemy.y) > de.radius) continue;
        if (de.invuln) e.applyInvuln(de.dur);
        if (de.speedMul) e.applySpeedBuff(de.speedMul, de.dur);
        if (de.dmgReduction) e.applyDmgReduction(de.dmgReduction, de.dur);
        if (enemy.def.deathEffect === 'blink') e.applyBlink(de.dur);
      }
    }

    onEnemyKilled(e, source) {
      this.economy.earn(e.reward);
      this.stats.kills++;
      if (e.boss) this.stats.bosses++;
      this.fx.floatText(e.x, e.y, '+' + Math.round(e.reward * this.economy.rewardMul) + 'g', '#ffcf4a');
      if (Math.random() < 0.5) TD.AUDIO.play('coin');
      this.ui.refreshHUD();
    }
    onEnemyLeaked(e) {
      const dmg = e.boss ? 5 : 1;
      const dead = this.economy.loseLife(dmg);
      this.stats.leaks++;
      this.leaksThisWave = (this.leaksThisWave || 0) + 1;
      TD.AUDIO.play('leak');
      this.fx.banner('-' + dmg + ' ❤', '#f0556a');
      this.screenShake(5);
      this.ui.refreshHUD();
      if (dead) this._gameOver();
    }

    /* ---------------- speed / pause ---------------- */
    setSpeed(s) { this.speed = s; }
    cycleSpeed() {
      const order = [1, 2, 3, 4, 5];
      this.speed = order[(order.indexOf(this.speed) + 1) % order.length];
      document.querySelectorAll('.spd-btn').forEach(x => x.classList.toggle('active', +x.dataset.speed === this.speed));
      this.ui.toast(this.speed + '× speed');
    }
    togglePause() {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.ui.showOverlay('Paused', 'Press Space to resume', '', [
          { label: 'Resume', primary: true, onClick: () => this.togglePause() },
          { label: 'Save & Menu', onClick: () => this.toMenu() },
        ]);
      } else if (this.state === 'paused') {
        this.state = 'playing';
        this.ui.hideOverlay();
      }
    }

    /* ---------------- restart current phase ---------------- */
    confirmRestartPhase() {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      const prev = this.state;
      this.state = 'paused';
      this.ui.showOverlay('Restart Phase ' + (this.phase || 1) + '?',
        'This resets the current phase — towers, gold and waves start over on a fresh map. Your phase progress is kept (you will NOT go back to Phase 1).', '',
        [{ label: 'Restart Phase', primary: true, onClick: () => this.restartPhase() },
         { label: 'Cancel', onClick: () => { this.ui.hideOverlay(); this.state = prev; } }]);
    }
    restartPhase() {
      this.ui.hideOverlay();
      if (this._bossMusic) { this._bossMusic = false; TD.AUDIO.bossMusic(false); }
      const pool = this.phase === 2 ? 'dual' : 'single';
      this._init(this.difficulty, TD.pickMap(pool)); // _init keeps this.phase
      if (this.phase === 2) this.economy.gold = 300;  // Phase 2 starts with 300g
      this._enterGame();
      TD.Save.save(this);
      this.ui.toast('Phase ' + (this.phase || 1) + ' restarted on ' + this.map.name);
    }

    screenShake(n) { this.fx.shake = Math.max(this.fx.shake, n); }

    /* ---------------- win / lose ---------------- */
    _gameOver() {
      this.state = 'over';
      TD.AUDIO.play('gameover');
      TD.Save.clear();
      this._recordGlobal();
      this.ui.showOverlay('Game Over', `You reached wave ${this.waves.wave}. ${this.stats.kills} enemies slain.`, 'lose', [
        { label: 'Try Again', primary: true, onClick: () => { this.ui.hideOverlay(); this.newGame(); } },
        { label: 'Menu', onClick: () => this.toMenu() },
      ]);
    }
    _win() {
      this._wonOnce = true;
      this.state = 'won';
      TD.AUDIO.play('victory');
      this._recordGlobal();
      TD.Save.clear();
      this.ui.showOverlay('Victory!', `You survived all 25 levels on ${TD.DIFFICULTY[this.difficulty].label}! Endless mode continues.`, 'win', [
        { label: 'Keep Playing (Endless)', primary: true, onClick: () => { this.ui.hideOverlay(); this.state = 'playing'; this.autoCountdown = TD.CONFIG.waveCountdown; } },
        { label: 'Menu', onClick: () => this.toMenu() },
      ]);
    }
    _recordGlobal() {
      const g = TD.Save.loadGlobalStats() || { bestWave: 0, totalKills: 0, games: 0, totalTime: 0 };
      g.bestWave = Math.max(g.bestWave, this.stats.highestWave);
      g.totalKills += this.stats.kills;
      g.games += 1;
      g.totalTime += this.stats.playTime;
      TD.Save.saveGlobalStats(g);
    }

    /* ---------------- main loop ---------------- */
    _loop(ts) {
      if (!this._lastTs) this._lastTs = ts;
      let dt = (ts - this._lastTs) / 1000;
      this._lastTs = ts;
      dt = Math.min(dt, 0.05); // clamp big frame gaps

      if (this.state === 'playing') {
        const steps = this.speed;       // run logic `speed` times per frame
        const sub = dt;
        for (let i = 0; i < steps; i++) this._update(sub);
      }
      if (this.renderer && (this.state === 'playing' || this.state === 'paused' || this.state === 'over' || this.state === 'won')) {
        this.renderer.render();
      }
      requestAnimationFrame(this._loop);
    }

    _update(dt) {
      this.time += dt;
      this.stats.playTime += dt;

      // boss music: play the fast theme whenever a boss is alive on the map
      const bossOut = this.enemies.some(e => e.boss && !e.dead);
      if (bossOut !== this._bossMusic) { this._bossMusic = bossOut; TD.AUDIO.bossMusic(bossOut); }

      // auto-start countdown between waves
      if (!this.waves.active && this.autoCountdown > 0) {
        this.autoCountdown -= dt;
        if (this.autoCountdown <= 0) this.startNextWave();
        this.ui.refreshHUD();
      }

      // (support buffs are now applied on-pulse with a 5s lifetime, decayed in Tower.update)

      this.waves.update(dt);

      if (this.guardian) this.guardian.update(dt);
      // paladin guard auras (set before towers fire so protected mobs absorb nothing)
      this.applyPaladinAuras();
      // steady support range aura (continuous, so range rings don't pulse/jump)
      this.applyAuraRange();

      // towers
      for (const t of this.towers) t.update(dt);
      this.resolveMindControl(dt);

      // enemies
      for (const e of this.enemies) e.update(dt);
      // handle leaks + removal
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.reachedExit) { this.onEnemyLeaked(e); this.enemies.splice(i, 1); }
        else if (e.dead) { this.enemies.splice(i, 1); }
      }

      // projectiles
      for (const p of this.projectiles) p.update(dt);
      this.projectiles = this.projectiles.filter(p => !p.dead);

      this.fx.update(dt);

      // autosave
      this._autosaveTimer += dt;
      if (this._autosaveTimer >= 30) { this._autosaveTimer = 0; if (this.state === 'playing') TD.Save.save(this); }

      // periodic stats refresh (cheap-ish; throttle)
      this._statTick = (this._statTick || 0) + dt;
      // expire a pending sell confirmation
      if (this._sellConfirmId) { this._sellConfirmTimer -= dt; if (this._sellConfirmTimer <= 0) { this._sellConfirmId = null; this.ui.refreshTowerInfo(); } }
      if (this._statTick > 0.4) { this._statTick = 0; this.ui.refreshStats(); this.ui.refreshWaveTally(); this.ui.refreshFireWarn(); if (this.selectedTower) this.ui.refreshTowerInfo(); }
    }

    /* responsive canvas sizing kept at native resolution; CSS scales it */
    _handleResize() { /* canvas uses fixed internal resolution; CSS handles scaling */ }
  }

  TD.Game = Game;
  // boot
  window.addEventListener('DOMContentLoaded', () => { TD.game = new Game(); });
})(window.TD);
