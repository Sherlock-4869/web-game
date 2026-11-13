/* ============================================================
   map.js — map data + grid/path builder.
   Tiles: 0 = grass (buildable), 1 = path, 4 = blocked decor.
   A map is { name, paths: [ [ [col,row], ... ], ... ], decor: [[col,row],...] }.
   Each path is a list of tile waypoints; enemies walk one path from its first
   waypoint (entrance, usually off-screen) to its last (exit). Dual maps share a
   common exit tail across two entrance paths.
   ============================================================ */
(function (TD) {
  const TS = TD.CONFIG.tileSize;

  TD.MAPS = {
    // Phase 1 — one entrance, one exit
    single: [
      { name: 'Crossroads', guardian: [13, 9],
        decor: [[2, 14], [20, 1], [29, 2], [13, 16], [25, 1], [1, 9], [30, 9]],
        paths: [[[-1, 3], [4, 3], [4, 8], [10, 8], [10, 2], [16, 2], [16, 12], [7, 12], [7, 15], [22, 15], [22, 5], [27, 5], [27, 14], [32, 14]]] },
      { name: 'Switchback', guardian: [13, 8],
        decor: [[1, 1], [30, 1], [1, 16], [30, 16], [5, 8]],
        paths: [[[-1, 9], [3, 9], [3, 3], [7, 3], [7, 13], [11, 13], [11, 3], [15, 3], [15, 13], [19, 13], [19, 3], [23, 3], [23, 13], [27, 13], [27, 6], [32, 6]]] },
      { name: 'Serpentine', guardian: [16, 9],
        decor: [[10, 5], [20, 10], [16, 15], [26, 9]],
        paths: [[[-1, 2], [28, 2], [28, 7], [4, 7], [4, 12], [28, 12], [28, 16], [32, 16]]] },
      { name: 'Labyrinth', guardian: [29, 5],
        decor: [[1, 1], [30, 1], [1, 16], [16, 5], [23, 11]],
        paths: [[[-1, 2], [5, 2], [5, 6], [2, 6], [2, 10], [8, 10], [8, 14], [14, 14], [14, 8], [20, 8], [20, 2], [26, 2], [26, 15], [32, 15]]] },
      { name: 'Zigzag Valley', guardian: [3, 3],
        decor: [[2, 15], [29, 2], [16, 8], [9, 13]],
        paths: [[[-1, 8], [6, 8], [6, 2], [12, 2], [12, 15], [18, 15], [18, 2], [24, 2], [24, 15], [30, 15], [30, 8], [32, 8]]] },
      { name: 'Cascade', guardian: [12, 8],
        decor: [[1, 16], [30, 1], [6, 14], [24, 9]],
        paths: [[[-1, 1], [9, 1], [9, 6], [3, 6], [3, 11], [15, 11], [15, 3], [21, 3], [21, 16], [27, 16], [27, 7], [32, 7]]] },
      { name: 'Gauntlet', guardian: [30, 5],
        decor: [[1, 8], [31, 1], [12, 16], [10, 6]],
        paths: [[[6, -1], [6, 4], [14, 4], [14, 9], [6, 9], [6, 14], [20, 14], [20, 2], [26, 2], [26, 12], [18, 12], [18, 16], [32, 16]]] },
      { name: 'Hairpins', guardian: [16, 3],
        decor: [[1, 1], [31, 16], [7, 12], [21, 4]],
        paths: [[[-1, 15], [4, 15], [4, 8], [9, 8], [9, 15], [14, 15], [14, 8], [19, 8], [19, 15], [24, 15], [24, 8], [29, 8], [29, 2], [32, 2]]] },
    ],
    // Phase 2 — two entrances, one exit
    dual: [
      { name: 'Confluence', guardian: [14, 4],
        decor: [[3, 9], [28, 3], [28, 15], [15, 6]],
        paths: [
          [[-1, 3], [8, 3], [8, 9], [20, 9], [32, 9]],
          [[-1, 15], [8, 15], [8, 9], [20, 9], [32, 9]] ] },
      { name: 'Pincer', guardian: [20, 8],
        decor: [[6, 4], [6, 12], [22, 4], [22, 12]],
        paths: [
          [[-1, 2], [14, 2], [14, 8], [32, 8]],
          [[-1, 14], [14, 14], [14, 8], [32, 8]] ] },
      { name: 'Crossfall', guardian: [20, 13],
        decor: [[6, 4], [24, 13], [20, 4]],
        paths: [
          [[-1, 9], [26, 9], [32, 9]],
          [[13, -1], [13, 9], [26, 9], [32, 9]] ] },
    ],
  };

  TD.pickMap = function (pool) {
    const list = TD.MAPS[pool] || TD.MAPS.single;
    const index = Math.floor(Math.random() * list.length);
    return { pool, index, def: list[index] };
  };
  TD.getMap = function (pool, index) {
    const list = TD.MAPS[pool] || TD.MAPS.single;
    return list[index] || list[0];
  };

  class GameMap {
    constructor(mapDef) {
      this.cols = TD.CONFIG.cols;
      this.rows = TD.CONFIG.rows;
      this.ts = TS;
      this.def = mapDef || TD.MAPS.single[0];
      this.name = this.def.name || 'Map';
      this.grid = [];
      this.paths = [];          // pixel-space waypoint arrays (one per entrance)
      this.spawns = [];         // first waypoint of each path
      this._build();
      // backward-compat aliases
      this.waypoints = this.paths[0];
      this.spawn = this.spawns[0];
      this.exit = this.paths[0][this.paths[0].length - 1];
    }

    _build() {
      for (let r = 0; r < this.rows; r++) {
        this.grid[r] = [];
        for (let c = 0; c < this.cols; c++) this.grid[r][c] = 0;
      }
      // carve each path and build its pixel waypoints
      for (const wps of this.def.paths) {
        for (let i = 0; i < wps.length - 1; i++) this._carve(wps[i], wps[i + 1]);
        this.paths.push(wps.map(([c, r]) => ({ x: (c + 0.5) * TS, y: (r + 0.5) * TS })));
      }
      this.spawns = this.paths.map(p => p[0]);

      // guardian: auto-place on the grass tile FARTHEST from any path, so its big
      // clickable ability icons never overlap the path or interfere with play.
      {
        const pathTiles = [];
        for (let r = 0; r < this.rows; r++)
          for (let c = 0; c < this.cols; c++) if (this.grid[r][c] === 1) pathTiles.push([c, r]);
        let best = null, bestScore = -Infinity;
        // keep row >= 3 so the ability icons (drawn ~50px above) stay on-screen
        for (let r = 3; r < this.rows - 1; r++) {
          for (let c = 1; c < this.cols - 1; c++) {
            if (this.grid[r][c] !== 0) continue;
            let dmin = Infinity;
            for (const [pc, pr] of pathTiles) { const d = Math.hypot(c - pc, r - pr); if (d < dmin) dmin = d; }
            const score = dmin - Math.abs(r - this.rows / 2) * 0.05; // tie-break toward center height
            if (score > bestScore) { bestScore = score; best = [c, r]; }
          }
        }
        if (!best) best = this.def.guardian || [16, 9];
        const [gc, gr] = best;
        this.guardianTile = { c: gc, r: gr };
        this.guardianPos = this.tileCenter(gc, gr);
        if (this.inBounds(gc, gr)) this.grid[gr][gc] = 4;
      }

      // scatter decorative blocked tiles on remaining grass
      for (const [c, r] of (this.def.decor || []))
        if (this.inBounds(c, r) && this.grid[r][c] === 0) this.grid[r][c] = 4;
    }

    _carve(a, b) {
      const dc = Math.sign(b[0] - a[0]), dr = Math.sign(b[1] - a[1]);
      let c = a[0], r = a[1];
      this._mark(c, r);
      while (c !== b[0] || r !== b[1]) {
        if (c !== b[0]) c += dc; else if (r !== b[1]) r += dr;
        this._mark(c, r);
      }
    }
    _mark(c, r) { if (this.inBounds(c, r)) this.grid[r][c] = 1; }
    inBounds(c, r) { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }

    tileAt(px, py) { return { c: Math.floor(px / TS), r: Math.floor(py / TS) }; }
    tileCenter(c, r) { return { x: (c + 0.5) * TS, y: (r + 0.5) * TS }; }

    isBuildable(c, r, towers) {
      if (!this.inBounds(c, r)) return false;
      if (this.grid[r][c] !== 0) return false;
      for (const t of towers) if (t.tc === c && t.tr === r) return false;
      return true;
    }

    serialize() { return {}; }
  }

  TD.GameMap = GameMap;
})(window.TD);
