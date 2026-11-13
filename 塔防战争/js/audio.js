/* ============================================================
   audio.js — WebAudio synthesized SFX + music (no asset files).
   Keeps the game fully self-contained / opens with no missing files.
   ============================================================ */
(function (TD) {
  const AUDIO = {
    ctx: null, muted: false, masterVol: 0.5, musicVol: 0.25,
    musicNode: null, musicTimer: null, _step: 0,

    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.masterVol;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicVol;
        this.musicGain.connect(this.master);
      } catch (e) { /* audio unsupported */ }
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

    _blip(freq, dur, type = 'square', vol = 0.3, slideTo = null) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur);
    },
    _noise(dur, vol = 0.3, filterFreq = 1200) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = filterFreq;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start(t);
    },

    play(name) {
      if (!this.ctx || this.muted) return;
      switch (name) {
        case 'shot':     this._blip(680, 0.06, 'square', 0.12, 420); break;
        case 'cannon':   this._noise(0.18, 0.28, 700); this._blip(120, 0.18, 'sawtooth', 0.2, 60); break;
        case 'explode':  this._noise(0.32, 0.32, 500); break;
        case 'zap':      this._blip(1400, 0.08, 'sawtooth', 0.16, 300); break;
        case 'magic':    this._blip(880, 0.12, 'sine', 0.16, 1320); break;
        case 'build':    this._blip(523, 0.09, 'triangle', 0.25, 784); break;
        case 'upgrade':  this._blip(660, 0.09, 'triangle', 0.25); setTimeout(() => this._blip(990, 0.12, 'triangle', 0.25), 90); break;
        case 'sell':     this._blip(440, 0.1, 'triangle', 0.2, 220); break;
        case 'deny':     this._blip(160, 0.12, 'square', 0.2, 110); break;
        case 'wavestart':this._blip(392, 0.12, 'triangle', 0.22); setTimeout(() => this._blip(587, 0.16, 'triangle', 0.22), 120); break;
        case 'bosswarn': this._blip(110, 0.5, 'sawtooth', 0.3, 90); break;
        case 'leak':     this._blip(220, 0.25, 'sawtooth', 0.25, 110); break;
        case 'victory':  [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this._blip(f,0.2,'triangle',0.25),i*130)); break;
        case 'gameover': [392,330,262,196].forEach((f,i)=>setTimeout(()=>this._blip(f,0.3,'sawtooth',0.25),i*180)); break;
        case 'coin':     this._blip(1200, 0.05, 'square', 0.08); break;
      }
    },

    /* ---- music: 5 rotating themes + a fast boss theme ---- */
    // each theme: tempo (ms/step), lead/bass waveforms, an 8-note scale (Hz), a
    // 16-step lead pattern (indices into scale, -1 = rest) and a bass line.
    // `bars` transposes the 16-step pattern each bar so the theme evolves before it
    // repeats: full loop = pat.length * bars.length steps (~30s at these tempos).
    TRACKS: [
      { name: 'Meadow', stepMs: 380, lead: 'triangle', bassType: 'sine', gain: 0.12,
        scale: [262,294,330,392,440,523,587,659], bass: [65,73,87,98],
        pat: [0,2,4,2, 5,4,2,0, 1,3,5,3, 4,2,0,-1], bars: [0,2,4,2,-3] },
      { name: 'Cavern', stepMs: 400, lead: 'triangle', bassType: 'triangle', gain: 0.11,
        scale: [220,247,262,294,330,349,392,440], bass: [55,65,73,82],
        pat: [0,1,2,0, 4,3,2,1, 0,2,4,5, 4,2,1,-1], bars: [0,-2,3,1,4] },
      { name: 'Forge', stepMs: 340, lead: 'square', bassType: 'sawtooth', gain: 0.085,
        scale: [196,233,262,311,349,392,466,523], bass: [49,58,65,78],
        pat: [0,0,3,0, 5,4,3,2, 0,0,4,0, 3,2,1,0], bars: [0,3,0,5,2] },
      { name: 'Frost', stepMs: 360, lead: 'triangle', bassType: 'sine', gain: 0.10,
        scale: [330,392,440,523,587,659,784,880], bass: [82,98,110,131],
        pat: [0,2,4,5, 7,5,4,2, 1,3,5,6, 5,3,1,-1], bars: [0,4,2,5,-1] },
      { name: 'Dusk', stepMs: 400, lead: 'triangle', bassType: 'sine', gain: 0.11,
        scale: [196,220,262,294,349,392,440,523], bass: [49,55,65,73],
        pat: [0,2,3,5, 4,3,2,0, 5,4,3,2, 1,0,-1,-1], bars: [0,2,-2,3,1] },
    ],
    // Boss theme: faster, louder, heavier drums (kick+snare every beat), rising tension.
    BOSS: { name: 'Onslaught', stepMs: 140, lead: 'sawtooth', bassType: 'square', gain: 0.12, drums: true, heavy: true, bassEvery: 1,
      scale: [220,262,294,311,349,392,415,466], bass: [55,55,65,49],
      pat: [0,0,3,0, 5,3,7,3, 2,2,5,2, 4,2,7,4], bars: [0,3,5,7,2,5] },

    baseTrack: 0, bossOn: false, _curCfg: null,

    startMusic() { if (!this.ctx) return; this.bossOn = false; this._switchTo(this.TRACKS[this.baseTrack]); },

    /* choose which of the 5 rotating themes plays (e.g. by wave) */
    setTrack(i) {
      this.baseTrack = ((i % this.TRACKS.length) + this.TRACKS.length) % this.TRACKS.length;
      if (!this.bossOn && this.ctx) this._switchTo(this.TRACKS[this.baseTrack]);
    },

    /* switch to/from the fast boss theme, remembering the rotating theme */
    bossMusic(on) {
      on = !!on;
      if (on === this.bossOn) return;
      this.bossOn = on;
      if (!this.ctx) return;
      this._switchTo(on ? this.BOSS : this.TRACKS[this.baseTrack]);
    },

    _switchTo(cfg) {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      this._curCfg = cfg; this._step = 0;
      if (!cfg) return;
      this.musicTimer = setInterval(() => this._musicStep(cfg), cfg.stepMs);
    },

    // turn a (scale index + transpose) into a frequency, octave-shifting as needed
    _noteFreq(scale, i) {
      let oct = 1;
      while (i >= scale.length) { i -= scale.length; oct *= 2; }
      while (i < 0) { i += scale.length; oct /= 2; }
      return scale[i] * oct;
    },

    _musicStep(cfg) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime, s = this._step, dur = cfg.stepMs / 1000;
      const barLen = cfg.pat.length;
      const bars = cfg.bars || [0];
      const shift = bars[Math.floor(s / barLen) % bars.length]; // per-bar transposition
      const bassEvery = cfg.bassEvery || 2;
      // lead voice
      const idx = cfg.pat[s % barLen];
      if (idx >= 0) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = cfg.lead; o.frequency.value = this._noteFreq(cfg.scale, idx + shift);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(cfg.gain, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + dur * 1.7);
      }
      // bass
      if (s % bassEvery === 0) {
        const bo = this.ctx.createOscillator(), bg = this.ctx.createGain();
        bo.type = cfg.bassType; bo.frequency.value = cfg.bass[Math.floor(s / bassEvery) % cfg.bass.length];
        bg.gain.setValueAtTime(0.0001, t);
        bg.gain.linearRampToValueAtTime(cfg.heavy ? 0.24 : 0.18, t + 0.04);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.4);
        bo.connect(bg); bg.connect(this.musicGain); bo.start(t); bo.stop(t + dur * 1.5);
      }
      // percussion for the boss theme (heavy: kick + snare every beat)
      if (cfg.drums) {
        const kickOn = cfg.heavy ? s % 2 === 0 : s % 2 === 0;
        const snareOn = cfg.heavy ? s % 2 === 1 : s % 4 === 2;
        if (kickOn) {
          const ko = this.ctx.createOscillator(), kg = this.ctx.createGain();
          ko.type = 'sine'; ko.frequency.setValueAtTime(160, t); ko.frequency.exponentialRampToValueAtTime(48, t + 0.12);
          kg.gain.setValueAtTime(cfg.heavy ? 0.42 : 0.3, t); kg.gain.exponentialRampToValueAtTime(0.0008, t + 0.14);
          ko.connect(kg); kg.connect(this.musicGain); ko.start(t); ko.stop(t + 0.15);
        }
        if (snareOn) {
          const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.12, this.ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
          const src = this.ctx.createBufferSource(); src.buffer = buf;
          const filt = this.ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 1400;
          const ng = this.ctx.createGain(); ng.gain.value = cfg.heavy ? 0.2 : 0.16;
          src.connect(filt); filt.connect(ng); ng.connect(this.musicGain); src.start(t);
        }
      }
      this._step++;
    },

    stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } this._curCfg = null; },

    setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.masterVol; },
    setMaster(v) { this.masterVol = v; if (this.master && !this.muted) this.master.gain.value = v; },
    setMusic(v) { this.musicVol = v; if (this.musicGain) this.musicGain.gain.value = v; },
  };

  TD.AUDIO = AUDIO;
})(window.TD);
