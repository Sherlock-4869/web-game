(function (global) {
  var ctx = null;
  var muted = false;
  try {
    muted = localStorage.getItem('pixel_arcade_muted') === '1';
  } catch (e) {}

  function ensureCtx() {
    if (muted) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  function tone(freq, type, duration, vol, slideTo, delay) {
    var c = ensureCtx();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
    }
    gain.gain.setValueAtTime(vol || 0.12, t0);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.015);
  }

  var presets = {
    click: function () { tone(520, 'triangle', 0.055, 0.09, 680); },
    move: function () { tone(300, 'sine', 0.045, 0.06, 360); },
    rotate: function () { tone(440, 'triangle', 0.065, 0.09, 620); },
    drop: function () { tone(190, 'square', 0.08, 0.09, 75); },
    eat: function () {
      tone(520, 'sine', 0.07, 0.12, 780);
      tone(780, 'triangle', 0.09, 0.1, 1040, 0.045);
    },
    merge: function (level) {
      var step = Math.min(12, Math.max(0, level || 1));
      var base = 330 * Math.pow(1.08, step);
      tone(base, 'triangle', 0.11, 0.12, base * 1.25);
    },
    clear: function () {
      tone(440, 'triangle', 0.09, 0.12, 554);
      tone(554, 'triangle', 0.09, 0.12, 659, 0.06);
      tone(659, 'triangle', 0.14, 0.14, 880, 0.12);
    },
    power: function () {
      tone(392, 'sine', 0.08, 0.12, 523);
      tone(523, 'sine', 0.08, 0.12, 659, 0.06);
      tone(784, 'triangle', 0.16, 0.14, 1046, 0.12);
    },
    shoot: function () { tone(760, 'sawtooth', 0.06, 0.06, 220); },
    hit: function () { tone(160, 'sawtooth', 0.11, 0.11, 55); },
    boom: function () {
      tone(130, 'sawtooth', 0.24, 0.16, 32);
      tone(90, 'square', 0.22, 0.11, 28, 0.02);
    },
    jump: function () { tone(280, 'sine', 0.13, 0.11, 620); },
    flag: function () { tone(620, 'triangle', 0.07, 0.09, 480); },
    win: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (n, i) {
        tone(n, 'triangle', 0.18, 0.13, n * 1.02, i * 0.085);
      });
    },
    lose: function () {
      [392, 349.23, 311.13, 246.94].forEach(function (n, i) {
        tone(n, 'sawtooth', 0.18, 0.10, n * 0.92, i * 0.095);
      });
    }
  };

  global.ArcadeSFX = {
    play: function (name, arg) {
      if (presets[name]) presets[name](arg);
    },
    tone: tone,
    isMuted: function () { return muted; },
    toggleMute: function () {
      muted = !muted;
      try { localStorage.setItem('pixel_arcade_muted', muted ? '1' : '0'); } catch (e) {}
      if (!muted) presets.click();
      return muted;
    },
    recordPlay: function (gameId) {
      try {
        var key = 'pixel_arcade_recent_v2';
        var list = JSON.parse(localStorage.getItem(key) || '[]');
        list = list.filter(function (x) { return x !== gameId; });
        list.unshift(gameId);
        localStorage.setItem(key, JSON.stringify(list.slice(0, 8)));
      } catch (e) {}
    }
  };
})(window);
