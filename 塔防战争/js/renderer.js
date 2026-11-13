/* ============================================================
   renderer.js — all canvas drawing.
   ============================================================ */
(function (TD) {
  const TS = TD.CONFIG.tileSize;

  class Renderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.realCtx = canvas.getContext('2d');
      this.ctx = this.realCtx;
      this.game = game;
      this.W = canvas.width; this.H = canvas.height;
      this._pathCache = null;
      // ---- 8-bit pixelation buffer ----
      // The whole scene is drawn into this low-res offscreen canvas, then
      // upscaled with nearest-neighbor so every shape becomes chunky pixels.
      this.pixelScale = 1;
      this.buf = document.createElement('canvas');
      this.bufCtx = this.buf.getContext('2d');
      this._sizeBuffer();
    }

    _sizeBuffer() {
      this.W = this.canvas.width; this.H = this.canvas.height;
      const bw = Math.max(1, Math.round(this.W / this.pixelScale));
      const bh = Math.max(1, Math.round(this.H / this.pixelScale));
      if (this.buf.width !== bw || this.buf.height !== bh) {
        this.buf.width = bw; this.buf.height = bh;
      }
    }

    render() {
      // (1) redirect all drawing into the low-res buffer
      this._sizeBuffer();
      const bw = this.buf.width, bh = this.buf.height;
      this.ctx = this.bufCtx;
      const ctx = this.ctx, fx = this.game.fx;
      // reset + clear the buffer, then scale so full-res draw coords map in
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, bw, bh);
      ctx.setTransform(bw / this.W, 0, 0, bh / this.H, 0, 0);
      ctx.save();
      // screen shake
      if (fx.shake > 0.2) {
        const s = fx.shake;
        ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }
      ctx.clearRect(-20, -20, this.W + 40, this.H + 40);
      this._drawMap();
      this._drawGuardian();
      this._drawRangePreview();
      this._drawTowers();
      this._drawEnemies();
      this._drawProjectiles();
      this._drawBeams();
      this._drawCones();
      this._drawEffects();
      this._drawPlacement();
      ctx.restore();
      this._drawBossSpeech();
      this._drawBanners();

      // (2) upscale the low-res buffer onto the visible canvas with hard pixels
      this.ctx = this.realCtx;
      const real = this.realCtx;
      real.setTransform(1, 0, 0, 1, 0, 0);
      real.imageSmoothingEnabled = false;
      real.clearRect(0, 0, this.W, this.H);
      real.drawImage(this.buf, 0, 0, this.buf.width, this.buf.height, 0, 0, this.W, this.H);
    }

    /* ---------- map ---------- */
    _drawMap() {
      const ctx = this.ctx, map = this.game.map;
      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          const t = map.grid[r][c];
          const x = c * TS, y = r * TS;
          if (t === 1) {
            ctx.fillStyle = (c + r) % 2 ? '#3a3326' : '#403a2c';
          } else if (t === 4) {
            ctx.fillStyle = (c + r) % 2 ? '#16202f' : '#192536';
          } else {
            ctx.fillStyle = (c + r) % 2 ? '#15301f' : '#173823';
          }
          ctx.fillRect(x, y, TS, TS);
          // subtle grid lines on grass
          if (t === 0) { ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1); }
          if (t === 4) { ctx.fillStyle = '#26344a'; ctx.beginPath(); ctx.arc(x + TS/2, y + TS/2, 9, 0, 7); ctx.fill(); }
        }
      }
      // path border glow (each entrance path)
      this._drawPathLine();
      // an entrance marker per path + the shared exit marker
      for (const p of map.paths) this._marker(p[0].x + 14, p[0].y, '#4ade80', '▶');
      const ex = map.exit;
      this._marker(ex.x - 14, ex.y, '#f0556a', '✖');
    }

    _drawPathLine() {
      const ctx = this.ctx, paths = this.game.map.paths;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const wp of paths) {
        ctx.strokeStyle = 'rgba(255,210,90,0.12)'; ctx.lineWidth = TS - 6;
        ctx.beginPath(); ctx.moveTo(wp[0].x, wp[0].y);
        for (let i = 1; i < wp.length; i++) ctx.lineTo(wp[i].x, wp[i].y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
        ctx.beginPath(); ctx.moveTo(wp[0].x, wp[0].y);
        for (let i = 1; i < wp.length; i++) ctx.lineTo(wp[i].x, wp[i].y);
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }

    /* the player-controlled map guardian: animated totem + charge ring + symbols */
    _drawGuardian() {
      const g = this.game.guardian; if (!g) return;
      const ctx = this.ctx, time = this.game.time, r = 23;
      const prog = g.progress();
      ctx.save();
      ctx.translate(g.x, g.y);

      // ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(2, 8, r * 0.9, r * 0.4, 0, 0, 7); ctx.fill();

      // charge ring (track + filled arc)
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(0, 0, r + 7, 0, 7); ctx.stroke();
      const col = g.ready ? '#aef' : '#6ee7ff';
      ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = g.ready ? 12 : 6;
      ctx.beginPath(); ctx.arc(0, 0, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); ctx.stroke();
      ctx.shadowBlur = 0;

      // floating totem body (bobbing crystal)
      const bob = Math.sin(time * 2) * 2;
      ctx.translate(0, bob);
      const bodyGlow = g.ready ? (0.6 + 0.4 * Math.sin(time * 6)) : 0.5;
      let gr = ctx.createRadialGradient(-4, -6, 1, 0, 0, r);
      gr.addColorStop(0, '#eaffff'); gr.addColorStop(0.5, g.ready ? '#7fe6ff' : '#4aa6c8'); gr.addColorStop(1, '#15384a');
      ctx.fillStyle = gr;
      // diamond crystal
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, -r * 0.1); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, -r * 0.1); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      // glowing rune eye
      ctx.globalAlpha = bodyGlow; ctx.fillStyle = '#fff'; ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(0, -r * 0.15, 3, 0, 7); ctx.fill();
      ctx.restore();

      // activation flash
      if (g.flash > 0) {
        ctx.save(); ctx.globalAlpha = g.flash; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(g.x, g.y, r + 14 + (1 - g.flash) * 30, 0, 7); ctx.stroke(); ctx.restore();
      }

      // ready: three clickable ability symbols above its head
      if (g.ready) {
        for (const s of g.symbols()) {
          const sb = Math.sin(time * 4 + s.x) * 2;
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = 'rgba(8,12,20,0.85)'; ctx.strokeStyle = s.color; ctx.lineWidth = 2;
          ctx.shadowColor = s.color; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(s.x, s.y + sb, 17, 0, 7); ctx.fill(); ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(s.icon, s.x, s.y + sb + 1);
          ctx.restore();
        }
        // "READY" label
        ctx.save();
        ctx.fillStyle = '#aef'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
        ctx.shadowColor = '#6ee7ff'; ctx.shadowBlur = 6;
        ctx.fillText('GUARDIAN READY', g.x, g.y + r + 18);
        ctx.restore();
      }
    }

    _marker(x, y, color, sym) {
      const ctx = this.ctx;
      ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = 0.9;
      ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sym, x, y); ctx.restore();
    }

    /* ---------- range preview for selected / hovered tower ---------- */
    _drawRangePreview() {
      const t = this.game.selectedTower;
      if (!t) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(110,231,255,0.08)';
      ctx.strokeStyle = 'rgba(110,231,255,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, 7); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    /* small rounded-rect helper (with fallback if ctx.roundRect is unavailable) */
    _rrect(ctx, x, y, w, h, r) {
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    /* ---------- towers (pseudo-3D) ---------- */
    _drawTowers() {
      const ctx = this.ctx, time = this.game.time;
      for (const t of this.game.towers) {
        const fire = t.muzzle;      // 0..1 firing flash
        const kick = t.recoil;      // 0..1 recoil
        const bob = Math.sin(time * 2.5 + t.id) * 0.6; // subtle idle motion

        ctx.save();
        ctx.translate(t.x, t.y);

        // ---- ground cast shadow (offset to fake elevation/light) ----
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath(); ctx.ellipse(4, 6, 16, 9, 0, 0, 7); ctx.fill();
        ctx.restore();

        // lift the whole tower up a touch for a 3D "elevated" feel
        ctx.translate(0, -2 + bob);

        // ---- stone/metal pedestal ----
        this._pedestal(ctx, t);

        if (t.burnedDown) {
          // smoldering rubble (offline) — drawn instead of the turret
          this._rubble(ctx, t, time);
        } else {
          // ---- turret (rotated to face target) ----
          ctx.save();
          if (!t.isSupport) ctx.rotate(t.angle);
          const drawer = this['_turret_' + t.key] || this._turret_archer;
          drawer.call(this, ctx, t, fire, kick, time);
          ctx.restore();

          // support aura emblem stays upright
          if (t.isSupport) this._supportEmblem(ctx, t, time);

          // flames while the fire is spreading (still functioning)
          if (t.burning > 0) this._flames(ctx, t, time, 1);
        }
        // rebuilding scaffold flicker
        if (t.repairing > 0) {
          ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 10);
          ctx.strokeStyle = '#6ee7ff'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
          ctx.strokeRect(-12, -12, 24, 24); ctx.restore();
        }

        // frozen-in-ice overlay (encases the whole tower)
        if (t.isFrozen) this._iceOverlay(ctx, t);
        // mind-control corruption aura
        if (t.mindControlled > 0) this._mindControlAura(ctx, t, time);
        // shut-down (fairy reflection) overlay
        if (t.shutdown > 0) this._shutdownOverlay(ctx, t, time);

        ctx.restore();

        // overlays in screen space
        this._levelPips(t);
        this._towerHpBar(t);
        if (t.fuelMax > 0) this._fuelBar(t);
        if (t.evolution) {
          ctx.save();
          ctx.fillStyle = '#ffcf4a'; ctx.shadowColor = '#ffcf4a'; ctx.shadowBlur = 6;
          ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('★', t.x, t.y - 22);
          ctx.restore();
        }
      }
    }

    /* swirling dark aura over a mind-controlled tower */
    _mindControlAura(ctx, t, time) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(time * 8) + t.mcFlash;
      ctx.strokeStyle = '#b57bff'; ctx.lineWidth = 2; ctx.shadowColor = '#a04bff'; ctx.shadowBlur = 12;
      ctx.setLineDash([5, 5]); ctx.lineDashOffset = time * 20;
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      // dark tint
      ctx.globalAlpha = 0.28; ctx.fillStyle = '#5a1f8c';
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
      // skull-ish eyes
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#e0b3ff'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(-4, -3, 1.8, 0, 7); ctx.arc(4, -3, 1.8, 0, 7); ctx.fill();
      ctx.restore();
    }

    /* animated flames over a burning tower */
    _flames(ctx, t, time, scale) {
      ctx.save();
      const cols = ['rgba(255,90,30,0.9)', 'rgba(255,150,40,0.95)', 'rgba(255,225,120,0.95)'];
      for (let i = 0; i < 6; i++) {
        const bx = (i - 2.5) * 5 * scale;
        const ph = time * 9 + i * 1.7;
        const h = (10 + Math.sin(ph) * 6) * scale;
        const w = 5 * scale;
        ctx.fillStyle = cols[i % 3];
        ctx.beginPath();
        ctx.moveTo(bx - w / 2, 6); ctx.quadraticCurveTo(bx, 6 - h, bx + w / 2, 6); ctx.closePath();
        ctx.fill();
      }
      // ember sparks
      ctx.fillStyle = 'rgba(255,200,120,0.9)';
      for (let i = 0; i < 4; i++) {
        const a = time * 4 + i * 2;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 10, -6 - ((time * 20 + i * 7) % 16), 1.2, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    /* smoldering rubble pile (burned-down tower), glowing red */
    _rubble(ctx, t, time) {
      ctx.save();
      // red glow
      const glow = 0.4 + 0.25 * Math.sin(time * 3 + t.id);
      const g = ctx.createRadialGradient(0, 2, 1, 0, 2, 18);
      g.addColorStop(0, 'rgba(255,60,20,' + glow + ')'); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 2, 18, 0, 7); ctx.fill();
      // charred chunks
      ctx.fillStyle = '#2a2420';
      const chunks = [[-7, 3, 6], [2, 4, 7], [8, 1, 5], [-2, -2, 5], [-9, -1, 4]];
      for (const [x, y, r] of chunks) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      // glowing embers between chunks
      ctx.fillStyle = 'rgba(255,90,30,' + (0.6 + glow * 0.4) + ')';
      for (const [x, y] of [[-4, 2], [4, 3], [0, -1]]) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
      // thin smoke
      ctx.strokeStyle = 'rgba(120,110,110,0.4)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(Math.sin(time * 2) * 6, -14, Math.sin(time * 1.5) * 3, -24); ctx.stroke();
      // support rebuild progress ring
      if (t.repairProgress > 0) {
        ctx.strokeStyle = 'rgba(110,231,255,0.25)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 2, 15, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#6ee7ff'; ctx.shadowColor = '#6ee7ff'; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(0, 2, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t.repairProgress); ctx.stroke();
      }
      ctx.restore();
    }

    /* offline / static overlay for a shut-down tower (fairy reflection) */
    _shutdownOverlay(ctx, t, time) {
      ctx.save();
      // dark cover
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#1a1020';
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
      // pink glitch sparks
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ff8ae0'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const y = -8 + ((time * 30 + i * 9) % 18);
        ctx.beginPath(); ctx.moveTo(-12, y); ctx.lineTo(12, y + (Math.random() - 0.5) * 3); ctx.stroke();
      }
      // blinking power symbol
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 8);
      ctx.strokeStyle = '#ffaaf0'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, 5, -1.0, Math.PI * 2 - 1.0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -1); ctx.stroke();
      ctx.restore();
    }

    /* fuel / recharge gauge for flamethrowers */
    _fuelBar(t) {
      const ctx = this.ctx, w = 22, x = t.x - w / 2, y = t.y + 25;
      const rechargeTime = (t.def.base.rechargeTime || 10);
      const recharging = t.recharge > 0;
      const frac = recharging ? 1 - t.recharge / rechargeTime : t.fuel / t.fuelMax;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = recharging ? '#58b4ff' : (frac > 0.3 ? '#ff9a3a' : '#f0556a');
      ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 2);
      if (recharging && t.rechargeBoost > 0) { // 2x boost glow
        ctx.fillStyle = '#ffe08a'; ctx.fillRect(x, y - 2, w, 1);
      }
      ctx.restore();
    }

    /* HP bar under a tower — shown only when damaged or mind-controlled */
    _towerHpBar(t) {
      if (t.hp >= t.maxHp && t.mindControlled <= 0) return;
      const ctx = this.ctx, w = 26, x = t.x - w / 2, y = t.y + 21;
      const frac = Math.max(0, Math.min(1, t.hp / t.maxHp));
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = t.mindControlled > 0 ? '#b57bff' : (frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#ffcf4a' : '#f0556a');
      ctx.fillRect(x, y, w * frac, 3);
      ctx.restore();
    }

    /* elevated circular base with rim light + bevel */
    _pedestal(ctx, t) {
      // outer ring
      let g = ctx.createRadialGradient(-6, -7, 2, 0, 0, 17);
      g.addColorStop(0, '#46546f'); g.addColorStop(0.6, '#2a3346'); g.addColorStop(1, '#141b29');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
      // top rim highlight
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.arc(0, -1, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      // bottom rim shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(0, 1, 15, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
      // inner deck
      let g2 = ctx.createRadialGradient(-4, -5, 1, 0, 0, 11);
      g2.addColorStop(0, '#2c3851'); g2.addColorStop(1, '#0e1420');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.stroke();
    }

    /* metallic barrel pointing +x */
    _barrel(ctx, x, len, w, c1, c2) {
      const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
      g.addColorStop(0, c2); g.addColorStop(0.45, c1); g.addColorStop(1, '#0a0d14');
      ctx.fillStyle = g;
      this._rrect(ctx, x, -w / 2, len, w, Math.min(3, w / 2)); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x + 1, -w / 2 + 1, len - 2, 1.4);
    }

    /* layered muzzle flash at distance d */
    _muzzleFlash(ctx, d, fire, color) {
      if (fire <= 0.04) return;
      ctx.save();
      const rad = 5 + fire * 9;
      const fg = ctx.createRadialGradient(d, 0, 0, d, 0, rad);
      fg.addColorStop(0, 'rgba(255,250,225,' + fire + ')');
      fg.addColorStop(0.4, (color || 'rgba(255,180,80,1)').replace(')', ',' + (fire * 0.8) + ')').replace('rgb', 'rgba'));
      fg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(d, 0, rad, 0, 7); ctx.fill();
      // star spikes
      ctx.globalAlpha = fire;
      ctx.fillStyle = 'rgba(255,255,235,' + fire + ')';
      ctx.translate(d, 0);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(rad * 1.4, 2); ctx.lineTo(rad * 1.4, -2); ctx.fill();
      }
      ctx.restore();
    }

    // ---- per-tower turrets (origin at center, barrel points +x) ----
    _turret_archer(ctx, t, fire, kick) {
      const k = kick * 3;
      // wooden stock
      this._barrel(ctx, -3 - k, 15, 6, '#a9783f', '#d8a85f');
      // bow limbs at the front
      ctx.strokeStyle = '#6b4a26'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(9 - k, 0, 8, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = '#caa36a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(9 - k, 0, 8, -1.15, 1.15); ctx.stroke();
      // string + bolt (bolt slides back with recoil)
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8;
      const sx = 9 - k + Math.cos(1.15) * 8;
      ctx.beginPath(); ctx.moveTo(sx, -7.3); ctx.lineTo(2 - k * 2, 0); ctx.lineTo(sx, 7.3); ctx.stroke();
      ctx.fillStyle = '#e8d8a0';
      ctx.beginPath(); ctx.moveTo(14 - k, 0); ctx.lineTo(4 - k, -1.6); ctx.lineTo(4 - k, 1.6); ctx.fill();
      this._muzzleFlash(ctx, 15, fire * 0.5, 'rgb(255,230,150)');
    }
    _turret_cannon(ctx, t, fire, kick) {
      const k = kick * 4;
      // breech sphere
      let g = ctx.createRadialGradient(-3, -3, 1, 0, 0, 8);
      g.addColorStop(0, '#5a5a5a'); g.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-2 - k, 0, 7, 0, 7); ctx.fill();
      // thick barrel
      this._barrel(ctx, 0 - k, 19, 12, '#4a4a4a', '#7a7a7a');
      // muzzle ring
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(19 - k, 0, 6, 0, 7); ctx.stroke();
      ctx.fillStyle = '#0c0c0c'; ctx.beginPath(); ctx.arc(19 - k, 0, 4.2, 0, 7); ctx.fill();
      this._muzzleFlash(ctx, 21 - k, fire, 'rgb(255,170,70)');
    }
    _turret_magic(ctx, t, fire, kick, time) {
      // floating orb above a small dais
      const lift = Math.sin(time * 3 + t.id) * 1.5;
      const col = t.displayColor;
      // halo
      ctx.save();
      ctx.globalAlpha = 0.35 + fire * 0.5;
      let hg = ctx.createRadialGradient(8, lift, 0, 8, lift, 12);
      hg.addColorStop(0, col); hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(8, lift, 12, 0, 7); ctx.fill();
      ctx.restore();
      // orb with bright core
      let g = ctx.createRadialGradient(6, lift - 2, 0, 8, lift, 7);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, col); g.addColorStop(1, 'rgba(40,30,80,0.9)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(8, lift, 7, 0, 7); ctx.fill();
      // orbiting spark
      const a = time * 4 + t.id;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(8 + Math.cos(a) * 8, lift + Math.sin(a) * 4, 1.4, 0, 7); ctx.fill();
    }
    _turret_flamethrower(ctx, t, fire, kick, time) {
      // fuel tank + wide nozzle
      let g = ctx.createRadialGradient(-3, -3, 1, -1, 0, 8);
      g.addColorStop(0, '#8a3a1a'); g.addColorStop(0.6, '#5a2010'); g.addColorStop(1, '#2a0e06');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-2, 0, 7.5, 0, 7); ctx.fill();
      // pilot flame flicker
      ctx.fillStyle = 'rgba(255,180,60,' + (0.6 + 0.4 * Math.sin(time * 20 + t.id)) + ')';
      ctx.beginPath(); ctx.arc(-2, -6, 1.6, 0, 7); ctx.fill();
      // wide nozzle barrel
      this._barrel(ctx, 2, 14, 9, '#5a2a14', '#9a4a24');
      ctx.fillStyle = '#2a120a';
      ctx.beginPath(); ctx.arc(16, 0, 4.5, 0, 7); ctx.fill();
      // the cone of fire itself is drawn in _drawCones (over enemies)
    }
    _turret_ice(ctx, t, fire, kick, time) {
      // frosted gas canister + wide nozzle
      let g = ctx.createRadialGradient(-3, -3, 1, -1, 0, 8);
      g.addColorStop(0, '#cdeeff'); g.addColorStop(0.6, '#5aa0c8'); g.addColorStop(1, '#1e4a64');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-2, 0, 7.5, 0, 7); ctx.fill();
      // frost vapour flicker
      ctx.fillStyle = 'rgba(190,235,255,' + (0.5 + 0.4 * Math.sin(time * 14 + t.id)) + ')';
      ctx.beginPath(); ctx.arc(-2, -6, 1.6, 0, 7); ctx.fill();
      this._barrel(ctx, 2, 14, 9, '#256a8c', '#5fb8d8');
      ctx.fillStyle = '#0e3346';
      ctx.beginPath(); ctx.arc(16, 0, 4.5, 0, 7); ctx.fill();
      // the gas cone is drawn in _drawCones
    }
    _turret_tesla(ctx, t, fire, kick, time) {
      // coil base
      let g = ctx.createLinearGradient(0, -6, 0, 6);
      g.addColorStop(0, '#3a4a55'); g.addColorStop(1, '#0e1a20');
      ctx.fillStyle = g; this._rrect(ctx, -5, -6, 12, 12, 3); ctx.fill();
      // copper bands
      ctx.strokeStyle = '#b87333'; ctx.lineWidth = 1.4;
      for (let i = -3; i <= 4; i += 3) { ctx.beginPath(); ctx.moveTo(-5, i); ctx.lineTo(7, i); ctx.stroke(); }
      // two prongs
      ctx.strokeStyle = '#9fb4c0'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(6, -5); ctx.lineTo(12, -7); ctx.moveTo(6, 5); ctx.lineTo(12, 7); ctx.stroke();
      // electric core glow + arcs
      const glow = 0.5 + fire * 0.5 + Math.sin(time * 20) * 0.2;
      ctx.save(); ctx.globalAlpha = Math.max(0, glow);
      ctx.fillStyle = '#9beaff'; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(11, 0, 3, 0, 7); ctx.fill();
      // crackle between prongs
      ctx.strokeStyle = '#bff3ff'; ctx.lineWidth = 1; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(12, -7);
      for (let i = 1; i < 4; i++) ctx.lineTo(12 + (Math.random() - 0.5) * 4, -7 + (14 / 3) * i + (Math.random() - 0.5) * 3);
      ctx.stroke(); ctx.restore();
    }
    _turret_laser(ctx, t, fire, kick, time) {
      // emitter housing
      this._barrel(ctx, -2, 17, 10, '#5a2030', '#9a3548');
      // cooling fins
      ctx.fillStyle = '#3a1420';
      for (let i = 3; i < 13; i += 4) ctx.fillRect(i, -6, 1.5, 12);
      // focusing lens (glows with beam ramp / firing)
      const charge = 0.4 + (t.beamRamp || 0) * 0.25 + fire * 0.4;
      let g = ctx.createRadialGradient(16, 0, 0, 16, 0, 6);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, t.displayColor); g.addColorStop(1, 'rgba(60,0,10,0.6)');
      ctx.save(); ctx.globalAlpha = Math.min(1, charge);
      ctx.shadowColor = t.displayColor; ctx.shadowBlur = 12;
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 0, 5, 0, 7); ctx.fill();
      ctx.restore();
    }
    _turret_support(ctx, t, fire, kick, time) {
      // a short pole; pennant handled as upright emblem
      let g = ctx.createLinearGradient(0, -3, 0, 3);
      g.addColorStop(0, '#caa24a'); g.addColorStop(1, '#6b5320');
      ctx.fillStyle = g; this._rrect(ctx, -2, -2.5, 13, 5, 2); ctx.fill();
    }
    _supportEmblem(ctx, t, time) {
      // rotating runic aura ring + glowing gem + waving pennant
      const col = t.displayColor;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -time * 14;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // pennant flag waving
      ctx.save();
      ctx.translate(0, -3);
      ctx.fillStyle = col;
      const w = Math.sin(time * 6) * 2;
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(11, -6 + w); ctx.lineTo(2, -3); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#6b5320'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -9); ctx.stroke();
      ctx.restore();
      // glowing gem core
      let gg = ctx.createRadialGradient(-1, -1, 0, 0, 0, 5);
      gg.addColorStop(0, '#fff'); gg.addColorStop(0.5, col); gg.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill();
    }

    /* translucent ice crystal encasing a frozen tower */
    _iceOverlay(ctx, t) {
      ctx.save();
      ctx.globalAlpha = t.permaFrozen ? 0.85 : Math.min(0.9, 0.45 + t.frozen * 0.18);
      const R = 19;
      const g = ctx.createLinearGradient(-R, -R, R, R);
      g.addColorStop(0, 'rgba(205,238,255,0.6)'); g.addColorStop(1, 'rgba(120,175,255,0.45)');
      ctx.fillStyle = g;
      ctx.strokeStyle = 'rgba(235,250,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const x = Math.cos(a) * R, y = Math.sin(a) * R * 1.06;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // internal cracks / shards
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-6, -13); ctx.lineTo(2, -2); ctx.lineTo(-4, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, -8); ctx.lineTo(4, 2); ctx.lineTo(10, 10); ctx.stroke();
      ctx.restore();
    }

    _levelPips(t) {
      const ctx = this.ctx;
      const lv = t.level, maxL = t.maxLevel ? t.maxLevel() : TD.MAX_LEVEL;
      ctx.save();
      ctx.fillStyle = t.canEvolve() || t.evolution || (t.isSupport && lv >= maxL) ? '#ffcf4a' : '#6ee7ff';
      const w = 14, x0 = t.x - w / 2, y = t.y + 17;
      ctx.fillRect(x0, y, w * (lv / maxL), 2.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.5;
      ctx.strokeRect(x0, y, w, 2.5);
      ctx.restore();
    }

    /* ---------- enemies ---------- */
    _drawEnemies() {
      const ctx = this.ctx;
      for (const e of this.game.enemies) {
        const yo = e.flyHover || 0;
        // walk-cycle phase advances with distance actually travelled, so legs only
        // move when the mob moves (and freeze when stopped/casting/frozen).
        const moving = e.speed > 1 && e.casting <= 0;
        const gp = e.distTravelled * 0.14 + e.id;
        const swing = moving ? Math.sin(gp) : 0;
        const bob = moving ? Math.abs(Math.cos(gp)) * (e.r * 0.10) : 0;

        ctx.save();
        ctx.translate(e.x, e.y);
        // ground shadow stays ON the path; for flyers it sits beneath the hovering body
        ctx.fillStyle = e.flying ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(0, e.r * 0.95, e.r * (e.flying ? 0.8 : 0.9), e.r * 0.34, 0, 0, 7); ctx.fill();
        // lift the body (flyer hover + walk bob)
        ctx.translate(0, yo - bob);

        // status tint overrides the base body color
        let body = e.color;
        if (e.effects.freezeTimer > 0) body = '#9fe0ff';
        else if (e.effects.stunTimer > 0) body = '#ffe08a';

        // dispatch to a type-specific animated drawer (falls back to a generic walker)
        const o = { time: this.game.time, swing, gp, body, moving, casting: e.casting > 0 };
        // stealthed arsonists are nearly invisible (a faint smoky shimmer)
        if (e.isHidden) ctx.globalAlpha = 0.18 + 0.08 * Math.sin(this.game.time * 4 + e.id);
        else if (e.stealthed) ctx.globalAlpha = 0.85; // revealed: nearly solid + outline below
        const drawer = this['_mob_' + e.type] || this._mob_humanoid;
        drawer.call(this, ctx, e, o);
        if (e.stealthed && !e.isHidden) { // revealed glow ring
          ctx.save(); ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2;
          ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, 7); ctx.stroke(); ctx.restore();
        }
        ctx.globalAlpha = 1;

        // paladin guard aura — a golden protective ring on shielded mobs
        if (e.paladinGuard > 0 && !e.def.guardRadius) {
          ctx.save();
          ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.game.time * 5 + e.id);
          ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1.5; ctx.shadowColor = '#ffe08a'; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, 7); ctx.stroke();
          ctx.restore();
        }
        // spawn-protection bubble (wizards, first 5s — immune to damage)
        if (e.spawnInvuln > 0) {
          ctx.save();
          ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.game.time * 9);
          ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2; ctx.shadowColor = '#ffe08a'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(0, 0, e.r + 6, 0, 7); ctx.stroke();
          ctx.fillStyle = 'rgba(255,224,138,0.08)'; ctx.fill();
          ctx.restore();
        }
        // energy shield shell (drawn over everything, shimmering)
        if (e.shield > 0) {
          ctx.save();
          ctx.globalAlpha = 0.45 + 0.2 * Math.sin(this.game.time * 6);
          ctx.strokeStyle = 'rgba(150,215,255,0.95)'; ctx.lineWidth = 2;
          ctx.shadowColor = '#8ad0ff'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(0, 0, e.r + 5, 0, 7); ctx.stroke();
          ctx.fillStyle = 'rgba(150,215,255,0.10)'; ctx.fill();
          ctx.restore();
        }
        ctx.restore();

        if (!e.isHidden) this._healthBar(e);
        // status icons
        if (!e.isHidden && (e.dots.length || e.effects.slow > 0)) {
          ctx.save(); ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
          let icons = '';
          if (e.dots.some(d => d.type === 'poison')) icons += '☠';
          if (e.dots.some(d => d.type === 'burn')) icons += '🔥';
          if (e.effects.slow > 0) icons += '❄';
          ctx.fillText(icons, e.x, e.y + (e.flyHover || 0) - e.r - 12);
          ctx.restore();
        }
      }
    }

    /* a readable chat bubble that follows the boss while it taunts */
    _drawBossSpeech() {
      let sp = null;
      for (const e of this.game.enemies) { if (e.speech && e.speechTimer > 0) { sp = e; break; } }
      if (!sp) return;
      const ctx = this.ctx, text = sp.speech;
      ctx.save();
      ctx.font = 'bold 16px sans-serif';
      // word-wrap to a readable width
      const maxW = 240;
      const words = text.split(' '); const lines = []; let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      const lineH = 21, padX = 13, padY = 10, tail = 12;
      let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
      const w = tw + padX * 2, h = lines.length * lineH + padY * 2;

      // anchor above the boss, follow it, clamp on-screen
      const ax = sp.x, ay = sp.y + (sp.flyHover || 0) - sp.r;
      let cx = Math.max(w / 2 + 4, Math.min(this.W - w / 2 - 4, ax));
      let below = false;
      let y = ay - tail - h;            // bubble top (above the boss)
      if (y < 4) { below = true; y = ay + sp.r * 2 + tail; } // not enough room: place below
      const x = cx - w / 2;

      ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(sp.speechTimer, 0.5) / 0.5));
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a2230'; ctx.lineWidth = 2.5;
      this._rrect(ctx, x, y, w, h, 10); ctx.fill(); ctx.stroke();
      // tail pointing toward the boss
      const tx = Math.max(x + 10, Math.min(x + w - 10, ax));
      ctx.beginPath();
      if (below) { ctx.moveTo(tx - 8, y + 1); ctx.lineTo(tx + 8, y + 1); ctx.lineTo(tx, y - tail); }
      else { ctx.moveTo(tx - 8, y + h - 1); ctx.lineTo(tx + 8, y + h - 1); ctx.lineTo(tx, y + h + tail); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // text
      ctx.fillStyle = '#16202f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], cx, y + padY + lineH / 2 + i * lineH);
      ctx.restore();
    }
    _healthBar(e) {
      const ctx = this.ctx, w = Math.max(16, e.r * 2), x = e.x - w / 2, y = e.y + (e.flyHover || 0) - e.r - 7;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
      const frac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#ffcf4a' : '#f0556a';
      ctx.fillRect(x, y, w * frac, 3);
      if (e.maxShield > 0 && e.shield > 0) {
        ctx.fillStyle = '#58b4ff';
        ctx.fillRect(x, y - 3, w * (e.shield / e.maxShield), 2);
      }
    }

    /* ===================== enemy 3D helpers ===================== */
    /* lighten (amt>0) or darken (amt<0) a hex colour, returns rgb() */
    _shade(hex, amt) {
      let c = hex.replace('#', '');
      if (c.length === 3) c = c.split('').map(x => x + x).join('');
      const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
      const f = v => amt >= 0 ? Math.round(v + (255 - v) * amt) : Math.round(v * (1 + amt));
      return `rgb(${f(r)},${f(g)},${f(b)})`;
    }
    /* shaded spherical body with top-left light + specular highlight */
    _shadedBody(ctx, r, color) {
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.1, 0, 0, r * 1.05);
      g.addColorStop(0, this._shade(color, 0.55));
      g.addColorStop(0.55, color);
      g.addColorStop(1, this._shade(color, -0.45));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.40)';
      ctx.beginPath(); ctx.ellipse(-r * 0.33, -r * 0.4, r * 0.26, r * 0.16, -0.6, 0, 7); ctx.fill();
    }
    _eyes(ctx, e, r, glow) {
      ctx.save(); ctx.rotate(e.dir);
      if (glow) { ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 6; }
      else ctx.fillStyle = '#0a0f18';
      ctx.beginPath();
      ctx.arc(r * 0.45, -r * 0.28, Math.max(1.4, r * 0.16), 0, 7);
      ctx.arc(r * 0.45, r * 0.28, Math.max(1.4, r * 0.16), 0, 7);
      ctx.fill();
      ctx.restore();
    }

    /* ===================== animated mob sprites ===================== */
    /* a shaded 3D sphere at (x,y) */
    _ball(ctx, x, y, r, color) {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, this._shade(color, 0.6));
      g.addColorStop(0.55, color);
      g.addColorStop(1, this._shade(color, -0.45));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.38, r * 0.24, r * 0.14, -0.6, 0, 7); ctx.fill();
    }
    /* a rounded limb (leg/arm) */
    _limb(ctx, x1, y1, x2, y2, w, color) {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    /* eyes on a head centred at (cx,cy), looking toward dir */
    _eyesAt(ctx, cx, cy, r, dir, glow) {
      const dx = Math.cos(dir) * r * 0.16;
      ctx.save();
      if (glow) { ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 5; } else ctx.fillStyle = '#0a0f18';
      ctx.beginPath();
      ctx.arc(cx - r * 0.32 + dx, cy - r * 0.04, r * 0.16, 0, 7);
      ctx.arc(cx + r * 0.18 + dx, cy - r * 0.04, r * 0.16, 0, 7);
      ctx.fill(); ctx.restore();
    }
    /* wizard staff — raises overhead and flares while casting */
    _staff(ctx, e, o, color) {
      const r = e.r, cast = o.casting;
      const botX = r * 0.95, botY = r * 0.55;
      const topX = cast ? r * 0.45 : r * 1.0;
      const topY = cast ? -r * 2.0 : -r * 1.0;
      ctx.save();
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = Math.max(2, r * 0.16); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(botX, botY); ctx.lineTo(topX, topY); ctx.stroke();
      const pulse = cast ? 1 : 0.55 + 0.3 * Math.sin(o.time * 5 + e.id);
      const orbR = r * 0.3 * (cast ? 1.4 : 1);
      ctx.globalAlpha = Math.min(1, 0.55 + pulse * 0.45);
      ctx.shadowColor = color; ctx.shadowBlur = cast ? 16 : 8;
      const g = ctx.createRadialGradient(topX - orbR * 0.3, topY - orbR * 0.3, 1, topX, topY, orbR);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, color); g.addColorStop(1, this._shade(color, -0.3));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(topX, topY, orbR, 0, 7); ctx.fill();
      ctx.restore();
      if (cast) {
        ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6;
        for (let i = 0; i < 5; i++) {
          const a = o.time * 6 + i * 1.3;
          ctx.globalAlpha = 0.4 + 0.6 * Math.sin(a);
          ctx.beginPath(); ctx.arc(topX + Math.cos(a) * orbR * 1.8, topY + Math.sin(a) * orbR * 1.8, 1.5, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
    }
    /* pointy wizard hat sitting on the head */
    _wizHat(ctx, e, hatColor, star) {
      const r = e.r, hy = -r * 0.95;
      ctx.fillStyle = this._shade(hatColor, 0);
      ctx.beginPath(); ctx.moveTo(-r * 0.5, hy); ctx.lineTo(r * 0.5, hy); ctx.lineTo(r * 0.14, hy - r * 1.05); ctx.closePath(); ctx.fill();
      ctx.fillStyle = this._shade(hatColor, -0.3);
      ctx.beginPath(); ctx.ellipse(0, hy, r * 0.62, r * 0.16, 0, 0, 7); ctx.fill();
      ctx.fillStyle = star; ctx.shadowColor = star; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(r * 0.18, hy - r * 0.45, 1.7, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }

    /* ---- generic walking humanoid (legs + arms swing with `o.swing`) ---- */
    _mob_humanoid(ctx, e, o, opt) {
      opt = opt || {};
      const r = e.r, s = o.swing, body = o.body;
      const legC = opt.legColor || this._shade(body, -0.5);
      // legs
      const hipY = r * 0.4, footY = r * 1.05, foot = s * r * 0.42;
      this._limb(ctx, -r * 0.26, hipY, -r * 0.26 - foot, footY, r * 0.30, legC);
      this._limb(ctx, r * 0.26, hipY, r * 0.26 + foot, footY, r * 0.30, legC);
      // arms (swing opposite the legs)
      const arm = -s * r * 0.42;
      this._limb(ctx, -r * 0.68, -r * 0.12, -r * 0.78 - arm, r * 0.5, r * 0.24, legC);
      this._limb(ctx, r * 0.68, -r * 0.12, r * 0.78 + arm, r * 0.5, r * 0.24, legC);
      // torso (3D shaded)
      const g = ctx.createLinearGradient(-r * 0.7, 0, r * 0.7, 0);
      g.addColorStop(0, this._shade(body, -0.35)); g.addColorStop(0.5, this._shade(body, 0.3)); g.addColorStop(1, this._shade(body, -0.45));
      ctx.fillStyle = g;
      this._rrect(ctx, -r * 0.6, -r * 0.5, r * 1.2, r * 1.05, r * 0.45); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.ellipse(-r * 0.16, -r * 0.12, r * 0.2, r * 0.32, -0.2, 0, 7); ctx.fill();
      // head
      const hr = r * 0.5, hy = -r * 0.82;
      this._ball(ctx, 0, hy, hr, opt.headColor || body);
      this._eyesAt(ctx, 0, hy, hr, e.dir, opt.eyeGlow);
      if (opt.extra) opt.extra.call(this, ctx, e, o, hr, hy);
    }

    /* ---- robed figure (skirt/robe sways instead of legs) ---- */
    _mob_robed(ctx, e, o, opt) {
      opt = opt || {};
      const r = e.r, s = o.swing, body = o.body;
      const hem = s * r * 0.22;
      const g = ctx.createLinearGradient(-r * 0.8, 0, r * 0.8, 0);
      g.addColorStop(0, this._shade(body, -0.4)); g.addColorStop(0.5, this._shade(body, 0.25)); g.addColorStop(1, this._shade(body, -0.5));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.45); ctx.lineTo(r * 0.45, -r * 0.45);
      ctx.lineTo(r * 0.82 + hem, r * 1.05); ctx.lineTo(-r * 0.82 - hem, r * 1.05);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-r * 0.15, -r * 0.3); ctx.lineTo(-r * 0.3 - hem * 0.5, r * 1.0);
      ctx.moveTo(r * 0.15, -r * 0.3); ctx.lineTo(r * 0.3 + hem * 0.5, r * 1.0); ctx.stroke();
      const hr = r * 0.42, hy = -r * 0.66;
      this._ball(ctx, 0, hy, hr, opt.headColor || this._shade(body, 0.1));
      this._eyesAt(ctx, 0, hy, hr, e.dir, opt.eyeGlow);
      if (opt.extra) opt.extra.call(this, ctx, e, o, hr, hy);
    }

    // ---- ground troops ----
    _mob_normal(ctx, e, o) {
      this._mob_humanoid(ctx, e, o, { extra: (c, en, oo, hr, hy) => {
        c.fillStyle = '#717c91'; c.beginPath(); c.arc(0, hy - hr * 0.1, hr * 1.05, Math.PI * 1.05, Math.PI * 1.95); c.fill();
        c.fillStyle = '#39435a'; c.fillRect(-hr, hy - hr * 0.18, hr * 2, hr * 0.18);
      }});
    }
    _mob_fast(ctx, e, o) {
      // lean forward, slim build, motion streaks
      ctx.save();
      ctx.strokeStyle = 'rgba(110,231,255,0.4)'; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-e.r * 0.9, i * 3 - e.r * 0.2); ctx.lineTo(-e.r * 1.9, i * 3 - e.r * 0.2); ctx.stroke(); }
      ctx.restore();
      this._mob_humanoid(ctx, e, o, { eyeGlow: '#0a2030' });
    }
    _mob_tank(ctx, e, o) {
      this._mob_humanoid(ctx, e, o, { eyeGlow: '#ff5a5a', extra: (c, en, oo, hr, hy) => {
        // shoulder spikes
        c.fillStyle = this._shade(o.body, -0.35);
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * en.r * 0.55, -en.r * 0.4); c.lineTo(sx * en.r * 0.95, -en.r * 0.7); c.lineTo(sx * en.r * 0.7, -en.r * 0.2); c.fill(); }
      }});
    }
    _mob_armored(ctx, e, o) {
      this._mob_humanoid(ctx, e, o, { legColor: '#5a6472', headColor: '#aab4c4', eyeGlow: '#cfe', extra: (c, en, oo, hr, hy) => {
        // visor slit + rivets
        c.strokeStyle = '#1a2230'; c.lineWidth = 2; c.beginPath(); c.moveTo(-hr * 0.6, hy); c.lineTo(hr * 0.6, hy); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.beginPath(); c.arc(-en.r * 0.45, en.r * 0.1, 1.2, 0, 7); c.arc(en.r * 0.45, en.r * 0.1, 1.2, 0, 7); c.fill();
      }});
    }
    _mob_shielded(ctx, e, o) {
      this._mob_humanoid(ctx, e, o, { extra: (c, en, oo) => {
        const r = en.r;
        const sg = c.createLinearGradient(r * 0.4, -r, r * 1.1, r);
        sg.addColorStop(0, '#d2e2f5'); sg.addColorStop(1, '#587aa2');
        c.fillStyle = sg;
        c.beginPath(); c.moveTo(r * 0.55, -r * 0.7); c.lineTo(r * 1.05, -r * 0.5); c.lineTo(r * 1.05, r * 0.55); c.lineTo(r * 0.55, r * 0.75);
        c.quadraticCurveTo(r * 1.25, 0, r * 0.55, -r * 0.7); c.fill();
        c.strokeStyle = '#2a3a50'; c.lineWidth = 1; c.stroke();
      }});
    }
    _mob_healer(ctx, e, o) {
      this._mob_robed(ctx, e, o, { headColor: '#ffd9ec', extra: (c, en, oo, hr, hy) => {
        // hood
        c.fillStyle = this._shade(o.body, -0.25);
        c.beginPath(); c.arc(0, hy, hr * 1.15, Math.PI * 1.05, Math.PI * 1.95); c.fill();
        // glowing cross
        const pulse = 0.5 + 0.5 * Math.sin(oo.time * 4 + en.id);
        c.save(); c.globalAlpha = pulse; c.fillStyle = '#fff'; c.shadowColor = '#ff9bd0'; c.shadowBlur = 9;
        const s = en.r * 0.5, w = en.r * 0.16;
        c.fillRect(-w / 2, en.r * 0.1, w, s); c.fillRect(-s / 2, en.r * 0.1 + s * 0.32, s, w); c.restore();
      }});
    }

    // ---- wizards (robed, hat, animated casting staff, glowing aura) ----
    /* glowing halo + rotating rim behind a wizard. `glow` is an rgba string with an
       'A' placeholder for the animated alpha; `dark` makes a shadowy (darkening) halo. */
    _wizardAura(ctx, e, o, glow, rim, dark) {
      const r = e.r, t = o.time, cy = -r * 0.2;
      const pulse = 0.6 + 0.4 * Math.sin(t * 4 + e.id);
      ctx.save();
      const rad = r * 2.5;
      const g = ctx.createRadialGradient(0, cy, r * 0.2, 0, cy, rad);
      if (dark) {
        g.addColorStop(0, 'rgba(12,4,20,0.62)');
        g.addColorStop(0.5, glow.replace('A', (0.32 * pulse).toFixed(2)));
        g.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        g.addColorStop(0, glow.replace('A', (0.55 * pulse).toFixed(2)));
        g.addColorStop(0.55, glow.replace('A', (0.18 * pulse).toFixed(2)));
        g.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, cy, rad, 0, 7); ctx.fill();
      // rotating glowing rim ring
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = rim; ctx.lineWidth = 2.2; ctx.shadowColor = rim; ctx.shadowBlur = 14;
      ctx.setLineDash([7, 7]); ctx.lineDashOffset = -t * 22;
      ctx.beginPath(); ctx.arc(0, cy, r + 6, 0, 7); ctx.stroke();
      ctx.restore();
    }
    _mob_wizard(ctx, e, o) {                        // Ice Wizard — bright icy shine
      this._wizardAura(ctx, e, o, 'rgba(175,235,255,A)', '#dff4ff', false);
      this._mob_robed(ctx, e, o, { eyeGlow: '#eaffff', headColor: '#e6f4ff' });
      this._wizHat(ctx, e, '#6f8fd6', '#ffffff');
      this._staff(ctx, e, o, '#bfeeff');
    }
    _mob_darkwizard(ctx, e, o) {                    // Dark Wizard — shines dark
      this._wizardAura(ctx, e, o, 'rgba(150,40,230,A)', '#c07bff', true);
      // extra swirling dashed ring
      ctx.save(); ctx.globalAlpha = 0.4 + 0.2 * Math.sin(o.time * 6 + e.id);
      ctx.strokeStyle = '#a04bff'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.lineDashOffset = o.time * 18;
      ctx.beginPath(); ctx.arc(0, e.r * 0.2, e.r + 11, 0, 7); ctx.stroke(); ctx.restore();
      this._mob_robed(ctx, e, o, { eyeGlow: '#e9c4ff', headColor: '#5a3f7c' });
      this._wizHat(ctx, e, '#241038', '#c07bff');
      this._staff(ctx, e, o, '#c07bff');
    }
    _mob_fairy(ctx, e, o) {                         // Red Wizard — fiery red shine
      this._wizardAura(ctx, e, o, 'rgba(220,60,60,A)', '#ff6b6b', true);
      // wispy red tendrils
      ctx.save();
      ctx.strokeStyle = 'rgba(200,70,70,0.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = o.time * 2.5 + i * 2.1, sway = Math.sin(o.time * 4 + i) * e.r * 0.4;
        ctx.beginPath(); ctx.moveTo(0, e.r * 0.6);
        ctx.quadraticCurveTo(sway, e.r * 1.0, Math.cos(a) * e.r * 0.9, e.r * 1.3 + Math.sin(a) * e.r * 0.3);
        ctx.stroke();
      }
      ctx.restore();
      this._mob_robed(ctx, e, o, { eyeGlow: '#ffd0d0', headColor: '#5a2330' });
      this._wizHat(ctx, e, '#3a1418', '#ff6b6b');
      this._staff(ctx, e, o, '#ff9b9b');
    }

    // ---- splitters (gooey blobs, hop instead of walk) ----
    _mob_splitter(ctx, e, o) {
      const r = e.r, t = o.time, lobes = 8;
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
      g.addColorStop(0, this._shade(o.body, 0.5)); g.addColorStop(1, this._shade(o.body, -0.4));
      ctx.fillStyle = g; ctx.beginPath();
      for (let i = 0; i <= lobes; i++) {
        const a = i / lobes * Math.PI * 2;
        const rr = r * (1 + Math.sin(a * 3 + t * 3 + e.id) * 0.09);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.arc(-r * 0.3, r * 0.2, r * 0.3, 0, 7); ctx.arc(r * 0.35, -r * 0.1, r * 0.25, 0, 7); ctx.fill();
      this._eyesAt(ctx, 0, -r * 0.1, r * 0.7, e.dir);
    }
    _mob_splitterling(ctx, e, o) { this._mob_splitter(ctx, e, o); }

    // ---- flyer (winged, no legs) ----
    _mob_flying(ctx, e, o) {
      const r = e.r, wf = Math.sin(o.time * 13 + e.id) * 0.5;
      ctx.save();
      ctx.fillStyle = 'rgba(150,110,55,0.9)'; ctx.strokeStyle = this._shade(o.body, -0.4); ctx.lineWidth = 1;
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.scale(sgn, 1);
        ctx.beginPath();
        ctx.moveTo(r * 0.1, -r * 0.1);
        ctx.quadraticCurveTo(r * 1.0, -r * (1.3 + wf), r * 1.7, -r * (0.5 + wf));
        ctx.quadraticCurveTo(r * 0.8, -r * 0.2, r * 0.1, -r * 0.1);
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
      this._ball(ctx, 0, 0, r * 0.85, o.body);
      ctx.save(); ctx.rotate(e.dir);
      ctx.fillStyle = this._shade(o.body, -0.2);
      ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.25); ctx.lineTo(r * 1.25, 0); ctx.lineTo(r * 0.6, r * 0.25); ctx.fill();
      ctx.strokeStyle = '#f0e0c0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.15, -r * 0.45); ctx.lineTo(-r * 0.4, -r * 0.85);
      ctx.moveTo(r * 0.2, -r * 0.45); ctx.lineTo(r * 0.05, -r * 0.85); ctx.stroke();
      ctx.restore();
      this._eyesAt(ctx, 0, -r * 0.05, r * 0.85, e.dir, '#ffd24a');
    }

    // ---- bosses (big armoured walkers with horns + crown) ----
    _mob_bossbase(ctx, e, o, crown) {
      this._mob_humanoid(ctx, e, o, { eyeGlow: '#ffffff', legColor: this._shade(o.body, -0.55), extra: (c, en, oo, hr, hy) => {
        const r = en.r;
        // horns
        c.strokeStyle = '#f0e0c0'; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-hr * 0.6, hy - hr * 0.4); c.quadraticCurveTo(-hr * 1.1, hy - hr * 1.2, -hr * 0.7, hy - hr * 1.5);
        c.moveTo(hr * 0.6, hy - hr * 0.4); c.quadraticCurveTo(hr * 1.1, hy - hr * 1.2, hr * 0.7, hy - hr * 1.5);
        c.stroke();
        // shoulder spikes
        c.fillStyle = this._shade(o.body, -0.4);
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * r * 0.55, -r * 0.45); c.lineTo(sx * r * 1.0, -r * 0.8); c.lineTo(sx * r * 0.72, -r * 0.2); c.fill(); }
        // crown glow ring
        c.strokeStyle = crown; c.lineWidth = 2.5; c.shadowColor = crown; c.shadowBlur = 12;
        c.beginPath(); c.arc(0, r * 0.1, r + 3, 0, 7); c.stroke(); c.shadowBlur = 0;
      }});
    }
    _mob_miniboss(ctx, e, o) { this._mob_bossbase(ctx, e, o, '#ff9d5c'); }
    _mob_boss(ctx, e, o) { this._mob_bossbase(ctx, e, o, '#ffcf4a'); }
    _mob_eliteboss(ctx, e, o) {
      this._mob_bossbase(ctx, e, o, '#ff3b5c');
      ctx.strokeStyle = 'rgba(255,59,92,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, e.r * 0.1, e.r + 8, 0, 7); ctx.stroke();
    }

    // ---- Arsonist — hooded figure carrying a torch (smoky while stealthed) ----
    _mob_arsonist(ctx, e, o) {
      this._mob_robed(ctx, e, o, { headColor: '#3a2a22', eyeGlow: '#ff7a2a', extra: (c, en, oo, hr, hy) => {
        // hood
        c.fillStyle = this._shade('#5a2a14', 0);
        c.beginPath(); c.arc(0, hy, hr * 1.2, Math.PI * 1.05, Math.PI * 1.95); c.fill();
      }});
      // torch in hand
      const r = e.r;
      ctx.save();
      ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 0.85, r * 0.5); ctx.lineTo(r * 1.05, -r * 0.6); ctx.stroke();
      ctx.translate(r * 1.05, -r * 0.7);
      this._flames(ctx, e, o.time, 0.7);
      ctx.restore();
    }

    // ---- Paladin — mounted knight on a trotting horse, golden guard aura ----
    _mob_paladin(ctx, e, o) {
      const r = e.r, s = o.swing;
      // guard aura ring (shows the protection radius faintly)
      ctx.save();
      const gr = (e.def.guardRadius || 130);
      ctx.globalAlpha = 0.12 + 0.05 * Math.sin(o.time * 3);
      const ag = ctx.createRadialGradient(0, 0, gr * 0.4, 0, 0, gr);
      ag.addColorStop(0, 'rgba(255,224,138,0)'); ag.addColorStop(1, 'rgba(255,224,138,0.35)');
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(0, 0, gr, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -o.time * 16;
      ctx.beginPath(); ctx.arc(0, 0, gr, 0, 7); ctx.stroke();
      ctx.restore();

      // horse (3D-ish body) — legs trot with the gait
      const legC = '#3a2c20';
      const trot = s * r * 0.4;
      this._limb(ctx, -r * 0.55, r * 0.3, -r * 0.55 - trot, r * 1.0, r * 0.18, legC);
      this._limb(ctx, r * 0.55, r * 0.3, r * 0.55 + trot, r * 1.0, r * 0.18, legC);
      this._limb(ctx, -r * 0.2, r * 0.35, -r * 0.2 + trot, r * 1.0, r * 0.18, legC);
      this._limb(ctx, r * 0.2, r * 0.35, r * 0.2 - trot, r * 1.0, r * 0.18, legC);
      const hg = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.5);
      hg.addColorStop(0, '#6b4a2e'); hg.addColorStop(1, '#3a2616');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.ellipse(0, r * 0.25, r * 0.95, r * 0.5, 0, 0, 7); ctx.fill();
      // horse head + neck (faces dir)
      ctx.save(); ctx.scale(Math.cos(e.dir) >= 0 ? 1 : -1, 1);
      ctx.fillStyle = '#5a3c24';
      ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.1); ctx.lineTo(r * 1.25, -r * 0.5); ctx.lineTo(r * 1.4, -r * 0.2); ctx.lineTo(r * 0.85, r * 0.25); ctx.fill();
      ctx.restore();
      // rider (armoured knight)
      this._ball(ctx, 0, -r * 0.55, r * 0.42, '#cfd6e0');           // helmet/head
      const bg = ctx.createLinearGradient(-r * 0.4, 0, r * 0.4, 0);
      bg.addColorStop(0, '#8b93a1'); bg.addColorStop(0.5, '#e8edf4'); bg.addColorStop(1, '#8b93a1');
      ctx.fillStyle = bg;
      this._rrect(ctx, -r * 0.36, -r * 0.45, r * 0.72, r * 0.7, r * 0.3); ctx.fill();
      // plume
      ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.lineTo(r * 0.18, -r * 1.3); ctx.lineTo(-r * 0.05, -r * 1.0); ctx.fill();
      // lance
      ctx.save(); ctx.scale(Math.cos(e.dir) >= 0 ? 1 : -1, 1);
      ctx.strokeStyle = '#d9c08a'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.2); ctx.lineTo(r * 1.4, -r * 0.55); ctx.stroke();
      ctx.restore();
      // eyes
      this._eyesAt(ctx, 0, -r * 0.55, r * 0.42, e.dir, '#cfe');
    }

    /* ---- per-type enemy drawers (origin = body center, facing via e.dir) ---- */
    _enemy_normal(ctx, e, body) {                 // Grunt — helmeted soldier
      this._shadedBody(ctx, e.r, body);
      ctx.save(); ctx.rotate(e.dir);
      const hg = ctx.createLinearGradient(0, -e.r, 0, 0);
      hg.addColorStop(0, '#717c91'); hg.addColorStop(1, '#39435a');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, -e.r * 0.15, e.r * 0.92, Math.PI * 1.12, Math.PI * 1.88); ctx.fill();
      ctx.restore();
      this._eyes(ctx, e, e.r);
    }
    _enemy_fast(ctx, e, body, time) {             // Runner — sleek teardrop + speed streaks
      ctx.save(); ctx.rotate(e.dir);
      ctx.strokeStyle = 'rgba(110,231,255,0.45)'; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-e.r * 1.1, i * 3.2); ctx.lineTo(-e.r * 2.3, i * 3.2); ctx.stroke(); }
      const g = ctx.createRadialGradient(-e.r * 0.2, -e.r * 0.3, 1, 0, 0, e.r);
      g.addColorStop(0, this._shade(body, 0.55)); g.addColorStop(1, this._shade(body, -0.4));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(e.r * 1.45, 0);
      ctx.quadraticCurveTo(0, -e.r, -e.r * 0.85, -e.r * 0.5);
      ctx.quadraticCurveTo(-e.r, 0, -e.r * 0.85, e.r * 0.5);
      ctx.quadraticCurveTo(0, e.r, e.r * 1.45, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(-e.r * 0.1, -e.r * 0.35, e.r * 0.3, e.r * 0.14, -0.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#0a2030'; ctx.beginPath(); ctx.arc(e.r * 0.45, 0, e.r * 0.18, 0, 7); ctx.fill();
      ctx.restore();
    }
    _enemy_tank(ctx, e, body) {                   // Brute — bulky, spiked, armored
      ctx.save(); ctx.rotate(e.dir);
      ctx.fillStyle = this._shade(body, -0.3);
      for (let a = 0; a < 6; a++) { ctx.save(); ctx.rotate(a * Math.PI / 3); ctx.beginPath(); ctx.moveTo(e.r * 0.9, -3.5); ctx.lineTo(e.r * 1.32, 0); ctx.lineTo(e.r * 0.9, 3.5); ctx.fill(); ctx.restore(); }
      ctx.restore();
      this._shadedBody(ctx, e.r, body);
      ctx.save(); ctx.rotate(e.dir);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.6, 0, 7); ctx.fill();
      ctx.strokeStyle = this._shade(body, -0.4); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -e.r * 0.55); ctx.lineTo(0, e.r * 0.55); ctx.stroke();
      ctx.restore();
      this._eyes(ctx, e, e.r, '#ff5a5a');
    }
    _enemy_armored(ctx, e, body) {                // Knight — riveted steel + visor
      this._shadedBody(ctx, e.r, body);
      ctx.save(); ctx.rotate(e.dir);
      ctx.strokeStyle = '#1a2230'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(e.r * 0.15, -e.r * 0.32); ctx.lineTo(e.r * 0.72, -e.r * 0.32);
      ctx.moveTo(e.r * 0.15, e.r * 0.32); ctx.lineTo(e.r * 0.72, e.r * 0.32); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let a = 0; a < 8; a++) { ctx.beginPath(); ctx.arc(Math.cos(a * 0.785) * e.r * 0.82, Math.sin(a * 0.785) * e.r * 0.82, 1, 0, 7); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(215,225,240,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, e.r - 1, 0, 7); ctx.stroke();
    }
    _enemy_flying(ctx, e, body, time) {           // Wyvern — winged dragon
      const wf = Math.sin(time * 13) * 0.5;
      ctx.save(); ctx.rotate(e.dir);
      ctx.fillStyle = 'rgba(150,110,55,0.9)'; ctx.strokeStyle = this._shade(body, -0.4); ctx.lineWidth = 1;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.scale(1, s);
        ctx.beginPath();
        ctx.moveTo(-e.r * 0.1, e.r * 0.1);
        ctx.quadraticCurveTo(-e.r * 0.7, e.r * (1.5 + wf), -e.r * 1.6, e.r * (0.8 + wf));
        ctx.quadraticCurveTo(-e.r * 0.7, e.r * 0.6, -e.r * 0.1, e.r * 0.1);
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
      this._shadedBody(ctx, e.r, body);
      ctx.save(); ctx.rotate(e.dir);
      ctx.fillStyle = this._shade(body, -0.2);
      ctx.beginPath(); ctx.moveTo(e.r * 0.6, -e.r * 0.28); ctx.lineTo(e.r * 1.35, 0); ctx.lineTo(e.r * 0.6, e.r * 0.28); ctx.fill();
      ctx.strokeStyle = '#f0e0c0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-e.r * 0.15, -e.r * 0.5); ctx.lineTo(-e.r * 0.45, -e.r * 0.95);
      ctx.moveTo(e.r * 0.2, -e.r * 0.5); ctx.lineTo(e.r * 0.05, -e.r * 0.95); ctx.stroke();
      ctx.restore();
      this._eyes(ctx, e, e.r, '#ffd24a');
    }
    _enemy_splitter(ctx, e, body, time) {         // Splitter — wobbling goo w/ inner blobs
      const lobes = 8;
      const g = ctx.createRadialGradient(-e.r * 0.3, -e.r * 0.3, 1, 0, 0, e.r);
      g.addColorStop(0, this._shade(body, 0.5)); g.addColorStop(1, this._shade(body, -0.4));
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i <= lobes; i++) {
        const a = i / lobes * Math.PI * 2;
        const rr = e.r * (1 + Math.sin(a * 3 + time * 3 + e.id) * 0.09);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.arc(-e.r * 0.3, e.r * 0.2, e.r * 0.32, 0, 7); ctx.arc(e.r * 0.35, -e.r * 0.1, e.r * 0.26, 0, 7); ctx.fill();
      this._eyes(ctx, e, e.r);
    }
    _enemy_splitterling(ctx, e, body, time) { this._enemy_splitter(ctx, e, body, time); }
    _enemy_wizard(ctx, e, body, time) {           // Ice Wizard — robe, pointy hat, frost orb
      this._shadedBody(ctx, e.r, body);
      // pointy hat (upright, not rotated with movement)
      ctx.fillStyle = this._shade(body, -0.3);
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.75, -e.r * 0.45);
      ctx.lineTo(e.r * 0.75, -e.r * 0.45);
      ctx.lineTo(e.r * 0.15, -e.r * 1.85);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = this._shade(body, -0.45);
      ctx.beginPath(); ctx.ellipse(0, -e.r * 0.45, e.r * 0.95, e.r * 0.22, 0, 0, 7); ctx.fill();
      // hat star
      ctx.fillStyle = '#dff2ff'; ctx.shadowColor = '#bfe6ff'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(e.r * 0.28, -e.r * 1.1, 1.7, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      // pulsing frost orb (staff head) — brightens approaching a cast
      const cd = e.def.caster ? e.def.caster.cooldown : 4;
      const charge = e.castTimer != null ? 1 - Math.max(0, e.castTimer) / cd : 0.5;
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 5 + e.id)) * (0.5 + charge * 0.5);
      ctx.save(); ctx.globalAlpha = Math.min(1, pulse);
      ctx.fillStyle = '#cdeeff'; ctx.shadowColor = '#9fd6ff'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(e.r * 0.95, e.r * 0.3, e.r * 0.3, 0, 7); ctx.fill();
      ctx.restore();
      this._eyes(ctx, e, e.r, '#bfe6ff');
    }
    _enemy_darkwizard(ctx, e, body, time) {       // Dark Wizard — corrupt purple sorcerer
      // dark swirling aura
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(time * 6 + e.id);
      ctx.strokeStyle = '#a04bff'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.lineDashOffset = -time * 18;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, 7); ctx.stroke();
      ctx.restore();
      this._shadedBody(ctx, e.r, body);
      // jagged dark hat
      ctx.fillStyle = this._shade(body, -0.4);
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.8, -e.r * 0.45);
      ctx.lineTo(e.r * 0.8, -e.r * 0.45);
      ctx.lineTo(e.r * 0.05, -e.r * 1.95);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = this._shade(body, -0.55);
      ctx.beginPath(); ctx.ellipse(0, -e.r * 0.45, e.r * 1.0, e.r * 0.24, 0, 0, 7); ctx.fill();
      // dark orb / staff with corrupt glow
      const pulse = 0.5 + 0.5 * Math.sin(time * 5 + e.id);
      ctx.save(); ctx.globalAlpha = Math.min(1, 0.5 + pulse * 0.5);
      ctx.fillStyle = '#c07bff'; ctx.shadowColor = '#7a3fbf'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(e.r * 0.95, e.r * 0.3, e.r * 0.32, 0, 7); ctx.fill();
      ctx.restore();
      this._eyes(ctx, e, e.r, '#e0b3ff');
    }
    _enemy_fairy(ctx, e, body, time) {            // Fairy God Mother — winged, sparkly, magic wand
      const wf = Math.sin(time * 16 + e.id);
      // shimmering wings (behind)
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffd6f4';
      for (const s of [-1, 1]) {
        ctx.save(); ctx.scale(1, s);
        ctx.beginPath();
        ctx.ellipse(-e.r * 0.7, -e.r * 0.6, e.r * 0.55, e.r * 0.9, -0.5 + wf * 0.15, 0, 7);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-e.r * 0.5, e.r * 0.1, e.r * 0.45, e.r * 0.6, 0.3, 0, 7);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      // body / gown
      this._shadedBody(ctx, e.r, body);
      // glowing halo of sparkles
      ctx.save();
      for (let i = 0; i < 5; i++) {
        const a = time * 2 + i * (Math.PI * 2 / 5);
        const x = Math.cos(a) * (e.r + 5), y = Math.sin(a) * (e.r + 5) * 0.7 - 2;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 6 + i);
        ctx.fillStyle = '#fff7ff'; ctx.shadowColor = '#ffaaf0'; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
      }
      ctx.restore();
      // little crown
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.45, -e.r * 0.7); ctx.lineTo(-e.r * 0.45, -e.r * 1.05);
      ctx.lineTo(-e.r * 0.15, -e.r * 0.8); ctx.lineTo(0, -e.r * 1.15);
      ctx.lineTo(e.r * 0.15, -e.r * 0.8); ctx.lineTo(e.r * 0.45, -e.r * 1.05);
      ctx.lineTo(e.r * 0.45, -e.r * 0.7); ctx.closePath(); ctx.fill();
      // wand with star tip (front)
      ctx.save(); ctx.rotate(e.dir);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(e.r * 0.4, 0); ctx.lineTo(e.r * 1.3, -e.r * 0.4); ctx.stroke();
      ctx.fillStyle = '#fff27a'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
      this._star(ctx, e.r * 1.35, -e.r * 0.45, 3.2);
      ctx.restore();
      this._eyes(ctx, e, e.r, '#7a3050');
    }
    _star(ctx, cx, cy, r) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        const a2 = a + Math.PI / 5;
        ctx.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45);
      }
      ctx.closePath(); ctx.fill();
    }
    _enemy_healer(ctx, e, body, time) {           // Cleric — robed, glowing cross
      this._shadedBody(ctx, e.r, body);
      ctx.save(); ctx.rotate(e.dir);
      ctx.fillStyle = this._shade(body, -0.25);
      ctx.beginPath(); ctx.moveTo(-e.r * 0.1, -e.r * 0.95); ctx.lineTo(e.r * 0.45, -e.r * 0.2); ctx.lineTo(-e.r * 0.6, -e.r * 0.3); ctx.fill();
      ctx.restore();
      const pulse = 0.55 + 0.45 * Math.sin(time * 4 + e.id);
      ctx.save(); ctx.globalAlpha = pulse; ctx.fillStyle = '#fff'; ctx.shadowColor = '#ff9bd0'; ctx.shadowBlur = 9;
      const s = e.r * 0.55, w = e.r * 0.17;
      ctx.fillRect(-w / 2, -s / 2, w, s); ctx.fillRect(-s / 2, -w / 2, s, w);
      ctx.restore();
    }
    _enemy_shielded(ctx, e, body) {               // Bulwark — body behind a tower shield
      this._shadedBody(ctx, e.r, body);
      ctx.save(); ctx.rotate(e.dir);
      const sg = ctx.createLinearGradient(e.r * 0.4, -e.r, e.r * 1.1, e.r);
      sg.addColorStop(0, '#d2e2f5'); sg.addColorStop(1, '#587aa2');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(e.r * 0.5, -e.r * 0.85); ctx.lineTo(e.r * 1.05, -e.r * 0.6);
      ctx.lineTo(e.r * 1.05, e.r * 0.6); ctx.lineTo(e.r * 0.5, e.r * 0.85);
      ctx.quadraticCurveTo(e.r * 1.25, 0, e.r * 0.5, -e.r * 0.85); ctx.fill();
      ctx.strokeStyle = '#2a3a50'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      this._eyes(ctx, e, e.r);
    }
    _drawBoss(ctx, e, body, crown) {
      ctx.save(); ctx.rotate(e.dir);
      ctx.fillStyle = this._shade(body, -0.35);
      for (let a = 0; a < 10; a++) { ctx.save(); ctx.rotate(a * Math.PI / 5); ctx.beginPath(); ctx.moveTo(e.r * 0.95, -4); ctx.lineTo(e.r * 1.35, 0); ctx.lineTo(e.r * 0.95, 4); ctx.fill(); ctx.restore(); }
      ctx.restore();
      this._shadedBody(ctx, e.r, body);
      ctx.save(); ctx.rotate(e.dir);
      ctx.strokeStyle = '#f0e0c0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.5, -e.r * 0.6); ctx.quadraticCurveTo(-e.r * 0.95, -e.r * 1.15, -e.r * 0.6, -e.r * 1.35);
      ctx.moveTo(e.r * 0.5, -e.r * 0.6); ctx.quadraticCurveTo(e.r * 0.95, -e.r * 1.15, e.r * 0.6, -e.r * 1.35);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = crown; ctx.lineWidth = 2.5; ctx.shadowColor = crown; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 3, 0, 7); ctx.stroke();
      this._eyes(ctx, e, e.r, '#ffffff');
    }
    _enemy_miniboss(ctx, e, body) { this._drawBoss(ctx, e, body, '#ff9d5c'); }
    _enemy_boss(ctx, e, body) { this._drawBoss(ctx, e, body, '#ffcf4a'); }
    _enemy_eliteboss(ctx, e, body) {
      this._drawBoss(ctx, e, body, '#ff3b5c');
      this.ctx.strokeStyle = 'rgba(255,59,92,0.5)'; this.ctx.lineWidth = 1.5;
      this.ctx.beginPath(); this.ctx.arc(0, 0, e.r + 7, 0, 7); this.ctx.stroke();
    }

    /* ---------- projectiles ---------- */
    _drawProjectiles() {
      const ctx = this.ctx;
      for (const p of this.game.projectiles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        switch (p.kind) {
          case 'arrow':
            ctx.rotate(p.angle); ctx.strokeStyle = '#e8d8a0'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
            ctx.fillStyle = '#e8d8a0'; ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(2,-2); ctx.lineTo(2,2); ctx.fill();
            break;
          case 'cannonball':
            ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(0,0,5,0,7); ctx.fill();
            ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(-1,-1,2,0,7); ctx.fill();
            break;
          case 'magicbolt':
            ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(0,0,4,0,7); ctx.fill();
            break;
          case 'poisondart':
            ctx.rotate(p.angle); ctx.fillStyle = '#7fe07f';
            ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(-4,-3); ctx.lineTo(-4,3); ctx.fill();
            break;
          case 'lightning':
            ctx.fillStyle = '#9beaff'; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(0,0,3,0,7); ctx.fill();
            break;
          default:
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0,0,4,0,7); ctx.fill();
        }
        ctx.restore();
      }
    }

    /* ---------- laser beams ---------- */
    _drawBeams() {
      const ctx = this.ctx;
      for (const t of this.game.towers) {
        if (!t.def.base.beam || !t.target || t.target.dead) continue;
        const grad = ctx.createLinearGradient(t.x, t.y, t.target.x, t.target.y);
        grad.addColorStop(0, t.displayColor); grad.addColorStop(1, '#fff');
        ctx.save();
        ctx.globalAlpha = 0.85; ctx.strokeStyle = grad;
        ctx.lineWidth = 2 + t.beamRamp * 1.5; ctx.lineCap = 'round';
        ctx.shadowColor = t.displayColor; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(t.x + Math.cos(t.angle)*16, t.y + Math.sin(t.angle)*16);
        ctx.lineTo(t.target.x, t.target.y); ctx.stroke();
        ctx.restore();
      }
    }

    /* ---------- flamethrower cones ---------- */
    _drawCones() {
      const ctx = this.ctx, time = this.game.time;
      for (const t of this.game.towers) {
        if (!t.def.cone || !t.target || t.target.dead || t.isFrozen || t.shutdown > 0 || t.mindControlled > 0 || t.recharge > 0) continue;
        const half = t.coneAngle, range = t.range, a = t.angle;
        const ox = t.x + Math.cos(a) * 14, oy = t.y + Math.sin(a) * 14;
        const ice = !!t.def.slowGas;
        ctx.save();
        ctx.translate(ox, oy); ctx.rotate(a);
        // layered cone — orange flames or icy frost gas
        const layers = ice ? [
          { r: range, col: 'rgba(150,210,255,0.28)' },
          { r: range * 0.82, col: 'rgba(190,235,255,0.34)' },
          { r: range * 0.55, col: 'rgba(230,250,255,0.5)' },
        ] : [
          { r: range, col: 'rgba(255,90,30,0.30)' },
          { r: range * 0.82, col: 'rgba(255,140,40,0.40)' },
          { r: range * 0.55, col: 'rgba(255,210,90,0.55)' },
        ];
        for (const L of layers) {
          const wobble = half * (0.92 + 0.08 * Math.sin(time * (ice ? 12 : 25) + t.id));
          ctx.fillStyle = L.col;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, L.r, -wobble, wobble); ctx.closePath(); ctx.fill();
        }
        // flickering particles (embers or snow)
        ctx.fillStyle = ice ? 'rgba(235,250,255,0.9)' : 'rgba(255,235,170,0.9)';
        for (let i = 0; i < 5; i++) {
          const rr = range * (0.3 + Math.random() * 0.7);
          const aa = (Math.random() * 2 - 1) * half;
          ctx.beginPath(); ctx.arc(Math.cos(aa) * rr, Math.sin(aa) * rr, 1 + Math.random() * 1.6, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
    }

    /* ---------- effects ---------- */
    _drawEffects() {
      const ctx = this.ctx, fx = this.game.fx;
      // rings
      for (const r of fx.rings) {
        ctx.save(); ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
        ctx.strokeStyle = r.color; ctx.lineWidth = r.width;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke(); ctx.restore();
      }
      // arcs
      for (const a of fx.arcs) {
        ctx.save(); ctx.globalAlpha = a.life / a.max;
        ctx.strokeStyle = a.color; ctx.lineWidth = 2; ctx.shadowColor = a.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(a.x1, a.y1);
        const segs = 5;
        for (let i = 1; i < segs; i++) {
          const tt = i / segs;
          ctx.lineTo(a.x1 + (a.x2 - a.x1) * tt + (Math.random() - 0.5) * 12,
                     a.y1 + (a.y2 - a.y1) * tt + (Math.random() - 0.5) * 12);
        }
        ctx.lineTo(a.x2, a.y2); ctx.stroke(); ctx.restore();
      }
      // particles
      for (const p of fx.particles) {
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.restore();
      }
      // floating numbers
      for (const f of fx.floats) {
        ctx.save(); ctx.globalAlpha = Math.min(1, f.life / 0.4);
        ctx.fillStyle = f.color; ctx.font = (f.crit ? 'bold ' : '') + f.size + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y); ctx.restore();
      }
    }

    /* ---------- placement preview ---------- */
    _drawPlacement() {
      const inp = this.game.input;
      if (!inp || !inp.placing || inp.hoverTile == null) return;
      const { c, r } = inp.hoverTile;
      const map = this.game.map;
      const ok = map.isBuildable(c, r, this.game.towers) && this.game.economy.canAfford(TD.TOWERS[inp.placing].cost);
      const x = c * TS, y = r * TS;
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.35)' : 'rgba(240,85,106,0.35)';
      ctx.fillRect(x, y, TS, TS);
      ctx.strokeStyle = ok ? '#4ade80' : '#f0556a'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
      // range circle
      const def = TD.TOWERS[inp.placing];
      ctx.fillStyle = 'rgba(110,231,255,0.08)'; ctx.strokeStyle = 'rgba(110,231,255,0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x + TS/2, y + TS/2, def.base.range, 0, 7); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    /* ---------- banners (UI space, post-shake) ---------- */
    _drawBanners() {
      const ctx = this.ctx, fx = this.game.fx;
      let yOff = 0;
      for (const b of fx.banners) {
        const p = b.life / b.max;
        const alpha = p > 0.8 ? (1 - p) / 0.2 : p < 0.3 ? p / 0.3 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = b.color; ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 5;
        const y = this.H * 0.32 + yOff;
        ctx.strokeText(b.text, this.W / 2, y); ctx.fillText(b.text, this.W / 2, y);
        ctx.restore();
        yOff += 50;
      }
    }
  }

  /* Build a small canvas showing a tower's actual sprite (pedestal + turret),
     reusing the same drawing code the game uses. Used for the toolbar icons. */
  TD.makeTowerIcon = function (key, px) {
    px = px || 38;
    const def = TD.TOWERS[key];
    if (!def) return null;
    const ss = 3; // supersample for crisp edges
    const cv = document.createElement('canvas');
    cv.width = px * ss; cv.height = px * ss;
    cv.style.width = px + 'px'; cv.style.height = px + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(ss, ss);
    // borrow all the private drawing helpers off the prototype
    const helper = Object.create(Renderer.prototype);
    const t = {
      key, id: 0, displayColor: def.color, isSupport: !!def.isSupport,
      beamRamp: 0, level: 1, angle: 0, burning: 0
    };
    ctx.save();
    ctx.translate(px / 2, px / 2 + 1);
    ctx.scale(px / 46, px / 46);
    ctx.translate(-5, 0); // balance the forward-pointing barrel
    helper._pedestal(ctx, t);
    const drawer = Renderer.prototype['_turret_' + key] || Renderer.prototype._turret_archer;
    if (def.isSupport) {
      drawer.call(helper, ctx, t, 0, 0, 0);
      helper._supportEmblem(ctx, t, 0);
    } else {
      drawer.call(helper, ctx, t, 0, 0, 0);
    }
    ctx.restore();
    return cv;
  };

  /* Build a small canvas showing an enemy's actual sprite, reusing the same
     mob drawing code. Used for the in-game guide cards. */
  TD.makeEnemyIcon = function (key, px) {
    px = px || 48;
    const def = TD.ENEMIES[key];
    if (!def) return null;
    const ss = 3;
    const cv = document.createElement('canvas');
    cv.width = px * ss; cv.height = px * ss;
    cv.style.width = px + 'px'; cv.style.height = px + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(ss, ss);
    const helper = Object.create(Renderer.prototype);
    const e = {
      key, type: key, id: 0, r: def.r, dir: -Math.PI / 2, color: def.color,
      def, effects: {}, dots: []
    };
    const o = { time: 0, swing: 0, gp: 0, body: def.color, moving: false, casting: false };
    ctx.save();
    ctx.translate(px / 2, px * 0.54);
    ctx.scale((px * 0.30) / def.r, (px * 0.30) / def.r);
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(0, def.r * 0.95, def.r * 0.9, def.r * 0.34, 0, 0, 7); ctx.fill();
    const drawer = Renderer.prototype['_mob_' + key] || Renderer.prototype._mob_humanoid;
    drawer.call(helper, ctx, e, o);
    ctx.restore();
    return cv;
  };

  TD.Renderer = Renderer;
})(window.TD);
