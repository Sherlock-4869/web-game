/* ============================================================
   save.js — localStorage persistence + autosave.
   ============================================================ */
(function (TD) {
  const KEY = 'td_save_v1';
  const STATS_KEY = 'td_stats_v1';

  const Save = {
    has() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } },

    save(game) {
      try {
        const data = {
          difficulty: game.difficulty,
          phase: game.phase || 1,
          mapSel: game.mapSel || { pool: 'single', index: 0 },
          economy: game.economy.serialize(),
          wave: game.waves.wave,
          towers: game.towers.map(t => t.serialize()),
          stats: game.stats,
          speed: game.speed,
          ts: Date.now(),
        };
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (e) { return false; }
    },

    load() {
      try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; }
      catch (e) { return null; }
    },

    clear() { try { localStorage.removeItem(KEY); } catch (e) {} },

    /* persistent lifetime stats (across games) */
    loadGlobalStats() {
      try { const s = localStorage.getItem(STATS_KEY); return s ? JSON.parse(s) : null; }
      catch (e) { return null; }
    },
    saveGlobalStats(stats) {
      try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
    },
  };

  TD.Save = Save;
})(window.TD);
