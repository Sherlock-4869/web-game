/* ============================================================
   guide.js — first-time, in-game assistant. When a new wave brings
   towers or mobs the player hasn't seen, a card-by-card popup walks
   them through each one with a picture, a description, and combat tips.
   Remembers what's been seen; "Don't show again" disables it.
   ============================================================ */
(function (TD) {
  const KEY = 'td_guide_v1';

  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  /* ---- content: short blurb + combat tip for every tower and mob ---- */
  TD.GUIDE = {
    towers: {
      archer:       { blurb: 'Cheap, fast single-target arrows — your bread-and-butter early defense. Can hit flyers.',
                      tip: 'Build several early and upgrade for range & crit. Flat damage is weak against heavily armored mobs.' },
      cannon:       { blurb: 'Lobs explosive shells that splash on impact, hitting everything in a small blast.',
                      tip: 'Great against tight groups and armored mobs. Slow to fire — pair with faster towers. Cannot hit flyers.' },
      magic:        { blurb: 'An arcane orb whose upgrades branch into ice (slows) or lightning (chains between mobs).',
                      tip: 'Damage ignores armor, so it is reliable all game. Lightning shreds swarms; ice buys you time.' },
      flamethrower: { blurb: 'Short-range cone of fire that sets enemies ablaze for damage over time.',
                      tip: 'Place at choke points where mobs bunch up. Runs on fuel that recharges, so it pulses on and off.' },
      tesla:        { blurb: 'An electric coil that arcs lightning to several nearby enemies at once.',
                      tip: 'Excellent against swarms and fast Runners. Short range — keep it right on the path.' },
      laser:        { blurb: 'A continuous beam that ramps up damage the longer it stays locked on one target.',
                      tip: 'Your best boss and tank killer. Keep it focused on a single big target; expensive to build.' },
      ice:          { blurb: 'Sprays freezing gas in a cone, slowing (and sometimes freezing) everything it touches.',
                      tip: 'Does little damage itself — pair it with damage towers. Slows even armored mobs and bosses.' },
      support:      { blurb: 'Buffs nearby towers (damage, range, fire rate). Has no attack of its own.',
                      tip: 'Surround it with your strongest towers to multiply their output. Its count is capped, so place it well.' },
    },
    enemies: {
      normal:   { blurb: 'A basic foot soldier with balanced speed and health.',
                  tip: 'Any tower handles these — do not overspend to kill them.' },
      fast:     { blurb: 'Quick and fragile, it sprints for the exit.',
                  tip: 'Tesla and clustered Archers shine here. An Ice slow helps your towers land hits.' },
      tank:     { blurb: 'Very slow but soaks an enormous amount of damage.',
                  tip: 'Focus fire with Cannon and Laser. Ice slows it to buy extra shots.' },
      armored:  { blurb: 'Heavy plate armor absorbs a chunk of every hit.',
                  tip: 'Armor cuts flat damage, so favor Magic, Cannon splash, or Laser. Plain Archers struggle.' },
      flying:   { blurb: 'A winged beast that flies straight over your path.',
                  tip: 'Most towers can target air — but Cannons cannot. Keep Archers/Magic/Tesla/Laser covering the lane.' },
      splitter: { blurb: 'A gel blob that bursts into two fast little Spawn when it dies.',
                  tip: 'Use splash (Cannon) so you clear it and the Spawn together before they swarm the exit.' },
      splitterling: { blurb: 'A small, fast blob left behind when a Splitter dies.',
                  tip: 'Cheap to kill — Tesla and splash mop them up in one pass.' },
      healer:   { blurb: 'A cleric that steadily heals nearby enemies.',
                  tip: 'Kill it first, or burst the whole group with Laser/Cannon before it out-heals your damage.' },
      shielded: { blurb: 'Carries an energy shield that absorbs damage before its health is touched.',
                  tip: 'Break the shield with sustained fire (Laser/Tesla) — single slow shots waste the overkill.' },
      wizard:   { blurb: 'Ice Wizard: stops to freeze one of your towers, and the freeze CHAINS through every tower touching it for the rest of the wave. Explodes on death, shielding nearby mobs.',
                  tip: 'Space towers apart so a freeze cannot chain across your line. Kill it fast, away from clusters.' },
      darkwizard:{ blurb: 'Dark Wizard: mind-controls one of your towers for 10s — the corrupted tower HEALS enemies. Its death blast briefly makes nearby mobs invulnerable.',
                  tip: 'Kill it before it reaches your towers, and hold fire during the post-death invulnerability window.' },
      fairy:    { blurb: 'Red Wizard: shuts down the first tower TYPE that hits it (re-arming every 5s) and hastes random mobs. Death grants enemies blink-teleport.',
                  tip: 'Vary your damage types so one shutdown does not cripple you. The Guardian reveals it if it hides.' },
      arsonist: { blurb: 'Invisible until it surfaces to burn your towers down, knocking them offline until repaired.',
                  tip: 'Use the Guardian to reveal it, then focus it down. Keep a Support nearby to rebuild burned towers.' },
      boss:     { blurb: 'A massive boss with huge health and armor.',
                  tip: 'Save Guardian abilities and let a Laser ramp up. Ice slows even bosses.' },
      miniboss: { blurb: "Has tiny hands but a 'HUGE' ego! Terrible boss with no real abilities, mediocre at best.",
                  tip: 'Concentrate your damage; do not let it tank shots from scattered towers.' },
      eliteboss:{ blurb: 'A Warlord boss that regenerates health over time.',
                  tip: 'You must out-damage its regen — burst it down with Laser + Cannon and Guardian lightning.' },
      paladin:  { blurb: 'A mounted boss immune to ALL damage except Archers and Cannons. While alive it protects nearby mobs; if it survives, those mobs heal to full.',
                  tip: 'Line its route with Archers and Cannons — nothing else can scratch it.' },
    },
  };

  const Guide = {
    state: null,
    el: null,
    cards: [],
    idx: 0,
    onClose: null,
    prevState: null,

    init() {
      // only the "don't show again" choice persists; the seen-set is per-playthrough
      // (in memory) so the walkthrough shows again every new game / reload.
      const saved = loadState();
      this.state = { dismissed: !!saved.dismissed, towers: {}, enemies: {} };
    },
    // persist ONLY the dismissed flag
    _persist() { saveState({ dismissed: !!this.state.dismissed }); },
    isDismissed() { if (!this.state) this.init(); return !!this.state.dismissed; },

    /* clear the per-playthrough seen-set (called when a new game starts) */
    newSession() { if (!this.state) this.init(); this.state.towers = {}; this.state.enemies = {}; },

    /* fully reset, including the persisted dismissed flag */
    reset() { this.state = { dismissed: false, towers: {}, enemies: {} }; this._persist(); },

    /* which towers/mobs are newly relevant for wave n and not yet seen */
    newItems(game, n) {
      if (!this.state) this.init();
      const towers = [];
      for (const k of TD.TOWER_ORDER) {
        const d = TD.TOWERS[k];
        if (d && (d.unlock || 0) <= n && !this.state.towers[k]) towers.push(k);
      }
      const enemies = [];
      const addE = (t) => { if (TD.ENEMIES[t] && !this.state.enemies[t] && enemies.indexOf(t) < 0) enemies.push(t); };
      const def = game.waves.waveDef(n);
      if (def && def.groups) for (const g of def.groups) addE(g.type);
      for (const b of game.waves.scheduledBosses(n)) addE(b);
      for (const t in TD.SPAWN) { const s = TD.SPAWN[t]; if (s && n >= s.startWave) addE(t); }
      if (enemies.indexOf('splitter') >= 0) addE('splitterling');
      return { towers, enemies };
    },

    /* a tower's Lv-10 evolution branches: [{name, desc}, ...] */
    _evolveLines(key) {
      const d = TD.TOWERS[key];
      if (!d || !d.evolve) return [];
      return Object.keys(d.evolve).map(k => ({ name: d.evolve[k].name, desc: d.evolve[k].desc }));
    },
    _evolveHTML(key) {
      const evos = this._evolveLines(key);
      if (!evos.length) return '';
      return `<div class="guide-evolve"><span class="guide-tip-label">★ Upgrade paths (evolve at Lv 10)</span>
        <div class="guide-evolve-list">${evos.map(e => `<div class="evo-row"><b>${e.name}</b> — ${e.desc}</div>`).join('')}</div></div>`;
    },

    _buildCards(items) {
      const cards = [];
      for (const k of items.towers) {
        const d = TD.TOWERS[k], g = TD.GUIDE.towers[k] || {};
        cards.push({ kind: 'tower', key: k, name: d.name, color: d.color,
          blurb: g.blurb || '', tip: g.tip || '' });
      }
      for (const k of items.enemies) {
        const d = TD.ENEMIES[k], g = TD.GUIDE.enemies[k] || {};
        cards.push({ kind: 'enemy', key: k, name: d.name, color: d.color,
          blurb: g.blurb || '', tip: g.tip || '', boss: !!d.boss });
      }
      return cards;
    },

    /* main entry: show the walkthrough if there's anything new. returns true if shown */
    maybeShow(game, n) {
      if (!this.state) this.init();
      if (this.isDismissed()) return false;
      const items = this.newItems(game, n);
      const cards = this._buildCards(items);
      if (!cards.length) return false;
      this._items = items;
      this._show(game, cards);
      return true;
    },

    _markSeen() {
      for (const k of (this._items ? this._items.towers : [])) this.state.towers[k] = true;
      for (const k of (this._items ? this._items.enemies : [])) this.state.enemies[k] = true;
      this._persist();
    },

    _ensureDom() {
      if (this.el) return;
      const wrap = document.createElement('div');
      wrap.id = 'guideModal';
      wrap.className = 'guide-modal hidden';
      wrap.innerHTML = `
        <div class="guide-box">
          <div class="guide-head">
            <span class="guide-title">New Arrivals</span>
            <span class="guide-progress"></span>
          </div>
          <div class="guide-card">
            <div class="guide-art"><div class="guide-icon"></div><span class="guide-tag"></span></div>
            <div class="guide-body">
              <h3 class="guide-name"></h3>
              <p class="guide-blurb"></p>
              <div class="guide-tip"><span class="guide-tip-label">⚔ How to deal with it</span><p class="guide-tip-text"></p></div>
              <div class="guide-evolve hidden"><span class="guide-tip-label">★ Upgrade paths</span><div class="guide-evolve-list"></div></div>
            </div>
          </div>
          <div class="guide-foot">
            <label class="guide-skip"><input type="checkbox" class="guide-skip-cb"/> Don't show me this again</label>
            <div class="guide-nav">
              <button class="btn btn-small guide-prev">‹ Back</button>
              <button class="btn btn-small btn-primary guide-next">Next ›</button>
            </div>
          </div>
        </div>`;
      document.getElementById('app').appendChild(wrap);
      this.el = wrap;
      this.q = (s) => wrap.querySelector(s);
      this.q('.guide-prev').addEventListener('click', () => this._go(-1));
      this.q('.guide-next').addEventListener('click', () => this._go(1));
      this.q('.guide-skip-cb').addEventListener('change', (e) => {
        this.state.dismissed = e.target.checked; this._persist();
      });
    },

    _show(game, cards) {
      this._ensureDom();
      this.game = game; this.cards = cards; this.idx = 0;
      this.prevState = game.state;
      if (game.state === 'playing') game.state = 'paused';
      this.el.classList.remove('hidden');
      this.q('.guide-skip-cb').checked = !!this.state.dismissed;
      this._render();
    },

    _go(d) {
      if (d > 0 && this.idx >= this.cards.length - 1) return this._close();
      this.idx = Math.max(0, Math.min(this.cards.length - 1, this.idx + d));
      this._render();
    },

    _render() {
      const c = this.cards[this.idx];
      this.q('.guide-title').textContent = c.kind === 'tower' ? 'New Tower Available' : (c.boss ? 'Boss Incoming' : 'New Enemy');
      this.q('.guide-progress').textContent = (this.idx + 1) + ' / ' + this.cards.length;
      this.q('.guide-name').textContent = c.name;
      this.q('.guide-blurb').textContent = c.blurb;
      this.q('.guide-tip-label').textContent = c.kind === 'tower' ? '🛠 How to use it' : '⚔ How to deal with it';
      this.q('.guide-tip-text').textContent = c.tip;
      // upgrade / evolution paths (towers only)
      const evoWrap = this.q('.guide-evolve');
      const evos = c.kind === 'tower' ? this._evolveLines(c.key) : [];
      if (evos.length) {
        evoWrap.classList.remove('hidden');
        this.q('.guide-evolve-list').innerHTML = evos.map(e => `<div class="evo-row"><b>${e.name}</b> — ${e.desc}</div>`).join('');
      } else evoWrap.classList.add('hidden');
      const tag = this.q('.guide-tag');
      tag.textContent = c.kind === 'tower' ? 'TOWER' : (c.boss ? 'BOSS' : 'ENEMY');
      tag.style.background = c.color;
      // sprite icon
      const iconHost = this.q('.guide-icon');
      iconHost.innerHTML = '';
      const cv = c.kind === 'tower'
        ? (TD.makeTowerIcon && TD.makeTowerIcon(c.key, 96))
        : (TD.makeEnemyIcon && TD.makeEnemyIcon(c.key, 96));
      if (cv) iconHost.appendChild(cv);
      // nav button states
      this.q('.guide-prev').disabled = this.idx === 0;
      this.q('.guide-next').textContent = this.idx >= this.cards.length - 1 ? 'Got it ✓' : 'Next ›';
    },

    /* ---- full compendium: every tower & enemy on one scrollable page ---- */
    _ensureCompendium() {
      if (this.cEl) return;
      const wrap = document.createElement('div');
      wrap.id = 'compendium';
      wrap.className = 'guide-modal hidden';
      wrap.innerHTML = `
        <div class="comp-box">
          <div class="comp-head">
            <span class="guide-title">Field Guide</span>
            <button class="btn btn-small comp-close">Close ✕</button>
          </div>
          <div class="comp-scroll">
            <h4 class="comp-section">Towers</h4>
            <div class="comp-grid comp-towers"></div>
            <h4 class="comp-section">Enemies</h4>
            <div class="comp-grid comp-enemies"></div>
            <h4 class="comp-section">Bosses</h4>
            <div class="comp-grid comp-bosses"></div>
          </div>
        </div>`;
      document.getElementById('app').appendChild(wrap);
      this.cEl = wrap;
      const close = () => this._closeCompendium();
      wrap.querySelector('.comp-close').addEventListener('click', close);
      wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    },

    _compCard(kind, key) {
      const d = (kind === 'tower' ? TD.TOWERS : TD.ENEMIES)[key];
      const g = (kind === 'tower' ? TD.GUIDE.towers : TD.GUIDE.enemies)[key] || {};
      const card = document.createElement('div');
      card.className = 'comp-card';
      const cv = kind === 'tower'
        ? (TD.makeTowerIcon && TD.makeTowerIcon(key, 64))
        : (TD.makeEnemyIcon && TD.makeEnemyIcon(key, 64));
      const art = document.createElement('div');
      art.className = 'comp-icon guide-icon';
      if (cv) art.appendChild(cv);
      card.appendChild(art);
      const body = document.createElement('div');
      body.className = 'comp-card-body';
      const tipLabel = kind === 'tower' ? '🛠 How to use it' : '⚔ How to deal with it';
      body.innerHTML = `<h5>${d.name}</h5><p class="comp-blurb"></p>
        <div class="guide-tip"><span class="guide-tip-label">${tipLabel}</span><p class="guide-tip-text"></p></div>
        ${kind === 'tower' ? this._evolveHTML(key) : ''}`;
      body.querySelector('.comp-blurb').textContent = g.blurb || '';
      body.querySelector('.guide-tip-text').textContent = g.tip || '';
      card.appendChild(body);
      return card;
    },

    showCompendium(game) {
      this._ensureCompendium();
      this.cGame = game;
      this.cPrevState = game.state;
      if (game.state === 'playing') game.state = 'paused';
      const tg = this.cEl.querySelector('.comp-towers');
      const eg = this.cEl.querySelector('.comp-enemies');
      const bg = this.cEl.querySelector('.comp-bosses');
      tg.innerHTML = ''; eg.innerHTML = ''; bg.innerHTML = '';
      for (const k of TD.TOWER_ORDER) if (TD.TOWERS[k]) tg.appendChild(this._compCard('tower', k));
      const enemyOrder = ['normal', 'fast', 'tank', 'armored', 'flying', 'splitter', 'splitterling',
        'healer', 'shielded', 'wizard', 'darkwizard', 'fairy', 'arsonist'];
      const bossOrder = ['miniboss', 'boss', 'eliteboss', 'paladin'];
      for (const k of enemyOrder) if (TD.ENEMIES[k]) eg.appendChild(this._compCard('enemy', k));
      for (const k of bossOrder) if (TD.ENEMIES[k]) bg.appendChild(this._compCard('enemy', k));
      this.cEl.classList.remove('hidden');
    },

    _closeCompendium() {
      if (!this.cEl) return;
      this.cEl.classList.add('hidden');
      if (this.cGame && this.cPrevState && this.cGame.state === 'paused') this.cGame.state = this.cPrevState;
    },

    _close() {
      this._markSeen();
      this.el.classList.add('hidden');
      if (this.game && this.prevState && this.game.state === 'paused') this.game.state = this.prevState;
      this.cards = [];
    },
  };

  TD.Guide = Guide;
})(window.TD);
