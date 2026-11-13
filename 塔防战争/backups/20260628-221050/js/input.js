/* ============================================================
   input.js — mouse + keyboard. Placement, selection, hotkeys.
   ============================================================ */
(function (TD) {
  const TS = TD.CONFIG.tileSize;

  class Input {
    constructor(game, canvas) {
      this.game = game;
      this.canvas = canvas;
      this.placing = null;     // tower key being placed
      this.hoverTile = null;   // {c,r}
      this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
      this._bind();
    }

    _toCanvas(ev) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = this.canvas.width / rect.width;
      const sy = this.canvas.height / rect.height;
      const cx = ('touches' in ev && ev.touches[0]) ? ev.touches[0].clientX : ev.clientX;
      const cy = ('touches' in ev && ev.touches[0]) ? ev.touches[0].clientY : ev.clientY;
      return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy, sx: cx, sy: cy };
    }

    _bind() {
      const cv = this.canvas;
      cv.addEventListener('mousemove', (e) => {
        const p = this._toCanvas(e);
        this.mouse = p;
        this.hoverTile = { c: Math.floor(p.x / TS), r: Math.floor(p.y / TS) };
        this.game.ui.onCanvasHover(p);
      });
      cv.addEventListener('mouseleave', () => { this.hoverTile = null; this.game.ui.hideTooltip(); });
      cv.addEventListener('click', (e) => {
        const p = this._toCanvas(e);
        this._handleClick(p, e.shiftKey); // hold Shift to keep placing the same tower
      });
      cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.cancel(); this.game.selectTower(null); });

      // touch support (tap to place / select)
      cv.addEventListener('touchstart', (e) => {
        const p = this._toCanvas(e);
        this.mouse = p; this.hoverTile = { c: Math.floor(p.x / TS), r: Math.floor(p.y / TS) };
      }, { passive: true });
      cv.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (this.hoverTile) this._handleClick(this.mouse);
      });

      window.addEventListener('keydown', (e) => this._key(e));
    }

    _handleClick(p, keepPlacing) {
      TD.AUDIO.resume();
      if (this.game.state !== 'playing') return;
      // guardian ability symbols take priority when ready
      if (!this.placing && this.game.guardian && this.game.guardian.handleClick(p.x, p.y)) return;
      const c = Math.floor(p.x / TS), r = Math.floor(p.y / TS);

      if (this.placing) {
        const key = this.placing;
        if (this.game.tryBuild(key, c, r)) {
          // hold Shift to keep placing more of the same tower; otherwise stop
          if (keepPlacing && !this.game.atTowerCap(key) && this.game.economy.canAfford(TD.TOWERS[key].cost)) {
            this.placing = key; // stay in placement mode
            this.game.ui.refreshToolbar();
          } else {
            this.cancel();
          }
        } else {
          TD.AUDIO.play('deny');
          this.game.ui.toast('Cannot build there');
        }
        return;
      }
      // selecting an existing tower
      const tower = this.game.towerAt(c, r);
      this.game.selectTower(tower || null);
    }

    startPlacing(key) {
      const def = TD.TOWERS[key];
      if (this.game.waves.wave < def.unlock) { this.game.ui.toast(def.name + ' unlocks at wave ' + def.unlock); TD.AUDIO.play('deny'); return; }
      if (this.game.atTowerCap(key)) { this.game.ui.toast('Max ' + this.game.towerCap(key) + ' ' + def.name + ' towers'); TD.AUDIO.play('deny'); return; }
      if (!this.game.economy.canAfford(def.cost)) { this.game.ui.toast('Not enough gold'); TD.AUDIO.play('deny'); return; }
      this.placing = key;
      this.game.selectTower(null);
      this.game.ui.refreshToolbar();
    }
    cancel() { if (this.placing) { this.placing = null; this.game.ui.refreshToolbar(); } }

    _key(e) {
      if (this.game.state === 'menu') return;
      switch (e.key) {
        case ' ': e.preventDefault(); this.game.togglePause(); break;
        case 'Escape': this.cancel(); this.game.selectTower(null); break;
        case 'f': case 'F': this.game.cycleSpeed(); break;
        case 'p': case 'P': this.game.togglePause(); break;
        case 'u': case 'U': if (this.game.selectedTower) this.game.upgradeSelected(); break;
        case 'Delete': case 'Backspace': if (this.game.selectedTower) this.game.sellSelected(); break;
      }
      // tower hotkeys 1-9
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const key = TD.TOWER_ORDER[idx];
        if (key) this.startPlacing(key);
      }
    }
  }

  TD.Input = Input;
})(window.TD);
