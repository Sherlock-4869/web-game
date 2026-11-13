/* ============================================================
   wave.js — wave manager: scaling, spawning, previews.
   ============================================================ */
(function (TD) {
  class WaveManager {
    constructor(game) {
      this.game = game;
      this.wave = 0;           // current wave number (0 = not started)
      this.active = false;     // enemies currently spawning/alive
      this.spawnQueue = [];    // pending spawns: {type, at}
      this.timer = 0;          // elapsed time within wave
      this.spawnedAll = false;
    }

    /* difficulty + wave-based scaling factors. */
    scaling(n) {
      const d = TD.DIFFICULTY[this.game.difficulty];
      // gradual until ~wave 20, steeper after
      const hpGrowth = 1 + (n - 1) * 0.14 + Math.pow(Math.max(0, n - 20), 1.7) * 0.02;
      const spdGrowth = 1 + Math.min(0.6, (n - 1) * 0.015);
      return {
        hpMul: d.hpMul * hpGrowth,
        spdMul: d.spdMul * spdGrowth,
        rewardMul: d.rewardMul * (1 + (n - 1) * 0.05),
        armorAdd: Math.floor(n / 8),
      };
    }

    waveDef(n) {
      if (n <= TD.WAVES.length) return TD.WAVES[n - 1];
      return TD.buildProceduralWave(n);
    }

    /* Boss types scheduled for wave n in the current phase (editable TD.BOSSWAVES).
       Schedule keys name the boss (trailing digits ignored); values are wave numbers. */
    scheduledBosses(n) {
      const sched = (TD.BOSSWAVES && TD.BOSSWAVES['phase' + (this.game.phase || 1)]) || {};
      const out = [];
      for (const key in sched) if (sched[key] === n) out.push(key.replace(/\d+$/, ''));
      return out;
    }

    /* Build a flat preview summary for the NEXT wave. */
    preview(n) {
      const def = this.waveDef(n);
      const counts = {};
      let boss = false;
      for (const g of def.groups) counts[g.type] = (counts[g.type] || 0) + g.count;
      for (const type of this.scheduledBosses(n)) { counts[type] = (counts[type] || 0) + 1; boss = true; }
      const sc = this.scaling(n);
      let reward = 0;
      for (const type in counts) reward += (TD.ENEMIES[type] ? TD.ENEMIES[type].reward : 0) * counts[type] * sc.rewardMul;
      return { wave: n, counts, boss, reward: Math.round(reward) };
    }

    start(n) {
      this.wave = n;
      this.active = true;
      this.spawnedAll = false;
      this.timer = 0;
      this.spawnQueue = [];
      const def = this.waveDef(n);
      let groupDelay = 0;
      for (const g of def.groups) {
        const start = groupDelay + (g.delay || 0);
        for (let i = 0; i < g.count; i++) {
          this.spawnQueue.push({ type: g.type, at: start + i * (g.spacing || 0.6) });
        }
        groupDelay = start + g.count * (g.spacing || 0.6);
      }
      // scheduled bosses (TD.BOSSWAVES) — spawn near the start of the wave
      const bossTypes = this.scheduledBosses(n);
      const bossThisWave = bossTypes.length > 0;
      for (const type of bossTypes) this.spawnQueue.push({ type, at: 1 + Math.random() });
      // Data-driven special spawns (editable in the setup page via TD.SPAWN).
      const banners = {
        wizard:     ['❄', 'Ice Wizard', '#8fb4ff'],
        darkwizard: ['☠', 'Dark Wizard', '#a04bff'],
        fairy:      ['🔴', 'Red Wizard', '#ff6b6b'],
        arsonist:   ['🔥', 'Arsonist', '#ff7a2a'],
        paladin:    ['🛡', 'Paladin', '#ffe08a'],
      };
      const last0 = this.spawnQueue.length ? this.spawnQueue[this.spawnQueue.length - 1].at : 8;
      const span = Math.max(3, last0);
      for (const type of Object.keys(TD.SPAWN)) {
        const s = TD.SPAWN[type];
        if (!s || n < s.startWave) continue;
        // the Paladin (a boss) must never share a wave with a scheduled boss
        if (type === 'paladin' && bossThisWave) continue;
        if (Math.random() >= s.chance) continue;
        const count = (s.min || 1) + Math.floor(Math.random() * ((s.max || 1) - (s.min || 1) + 1));
        for (let i = 0; i < count; i++) this.spawnQueue.push({ type, at: Math.random() * span });
        const b = banners[type] || ['✦', TD.ENEMIES[type] ? TD.ENEMIES[type].name : type, '#fff'];
        this.game.fx.banner(b[0] + ' ' + (count > 1 ? count + ' ' + b[1] + 's' : 'A ' + b[1]) + ' approach' + (count > 1 ? '' : 'es') + '…', b[2]);
      }
      this.spawnQueue.sort((a, b) => a.at - b.at);
      this._scaling = this.scaling(n);
      // tally of how many of each type this wave brings
      this.totals = {};
      for (const s of this.spawnQueue) this.totals[s.type] = (this.totals[s.type] || 0) + 1;
      if (bossThisWave) {
        TD.AUDIO.play('bosswarn');
        const nm = TD.ENEMIES[bossTypes[0]] ? TD.ENEMIES[bossTypes[0]].name : 'Boss';
        this.game.fx.banner('⚠ ' + nm.toUpperCase() + ' INCOMING ⚠', '#ff6b6b');
      } else this.game.fx.banner('Wave ' + n, '#6ee7ff');
      TD.AUDIO.play('wavestart');
    }

    /* Per-type tally for the on-screen wave bar: total this wave, how many remain
       in play (alive + not yet spawned), and how many are currently on screen. */
    tally(game) {
      const pend = {}, alive = {};
      for (const s of this.spawnQueue) pend[s.type] = (pend[s.type] || 0) + 1;
      for (const e of game.enemies) if (!e.dead) alive[e.type] = (alive[e.type] || 0) + 1;
      const rows = [];
      for (const type of Object.keys(this.totals || {})) {
        const a = alive[type] || 0, p = pend[type] || 0;
        rows.push({ type, total: this.totals[type], onScreen: a, remaining: a + p });
      }
      return rows;
    }

    update(dt) {
      if (!this.active) return;
      this.timer += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.timer) {
        const s = this.spawnQueue.shift();
        this.game.spawnEnemy(s.type, this._scaling);
      }
      if (!this.spawnQueue.length) this.spawnedAll = true;
      // wave ends when everything spawned and no enemies remain
      if (this.spawnedAll && this.game.enemies.length === 0) {
        this.active = false;
        this.game.onWaveCleared(this.wave);
      }
    }

    serialize() { return { wave: this.wave }; }
  }

  TD.WaveManager = WaveManager;
})(window.TD);
