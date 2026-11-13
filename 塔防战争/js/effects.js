/* ============================================================
   effects.js — particles, floating text, arcs, banners, screen shake.
   Owns its own lightweight particle pools; drawn by the renderer.
   ============================================================ */
(function (TD) {
  class Effects {
    constructor(game) {
      this.game = game;
      this.particles = [];
      this.floats = [];     // floating damage numbers
      this.arcs = [];       // lightning arcs
      this.rings = [];      // expanding rings (explosions / heal / banner pulses)
      this.banners = [];    // big center text
      this.shake = 0;
    }

    clear() { this.particles.length = 0; this.floats.length = 0; this.arcs.length = 0; this.rings.length = 0; this.banners.length = 0; this.shake = 0; }

    damageNumber(x, y, amount, crit, dmgType) {
      const colors = { physical: '#ffffff', magic: '#b39bff', poison: '#7fe07f', energy: '#67e8f9' };
      this.floats.push({
        x: x + (Math.random() - 0.5) * 8, y, vy: -28, life: 0.8, max: 0.8,
        text: (crit ? '✦' : '') + amount, crit: !!crit,
        color: crit ? '#ffcf4a' : (colors[dmgType] || '#fff'),
        size: crit ? 18 : 13,
      });
    }
    floatText(x, y, text, color) {
      this.floats.push({ x, y, vy: -22, life: 1.1, max: 1.1, text, crit: false, color: color || '#fff', size: 13 });
    }

    spark(x, y, color) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 60;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, max: 0.3, r: 2, color });
      }
    }
    explosion(x, y, radius, color) {
      this.rings.push({ x, y, r: 4, max: radius, life: 0.35, maxLife: 0.35, color: color || '#ffb04a', width: 4 });
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5,
          r: 2 + Math.random() * 3, color: Math.random() < 0.5 ? '#ffb04a' : '#ff6a3a' });
      }
    }
    deathBurst(x, y, color, big) {
      const n = big ? 28 : 10;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * (big ? 160 : 90);
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 0.5 + Math.random() * 0.3, max: 0.8, r: 1.5 + Math.random() * 2.5, color });
      }
      if (big) { this.rings.push({ x, y, r: 6, max: 60, life: 0.5, maxLife: 0.5, color, width: 5 }); this.shake = Math.max(this.shake, 6); }
    }
    poisonPuff(x, y) {
      this.particles.push({ x: x + (Math.random()-0.5)*10, y: y + (Math.random()-0.5)*10,
        vx: (Math.random()-0.5)*10, vy: -15 - Math.random()*15, life: 0.6, max: 0.6, r: 2.5, color: '#7fe07f' });
    }
    healPulse(x, y, radius) {
      this.rings.push({ x, y, r: 4, max: radius, life: 0.5, maxLife: 0.5, color: '#ff9bd0', width: 2 });
    }
    lightningArc(x1, y1, x2, y2, color) {
      this.arcs.push({ x1, y1, x2, y2, color: color || '#67e8f9', life: 0.12, max: 0.12 });
    }
    pulseRing(x, y, radius, color) {
      this.rings.push({ x, y, r: 6, max: radius, life: 0.7, maxLife: 0.7, color: color || '#ffe08a', width: 4 });
      this.rings.push({ x, y, r: 6, max: radius * 0.7, life: 0.5, maxLife: 0.5, color: '#ffffff', width: 2 });
    }
    frostBurst(x, y, radius) {
      this.rings.push({ x, y, r: 3, max: radius, life: 0.5, maxLife: 0.5, color: '#bfe6ff', width: 3 });
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 55;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 0.5, max: 0.5, r: 1.5 + Math.random() * 2, color: Math.random() < 0.5 ? '#dff2ff' : '#9fd6ff' });
      }
    }
    banner(text, color) {
      this.banners.push({ text, color: color || '#fff', life: 2.0, max: 2.0 });
    }

    update(dt) {
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i]; f.y += f.vy * dt; f.vy += 14 * dt; f.life -= dt;
        if (f.life <= 0) this.floats.splice(i, 1);
      }
      for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i]; r.life -= dt; r.r = r.max * (1 - r.life / r.maxLife); if (r.life <= 0) this.rings.splice(i, 1);
      }
      for (let i = this.banners.length - 1; i >= 0; i--) { this.banners[i].life -= dt; if (this.banners[i].life <= 0) this.banners.splice(i, 1); }
    }
  }

  TD.Effects = Effects;
})(window.TD);
