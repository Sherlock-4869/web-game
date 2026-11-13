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

    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      const scale = [196, 220, 247, 262, 294, 330, 392];
      const bass =  [49, 55, 65, 73];
      this.musicTimer = setInterval(() => {
        if (this.muted) return;
        const t = this.ctx.currentTime;
        // soft arpeggio
        const f = scale[Math.floor(Math.random() * scale.length)] * 2;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.5);
        // bass every other step
        if (this._step % 2 === 0) {
          const bo = this.ctx.createOscillator(), bg = this.ctx.createGain();
          bo.type = 'sine'; bo.frequency.value = bass[Math.floor(this._step/2) % bass.length];
          bg.gain.setValueAtTime(0.0001, t);
          bg.gain.linearRampToValueAtTime(0.18, t + 0.04);
          bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
          bo.connect(bg); bg.connect(this.musicGain); bo.start(t); bo.stop(t + 0.45);
        }
        this._step++;
      }, 320);
    },
    stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } },

    setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.masterVol; },
    setMaster(v) { this.masterVol = v; if (this.master && !this.muted) this.master.gain.value = v; },
    setMusic(v) { this.musicVol = v; if (this.musicGain) this.musicGain.gain.value = v; },
  };

  TD.AUDIO = AUDIO;
})(window.TD);
