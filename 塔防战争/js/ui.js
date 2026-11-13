/* ============================================================
   ui.js — DOM HUD: top bar, toolbar, side panel, tooltips, toasts.
   ============================================================ */
(function (TD) {
  class UI {
    constructor(game) {
      this.game = game;
      this.el = {
        lives: document.getElementById('hudLives'),
        gold: document.getElementById('hudGold'),
        wave: document.getElementById('hudWave'),
        preview: document.getElementById('wavePreview'),
        toolbar: document.getElementById('toolbar'),
        towerInfo: document.getElementById('towerInfo'),
        defaultInfo: document.getElementById('defaultInfo'),
        statsCard: document.getElementById('statsCard'),
        startWave: document.getElementById('btnStartWave'),
        pause: document.getElementById('btnPause'),
        mute: document.getElementById('btnMute'),
        menu: document.getElementById('btnMenu'),
        full: document.getElementById('btnFull'),
        waveTally: document.getElementById('waveTally'),
        fireWarn: document.getElementById('fireWarn'),
        tooltip: document.getElementById('tooltip'),
        overlay: document.getElementById('overlayMsg'),
      };
      this._buildToolbar();
      this._bindButtons();
    }

    /* ---------- wave mob tally (above the map) ---------- */
    refreshWaveTally() {
      const g = this.game, el = this.el.waveTally;
      if (!el) return;
      // always keep the bar present (fixed height) so the map never shifts
      el.classList.remove('hidden');
      const idle = `<span class="wt-idle">${g.map.name} · Build phase — press Start Wave</span>`;
      if (!g.waves.active) { el.innerHTML = idle; return; }
      const rows = g.waves.tally(g);
      if (!rows.length) { el.innerHTML = idle; return; }
      el.innerHTML = `<span class="wt-title">${g.map.name} · Level ${g.waves.wave}/25</span>` + rows.map(r => {
        const def = TD.ENEMIES[r.type];
        const done = r.remaining === 0;
        return `<span class="wt-chip${done ? ' done' : ''}">
          <span class="chip" style="background:${def.color}"></span>${def.name}
          <b>${r.remaining}</b><span class="wt-sl">/${r.total}</span>
          <small>${r.onScreen} on screen</small></span>`;
      }).join('');
    }

    /* top-right fire warning: count burning + burned-down towers */
    refreshFireWarn() {
      const el = this.el.fireWarn;
      if (!el) return;
      let burning = 0, burned = 0;
      for (const t of this.game.towers) { if (t.burning > 0) burning++; else if (t.burnedDown) burned++; }
      const total = burning + burned;
      if (total === 0) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      const parts = [];
      if (burning) parts.push(burning + ' burning');
      if (burned) parts.push(burned + ' down');
      el.innerHTML = `<span class="fw-ico">🔥</span><b>${total}</b><small>${parts.join(' · ')}</small>`;
    }

    toggleFullscreen() {
      const d = document;
      if (!d.fullscreenElement && !d.webkitFullscreenElement) {
        const el = d.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
      } else {
        (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
      }
    }

    /* ---------- top bar ---------- */
    refreshHUD() {
      const g = this.game;
      this.el.lives.textContent = g.economy.lives;
      this.el.gold.textContent = Math.floor(g.economy.gold);
      this.el.wave.textContent = g.waves.wave;
      this.el.startWave.disabled = g.waves.active;
      this.el.startWave.textContent = g.waves.active ? 'Wave in progress'
        : g.autoCountdown > 0 ? `Start (${Math.ceil(g.autoCountdown)}s)` : 'Start Wave';
      this._refreshPreview();
      this.refreshToolbar();   // keep buy-button affordability in sync as gold changes
      this.refreshWaveTally();
    }

    _refreshPreview() {
      const g = this.game;
      const n = g.waves.wave + (g.waves.active ? 0 : 1);
      if (n < 1) { this.el.preview.innerHTML = ''; return; }
      const pv = g.waves.preview(n);
      let html = `<span class="wp-title">Next · Wave ${n}</span>`;
      for (const [type, count] of Object.entries(pv.counts)) {
        const def = TD.ENEMIES[type];
        html += `<span class="wp-enemy"><span class="chip" style="background:${def.color}"></span>${def.name} ×${count}</span>`;
      }
      html += `<span class="wp-enemy" style="color:#ffcf4a">⬤ ~${pv.reward}g</span>`;
      if (pv.boss) html += `<span class="boss-warn">⚠ BOSS</span>`;
      this.el.preview.innerHTML = html;
    }

    /* ---------- toolbar (tower buttons) ---------- */
    _buildToolbar() {
      this.el.toolbar.innerHTML = '';
      // always show towers in the order they unlock (tie-break: original order)
      const order = TD.TOWER_ORDER.slice().sort((a, b) =>
        (TD.TOWERS[a].unlock || 0) - (TD.TOWERS[b].unlock || 0)
        || TD.TOWER_ORDER.indexOf(a) - TD.TOWER_ORDER.indexOf(b));
      for (const key of order) {
        const def = TD.TOWERS[key];
        const btn = document.createElement('button');
        btn.className = 'tower-btn';
        btn.dataset.key = key;
        btn.innerHTML = `
          <span class="tb-key">${def.hotkey}</span>
          <div class="tb-top">
            <span class="tb-name">${def.name}</span>
          </div>
          <div class="tb-cost">⬤ ${def.cost}g</div>`;
        // render the tower's real sprite as the icon
        const icon = TD.makeTowerIcon ? TD.makeTowerIcon(key, 38) : null;
        if (icon) { icon.className = 'tb-icon'; btn.querySelector('.tb-top').prepend(icon); }
        else { const s = document.createElement('span'); s.className = 'tb-icon'; s.style.background = def.color; btn.querySelector('.tb-top').prepend(s); }
        btn.addEventListener('click', () => this.game.input.startPlacing(key));
        btn.addEventListener('mouseenter', (e) => this._towerTooltip(e, key));
        btn.addEventListener('mousemove', (e) => this._moveTooltip(e));
        btn.addEventListener('mouseleave', () => this.hideTooltip());
        this.el.toolbar.appendChild(btn);
      }
    }

    refreshToolbar() {
      const g = this.game;
      this.el.toolbar.querySelectorAll('.tower-btn').forEach(btn => {
        const key = btn.dataset.key, def = TD.TOWERS[key];
        const locked = g.waves.wave < def.unlock;
        const capped = g.atTowerCap(key);
        const cant = !g.economy.canAfford(def.cost) || capped;
        btn.classList.toggle('selected', g.input.placing === key);
        btn.classList.toggle('locked', locked);
        btn.classList.toggle('cant', cant && !locked);
        btn.classList.toggle('affordable', !cant && !locked);
        // show count/cap for capped tower types (e.g. Support 3/5)
        const cap = g.towerCap(key);
        let cnt = btn.querySelector('.tb-count');
        if (cap != null) {
          if (!cnt) { cnt = document.createElement('span'); cnt.className = 'tb-count'; btn.appendChild(cnt); }
          cnt.textContent = g.towerCount(key) + '/' + cap;
          cnt.style.color = capped ? 'var(--red)' : 'var(--muted)';
        } else if (cnt) cnt.remove();
        const lockEl = btn.querySelector('.tb-lock');
        if (locked && !lockEl) {
          const s = document.createElement('span'); s.className = 'tb-lock'; s.textContent = '🔒 W' + def.unlock;
          const k = btn.querySelector('.tb-key'); if (k) k.replaceWith(s);
        } else if (!locked && lockEl) {
          // unlocked now — restore the hotkey badge
          const k = document.createElement('span'); k.className = 'tb-key'; k.textContent = def.hotkey;
          lockEl.replaceWith(k);
        }
      });
    }

    /* ---------- side panel ---------- */
    refreshTowerInfo() {
      const t = this.game.selectedTower;
      if (!t) {
        this.el.towerInfo.classList.add('hidden');
        this.el.defaultInfo.classList.remove('hidden');
        this._tiSig = null;
        return;
      }
      this.el.defaultInfo.classList.add('hidden');
      this.el.towerInfo.classList.remove('hidden');

      // Only rebuild the panel (which destroys the buttons) when something the
      // user can see structurally changes. Otherwise update live values in place
      // so a timed refresh never eats an in-progress click on an upgrade button.
      const sig = t.id + '|' + t.level + '|' + t.evolution + '|' + t.targetMode + '|' + (t.mindControlled > 0) + '|' + t.burnedDown + '|' + (t.repairing > 0) + '|' + (this.game._sellConfirmId === t.id);
      if (sig === this._tiSig && this.el.towerInfo._tower === t) {
        this._updateTowerLive(t);
        return;
      }
      this._tiSig = sig;
      this.el.towerInfo._tower = t;
      this.el.towerInfo.innerHTML = TD.Upgrades.render(t, this.game);
      TD.Upgrades.bind(this.el.towerInfo, t, this.game);
    }

    /* Cheap in-place refresh that leaves the buttons (and their click
       handlers) intact — used between structural changes. */
    _updateTowerLive(t) {
      const p = this.el.towerInfo;
      p.querySelectorAll('[data-live]').forEach(el => {
        const k = el.dataset.live;
        if (k === 'kills') el.textContent = t.kills;
        else if (k === 'dmg') el.textContent = Math.round(t.damageDone).toLocaleString();
        else if (k === 'hp') el.textContent = Math.ceil(t.hp) + ' / ' + t.maxHp;
        else if (k === 'fuel') el.textContent = t.recharge > 0 ? 'refuel ' + Math.ceil(t.recharge) + 's' : Math.ceil(t.fuel) + 's';
        else if (k === 'repair') el.textContent = Math.ceil(t.repairing) + 's';
        else if (k === 'rebuild') el.textContent = Math.round(t.repairProgress * 100);
      });
      const upBtn = p.querySelector('[data-act="upgrade"]');
      if (upBtn) upBtn.disabled = !this.game.economy.canAfford(t.upgradeCost());
      const evCost = Math.round(t.upgradeCost() * 2.2);
      p.querySelectorAll('[data-act="evolve"]').forEach(b => { b.disabled = !this.game.economy.canAfford(evCost); });
    }

    refreshStats() {
      const s = this.game.stats, g = this.game;
      const row = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;
      const acc = s.shotsFired ? ((s.shotsHit / s.shotsFired) * 100).toFixed(0) + '%' : '—';
      this.el.statsCard.innerHTML = `<h3 style="font-size:.95rem">Statistics</h3>` +
        row('Enemies killed', s.kills) +
        row('Bosses defeated', s.bosses) +
        row('Gold earned', Math.round(g.economy.totalEarned).toLocaleString()) +
        row('Gold spent', Math.round(g.economy.totalSpent).toLocaleString()) +
        row('Towers built', s.towersBuilt) +
        row('Leaks', s.leaks) +
        row('Highest wave', s.highestWave) +
        row('Play time', this._fmtTime(s.playTime));
    }
    _fmtTime(sec) {
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    }

    /* ---------- tooltips ---------- */
    _towerTooltip(e, key) {
      const def = TD.TOWERS[key], b = def.base;
      let rows = '';
      const r = (k, v) => `<div class="t-stat"><span>${k}</span><b>${v}</b></div>`;
      if (def.slowGas) {
        rows += r('Damage', 'none');
        rows += r('Slow', (b.slow * 100).toFixed(0) + '% (cone)');
        rows += r('Range', b.range);
        rows += r('Freeze', (b.freezeChance * 100).toFixed(0) + '%/s · ' + b.freezeDur + 's');
        rows += r('Fuel', b.fuel + 's / refuel ' + b.rechargeTime + 's');
        rows += r('No effect on', 'bosses, wizards, Paladin');
      } else if (!def.isSupport) {
        if (def.cone) rows += r('Damage', b.damage + '/s (cone)');
        else rows += r('Damage', b.damage);
        if (!def.cone) rows += r('Fire rate', b.fireRate + '/s');
        rows += r('Range', b.range);
        if (b.splash) rows += r('Splash', b.splash);
        if (b.chain) rows += r('Chain', b.chain);
        if (b.burn) rows += r('Burn', b.burn.dps + ' dps');
        if (def.cannotFreeze) rows += r('Freeze-proof', '✓');
        rows += r('Anti-air', b.antiAir ? '✓' : '✗');
      } else {
        rows += r('Pulse range', b.range);
        rows += r('Pulse every', '20s → 10s (by lvl)');
        rows += r('Buff', '5s on pulse');
        rows += r('Cleanse', 'Freeze/MC/Shutdown');
      }
      const tt = this.el.tooltip;
      tt.innerHTML = `<h4>${def.name} · ${def.cost}g</h4>${rows}<div class="t-desc">${def.desc}</div>`;
      tt.classList.remove('hidden');
      this._moveTooltip(e);
    }
    _moveTooltip(e) {
      const tt = this.el.tooltip;
      let x = e.clientX + 14, y = e.clientY - 10;
      const w = tt.offsetWidth, h = tt.offsetHeight;
      if (x + w > window.innerWidth) x = e.clientX - w - 14;
      if (y + h > window.innerHeight) y = window.innerHeight - h - 8;
      tt.style.left = x + 'px'; tt.style.top = Math.max(8, y) + 'px';
    }
    onCanvasHover(p) {
      // show enemy/tower tooltip on canvas? Keep light: hide tower tooltips.
      if (!this.game.input.placing) {
        const c = Math.floor(p.x / TD.CONFIG.tileSize), r = Math.floor(p.y / TD.CONFIG.tileSize);
        const t = this.game.towerAt(c, r);
        this.game.hoverTower = t || null;
      }
    }
    hideTooltip() { this.el.tooltip.classList.add('hidden'); }

    /* ---------- toast ---------- */
    toast(msg) {
      const old = document.querySelector('.toast'); if (old) old.remove();
      const el = document.createElement('div');
      el.className = 'toast'; el.textContent = msg;
      document.getElementById('app').appendChild(el);
      setTimeout(() => el.remove(), 2200);
    }

    /* ---------- overlay (win/lose/pause) ---------- */
    showOverlay(title, sub, cls, buttons) {
      const ov = this.el.overlay;
      ov.className = 'overlay-msg ' + (cls || '');
      let btns = '';
      ov.innerHTML = `<h2>${title}</h2><p class="muted">${sub || ''}</p><div class="ov-btns" style="display:flex;gap:10px"></div>`;
      const box = ov.querySelector('.ov-btns');
      (buttons || []).forEach(b => {
        const el = document.createElement('button');
        el.className = 'btn ' + (b.primary ? 'btn-primary' : '');
        el.textContent = b.label;
        el.addEventListener('click', b.onClick);
        box.appendChild(el);
      });
      ov.classList.remove('hidden');
    }
    hideOverlay() { this.el.overlay.classList.add('hidden'); }

    /* ---------- buttons ---------- */
    _bindButtons() {
      this.el.startWave.addEventListener('click', () => this.game.startNextWave());
      this.el.pause.addEventListener('click', () => this.game.togglePause());
      this.el.mute.addEventListener('click', () => {
        const m = !TD.AUDIO.muted; TD.AUDIO.setMuted(m);
        this.el.mute.textContent = m ? '🔇' : '🔊';
      });
      this.el.menu.addEventListener('click', () => this.game.toMenu());
      if (this.el.full) this.el.full.addEventListener('click', () => this.toggleFullscreen());
      const help = document.getElementById('btnHelp');
      if (help) help.addEventListener('click', () => { if (TD.Guide) TD.Guide.showCompendium(this.game); });
      const restart = document.getElementById('btnRestart');
      if (restart) restart.addEventListener('click', () => this.game.confirmRestartPhase());
      document.querySelectorAll('.spd-btn').forEach(b => {
        b.addEventListener('click', () => {
          this.game.setSpeed(parseInt(b.dataset.speed, 10));
          document.querySelectorAll('.spd-btn').forEach(x => x.classList.toggle('active', x === b));
        });
      });
    }
    refreshAll() { this.refreshHUD(); this.refreshToolbar(); this.refreshTowerInfo(); this.refreshStats(); }
  }

  TD.UI = UI;
})(window.TD);
