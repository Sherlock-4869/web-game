/* ============================================================
   settings.js — player-tunable game values + the setup editor.

   Settings are stored per difficulty. Each difficulty holds an editable
   snapshot of every tower, mob, spawn rule and difficulty multiplier (seeded
   from TD.BASE). Settings.apply(difficulty) rewrites the live TD.* config from
   the chosen difficulty's snapshot before a game starts.
   ============================================================ */
(function (TD) {
  const KEY = 'td_settings_v3';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  /* overlay `over` onto a fresh copy of `base` so new config fields always survive */
  function deepMerge(base, over) {
    if (!over || typeof over !== 'object') return base;
    for (const k of Object.keys(over)) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') deepMerge(base[k], over[k]);
      else base[k] = over[k];
    }
    return base;
  }

  /* attribute key -> friendly description (shown in the ⓘ tooltip) */
  const DESC = {
    damage: 'Damage per hit (per second for beams & flamethrowers).',
    range: 'Targeting / effect radius in pixels (40px = 1 tile).',
    fireRate: 'Shots per second.',
    crit: 'Critical-hit chance (0–1). Crits deal double damage.',
    splash: 'Area-of-effect blast radius in pixels.',
    projSpeed: 'Projectile travel speed.',
    coneAngle: 'Half-angle of the flame cone (radians).',
    fuel: 'Seconds of continuous fire before it must refuel.',
    rechargeTime: 'Seconds to refuel after running dry.',
    chain: 'Number of chain-lightning jumps.',
    rampMax: 'Max beam damage ramp multiplier.',
    rampRate: 'How fast the beam ramps up.',
    pulse: 'Seconds between support pulses (base).',
    cost: 'Gold to build this tower.',
    unlock: 'Wave this tower becomes buildable.',
    maxLevel: 'Maximum upgrade level.',
    growth: 'Per-level upgrade-cost growth factor.',
    hp: 'Hit points (before per-wave scaling).',
    speed: 'Movement speed (pixels/second).',
    armor: 'Flat physical damage reduction. Magic & poison ignore it.',
    reward: 'Gold dropped when killed.',
    r: 'Body radius / size in pixels.',
    shield: 'Fraction of HP absorbed as a shield before health.',
    regen: 'HP regenerated per second.',
    castRange: 'Range to pick a target tower.',
    burnRange: 'Range within which it ignites towers.',
    cooldown: 'Seconds between casts.',
    pause: 'Seconds the caster stops moving while casting.',
    duration: 'Effect duration in seconds.',
    shutdown: 'Seconds affected towers stay shut down.',
    reset: 'Seconds before the reflect re-arms.',
    mul: 'Multiplier (1.5 = +50%).',
    stealth: 'Seconds invisible between surfacing.',
    stealthMin: 'Shortest time invisible before resurfacing.',
    stealthMax: 'Longest time invisible before resurfacing.',
    active: 'Seconds it stays surfaced (it burns one tower, then re-stealths).',
    igniteEvery: 'Seconds between igniting towers.',
    burnTime: 'Seconds for a tower to burn down (then the fire spreads to neighbours).',
    amount: 'Healing applied each pulse.',
    every: 'Seconds between heals.',
    radius: 'Effect radius in pixels.',
    guardRadius: 'Radius of the protection / heal aura.',
    auraSpeedMul: 'Faster mobs are slowed to this × the Paladin’s speed inside its aura (so they linger, then pull ahead).',
    count: 'Number produced.',
    startWave: 'First wave this can appear.',
    chance: 'Per-wave spawn chance (0–1).',
    min: 'Fewest spawned at once.',
    max: 'Most spawned at once.',
    gold: 'Starting gold.',
    lives: 'Starting lives.',
    hpMul: 'Global enemy HP multiplier.',
    spdMul: 'Global enemy speed multiplier.',
    rewardMul: 'Global gold-reward multiplier.',
    dps: 'Damage per second (damage-over-time).',
    dur: 'Duration in seconds.',
    slow: 'Ice gas slow strength (0–0.85 fraction of speed removed).',
    slowDur: 'Seconds the slow debuff lingers after leaving the gas.',
    freezeChance: 'Per-second chance (0–1) the ice gas freezes a target solid.',
    freezeDur: 'Seconds a target stays frozen in place.',
    base: 'Base value.',
    buffDamage: 'Support pulse: bonus damage fraction.',
    buffFireRate: 'Support pulse: bonus fire-rate fraction.',
    buffRange: 'Support pulse: bonus range fraction.',
    buffCrit: 'Support pulse: bonus crit fraction.',
    maxCount: 'Most of this tower you can have on the board at once.',
    maxCountP2: 'Build cap that applies only on Phase 2 (dual-entrance) maps. Blank = unlimited there.',
    revealChance: 'Chance each Support pulse flushes nearby Arsonists out of stealth (0–1).',
    revealDuration: 'Seconds a revealed Arsonist stays visible.',
    repairPerPulse: 'Rebuild per pulse PER support level (0.05 = 5%/10%/15% at L1/L2/L3).',
    miniboss: 'Wave the Mini-Boss appears on (0 = never).',
    miniboss1: 'Wave the first Mini-Boss appears on.',
    miniboss2: 'Wave the second Mini-Boss appears on.',
    boss: 'Wave the Boss appears on (0 = never).',
    eliteboss: 'Wave the Warlord (elite boss) appears on (0 = never).',
    chargeTime: 'Seconds for the Guardian to charge / recharge.',
    slowAmount: 'Guardian snow ❄: permanent slow fraction (0.5 = 50%).',
    lightningDamage: 'Guardian lightning ⚡: HP removed from each mob.',
    freezeDuration: 'Guardian ice 🧊: seconds all mobs are frozen in place.',
    revealDuration: 'Seconds any Guardian ability reveals stealthed mobs.',
  };

  const SKIP_TOWER = ['key', 'name', 'color', 'barrel', 'hotkey', 'desc', 'dmgType', 'projectile', 'defaultTarget', 'isSupport', 'cone', 'cannotFreeze', 'evolve'];
  const SKIP_ENEMY = ['key', 'name', 'color'];

  /* collect numeric leaves (dotted paths) from an object, skipping listed keys */
  function leaves(obj, skip, prefix) {
    const out = [];
    for (const k of Object.keys(obj)) {
      if (skip.indexOf(k) >= 0) continue;
      const v = obj[k];
      const path = prefix ? prefix + '.' + k : k;
      if (typeof v === 'number') out.push({ path, key: k, value: v });
      else if (v && typeof v === 'object' && !Array.isArray(v)) out.push.apply(out, leaves(v, skip, path));
    }
    return out;
  }
  function setLeaf(obj, path, value) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }
  function getLeaf(obj, path) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function pretty(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  }

  const Settings = {
    _all: null,
    _drafts: {},   // in-session working copies per difficulty
    DESC, leaves, pretty, setLeaf,

    loadAll() {
      if (this._all) return this._all;
      try { this._all = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { this._all = {}; }
      return this._all;
    },
    saveAll() { try { localStorage.setItem(KEY, JSON.stringify(this._all)); } catch (e) {} },
    has(diff) { return !!this.loadAll()[diff]; },
    hasAny() { return Object.keys(this.loadAll()).length > 0; },

    defaultsFor(diff) {
      return {
        difficulty: clone(TD.BASE.difficulty[diff]),
        towers: clone(TD.BASE.towers),
        enemies: clone(TD.BASE.enemies),
        spawn: clone(TD.BASE.spawn),
        bossWaves: clone(TD.BASE.bossWaves),
        guardian: clone(TD.BASE.guardian),
      };
    },
    /* saved snapshot merged over current defaults (so new fields always appear) */
    get(diff) { const all = this.loadAll(); return all[diff] ? deepMerge(this.defaultsFor(diff), all[diff]) : this.defaultsFor(diff); },
    /* the live in-session draft (edited but maybe unsaved) */
    draft(diff) { if (!this._drafts[diff]) this._drafts[diff] = this.get(diff); return this._drafts[diff]; },
    saveDraft(diff) { this.loadAll()[diff] = clone(this._drafts[diff]); this.saveAll(); },
    resetDraft(diff) { delete this.loadAll()[diff]; this.saveAll(); this._drafts[diff] = this.defaultsFor(diff); },

    /* rewrite the live config from a difficulty's settings (called before a game) */
    apply(diff) {
      const snap = this.get(diff);
      TD.TOWERS = clone(snap.towers);
      TD.ENEMIES = clone(snap.enemies);
      // Identity / non-editable fields (name, color, …) always come from the live
      // defaults, so renames & cosmetic edits in config.js take effect even when an
      // older saved custom-settings snapshot exists in localStorage.
      for (const k in TD.TOWERS) if (TD.BASE.towers[k]) for (const f of SKIP_TOWER) if (f in TD.BASE.towers[k]) TD.TOWERS[k][f] = clone(TD.BASE.towers[k][f]);
      for (const k in TD.ENEMIES) if (TD.BASE.enemies[k]) for (const f of SKIP_ENEMY) if (f in TD.BASE.enemies[k]) TD.ENEMIES[k][f] = clone(TD.BASE.enemies[k][f]);
      TD.SPAWN = clone(snap.spawn);
      // Boss schedule was restructured (25-level game); always use the live config
      // so older saved snapshots can't reintroduce the old wave numbers.
      TD.BOSSWAVES = clone(TD.BASE.bossWaves);
      if (snap.guardian) TD.GUARDIAN = clone(snap.guardian);
      TD.DIFFICULTY[diff] = clone(snap.difficulty);
    },
  };

  /* ---------------- editor UI ---------------- */
  Settings.buildUI = function (container, onBack) {
    const self = this;
    let active = 'normal';

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const fieldRow = (fullpath, key, value) => {
      const d = DESC[key] || 'Tunable value.';
      const isInt = ['hp', 'cost', 'unlock', 'maxLevel', 'reward', 'r', 'armor', 'startWave', 'min', 'max', 'lives', 'gold', 'chain'].indexOf(key) >= 0;
      return `<label class="set-field">
        <span class="set-key">${pretty(key)}<span class="info" data-tip="${esc(d)}">i</span></span>
        <input type="number" step="${isInt ? '1' : 'any'}" value="${value}" data-path="${fullpath}">
      </label>`;
    };
    const card = (title, color, fieldsHtml) =>
      `<div class="set-card"><div class="set-card-h">${color ? `<span class="chip" style="background:${color}"></span>` : ''}${title}</div><div class="set-fields">${fieldsHtml}</div></div>`;

    const tabsEl = document.getElementById('setTabs');

    function render() {
      const draft = self.draft(active);
      const diffs = Object.keys(TD.DIFFICULTY);
      let html = '';

      // difficulty (mode) tabs live in the header
      if (tabsEl) {
        tabsEl.innerHTML = diffs.map(d =>
          `<button class="set-tab ${d === active ? 'active' : ''}" data-diff="${d}">${TD.DIFFICULTY[d].label}${self.has(d) ? ' ●' : ''}</button>`).join('');
      }
      html += `<p class="set-note">Editing <b>${TD.DIFFICULTY[active].label}</b> · type any value, then Save. Hover the <span class="info" data-tip="Hover any of these for a description of the value.">i</span> for help. A blank field resets to its default on Save.</p>`;

      // difficulty multipliers
      html += `<h3 class="set-h">Difficulty</h3><div class="set-grid">`;
      html += card('Run settings', '', leaves(draft.difficulty, ['label']).map(f => fieldRow('difficulty.' + f.path, f.key, f.value)).join(''));
      html += `</div>`;

      // towers
      html += `<h3 class="set-h">Towers</h3><div class="set-grid">`;
      for (const key of TD.TOWER_ORDER) {
        const t = draft.towers[key]; if (!t) continue;
        html += card(t.name, t.color, leaves(t, SKIP_TOWER).map(f => fieldRow('towers.' + key + '.' + f.path, f.key, f.value)).join(''));
      }
      html += `</div>`;

      // mobs
      html += `<h3 class="set-h">Mobs</h3><div class="set-grid">`;
      for (const key of Object.keys(draft.enemies)) {
        const e = draft.enemies[key];
        html += card(e.name, e.color, leaves(e, SKIP_ENEMY).map(f => fieldRow('enemies.' + key + '.' + f.path, f.key, f.value)).join(''));
      }
      html += `</div>`;

      // spawn rules
      html += `<h3 class="set-h">Special spawns (when & how many)</h3><div class="set-grid">`;
      for (const key of Object.keys(draft.spawn)) {
        const name = (draft.enemies[key] && draft.enemies[key].name) || key;
        const color = draft.enemies[key] && draft.enemies[key].color;
        html += card(name, color, leaves(draft.spawn[key], []).map(f => fieldRow('spawn.' + key + '.' + f.path, f.key, f.value)).join(''));
      }
      html += `</div>`;

      // guardian power
      if (draft.guardian) {
        html += `<h3 class="set-h">Guardian power</h3><div class="set-grid">`;
        html += card('Guardian', '#7fe6ff', leaves(draft.guardian, []).map(f => fieldRow('guardian.' + f.path, f.key, f.value)).join(''));
        html += `</div>`;
      }

      // boss schedule (which wave each boss appears, per phase)
      if (draft.bossWaves) {
        html += `<h3 class="set-h">Boss schedule (which wave, per phase)</h3><div class="set-grid">`;
        const titles = { phase1: 'Boss levels (1–25)', phase2: 'Boss levels (unused)' };
        for (const ph of Object.keys(draft.bossWaves)) {
          html += card(titles[ph] || ph, '#ff6b6b', leaves(draft.bossWaves[ph], []).map(f => fieldRow('bossWaves.' + ph + '.' + f.path, f.key, f.value)).join(''));
        }
        html += `</div>`;
      }

      html += `<div class="set-actions">
        <button class="btn btn-primary" id="setSave">Save ${TD.DIFFICULTY[active].label}</button>
        <button class="btn" id="setReset">Reset to defaults</button>
        <button class="btn" id="setBack">← Back</button>
      </div>`;

      container.innerHTML = html;

      if (tabsEl) tabsEl.querySelectorAll('.set-tab').forEach(b => b.addEventListener('click', () => { active = b.dataset.diff; render(); container.scrollTop = 0; }));
      container.querySelector('#setSave').addEventListener('click', () => {
        // any blank field reverts to its default value before saving
        const def = self.defaultsFor(active);
        container.querySelectorAll('input[data-path]').forEach(inp => {
          if (inp.value.trim() === '' || isNaN(parseFloat(inp.value))) setLeaf(self.draft(active), inp.dataset.path, getLeaf(def, inp.dataset.path));
        });
        self.saveDraft(active); render();
        self._toast && self._toast('Saved ' + TD.DIFFICULTY[active].label + ' settings (blanks reset to default)');
      });
      container.querySelector('#setReset').addEventListener('click', () => { self.resetDraft(active); render(); });
      container.querySelector('#setBack').addEventListener('click', () => onBack && onBack());
    }

    // live input handling (delegated) — blanks are left for Save to reset
    container.addEventListener('input', (ev) => {
      const inp = ev.target;
      if (!inp.dataset || !inp.dataset.path) return;
      const v = parseFloat(inp.value);
      if (isNaN(v)) return;
      setLeaf(self.draft(active), inp.dataset.path, v);
    });

    // custom hover tooltip for the ⓘ help circles (native title doesn't render reliably).
    // Lives on <body> so it survives the container's innerHTML re-renders.
    let tip = document.getElementById('setTipEl');
    if (!tip) { tip = document.createElement('div'); tip.id = 'setTipEl'; tip.className = 'set-tip hidden'; document.body.appendChild(tip); }
    const placeTip = (e) => {
      let x = e.clientX + 14, y = e.clientY + 16;
      const w = tip.offsetWidth || 220, h = tip.offsetHeight || 40;
      if (x + w > window.innerWidth) x = e.clientX - w - 14;
      if (y + h > window.innerHeight) y = e.clientY - h - 14;
      tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
    };
    if (!container._tipBound) {
      container._tipBound = true;
      container.addEventListener('mouseover', (e) => {
        const inf = e.target.closest && e.target.closest('.info');
        if (inf && inf.dataset.tip) { tip.textContent = inf.dataset.tip; tip.classList.remove('hidden'); placeTip(e); }
      });
      container.addEventListener('mousemove', (e) => { if (!tip.classList.contains('hidden')) placeTip(e); });
      container.addEventListener('mouseout', (e) => {
        const inf = e.target.closest && e.target.closest('.info');
        if (inf) tip.classList.add('hidden');
      });
    }

    render();
  };

  TD.Settings = Settings;
})(window.TD);
