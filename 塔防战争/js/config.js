/* ============================================================
   config.js — all game content as data.
   Add towers / enemies / waves here without touching core logic.
   Everything hangs off the single global namespace `TD`.
   ============================================================ */
const TD = (window.TD = window.TD || {});

TD.CONFIG = {
  tileSize: 40,
  cols: 32,
  rows: 18,
  startGold: 100,
  startLives: 20,
  sellRefund: 0.7,
  interestRate: 0.08,     // applied every 5 waves on banked gold (capped)
  interestEvery: 5,
  interestCap: 60,
  waveCountdown: 6,       // seconds between waves (auto)
  fps: 60,
};

/* ---------- Difficulty modifiers ---------- */
TD.DIFFICULTY = {
  easy:      { label: 'Easy',      gold: 150, lives: 30, hpMul: 0.8,  spdMul: 0.92, rewardMul: 1.15 },
  normal:    { label: 'Normal',    gold: 200, lives: 20, hpMul: 1.0,  spdMul: 1.0,  rewardMul: 1.0 },
  hard:      { label: 'Hard',      gold: 80,  lives: 15, hpMul: 1.35, spdMul: 1.08, rewardMul: 0.9 },
  nightmare: { label: 'Nightmare', gold: 70,  lives: 10, hpMul: 1.8,  spdMul: 1.18, rewardMul: 0.85 },
};

/* ---------- Damage types ---------- */
TD.DMG = { PHYSICAL: 'physical', MAGIC: 'magic', POISON: 'poison', ENERGY: 'energy', FIRE: 'fire' };

/* ============================================================
   TOWERS
   Each tower defines base stats + a 10-level upgrade curve
   (additive per level) + two evolution branches at level 10.
   ============================================================ */
TD.TOWERS = {
  archer: {
    key: 'archer', name: 'Archer', color: '#7fd17f', barrel: '#3f7a3f',
    cost: 40, hotkey: '1', unlock: 0, maxCountP2: 8,
    desc: 'Cheap, fast single-target arrows. Great early game.',
    dmgType: TD.DMG.PHYSICAL,
    projectile: 'arrow',
    base: { damage: 9, range: 115, fireRate: 1.6, projSpeed: 9, crit: 0.05, splash: 0, antiAir: true },
    perLevel: { damage: 4, range: 6, fireRate: 0.10, projSpeed: 0.3, crit: 0.01 },
    upgradeCost: { base: 35, growth: 1.28 },
    evolve: {
      ranger: { name: 'Ranger', desc: 'Double shot, big range & crit.',
        mods: { damage: 1.3, range: 1.45, fireRate: 1.25, crit: 0.18, multishot: 2 }, color: '#39d98a' },
      sniper: { name: 'Sniper', desc: 'Massive damage & crit, huge range.',
        mods: { damage: 3.2, range: 1.9, fireRate: 0.7, crit: 0.35, projSpeed: 2 }, color: '#2fa3ff' },
    },
  },
  cannon: {
    key: 'cannon', name: 'Cannon', color: '#caa24a', barrel: '#6b5320',
    cost: 80, hotkey: '2', unlock: 0, defaultTarget: 'strong', maxCountP2: 6,
    desc: 'Slow, heavy splash damage. Shreds enemy groups. Targets the strongest by default.',
    dmgType: TD.DMG.PHYSICAL,
    projectile: 'cannonball',
    base: { damage: 26, range: 110, fireRate: 0.6, projSpeed: 5.5, crit: 0.03, splash: 46, antiAir: false },
    perLevel: { damage: 12, range: 5, fireRate: 0.04, splash: 3 },
    upgradeCost: { base: 55, growth: 1.30 },
    evolve: {
      heavy: { name: 'Heavy Cannon', desc: 'Bigger blast, big damage.',
        mods: { damage: 1.6, splash: 1.4, fireRate: 1.1 }, color: '#e0a93a' },
      mortar: { name: 'Mortar', desc: 'Enormous range & splash, stuns.',
        mods: { damage: 1.3, range: 1.7, splash: 1.8, fireRate: 0.8, stun: 0.5 }, color: '#d98a2f' },
    },
  },
  magic: {
    key: 'magic', name: 'Magic', color: '#9b8bff', barrel: '#4b3fa0',
    cost: 95, hotkey: '3', unlock: 5, maxCountP2: 6,
    desc: 'Magic damage ignores armor. Strong single target.',
    dmgType: TD.DMG.MAGIC,
    projectile: 'magicbolt',
    base: { damage: 22, range: 125, fireRate: 1.0, projSpeed: 8, crit: 0.07, splash: 0, antiAir: true },
    perLevel: { damage: 9, range: 5, fireRate: 0.06, crit: 0.012 },
    upgradeCost: { base: 60, growth: 1.30 },
    evolve: {
      ice: { name: 'Ice Mage', desc: 'Slows & freezes targets.',
        mods: { damage: 1.1, slow: 0.45, slowDur: 1.6, freezeChance: 0.18 }, color: '#5fd0ff' },
      lightning: { name: 'Lightning Mage', desc: 'Chain lightning + shock.',
        mods: { damage: 1.4, chain: 3, shock: 0.4 }, color: '#c08bff' },
    },
  },
  flamethrower: {
    key: 'flamethrower', name: 'Flamethrower', color: '#ff7a3a', barrel: '#7a2a10',
    cost: 90, hotkey: '4', unlock: 6, maxCountP2: 5,
    desc: 'Short cone of fire — heavy sustained damage. Immune to freezing. Fires 5s, then must refuel 10s.',
    dmgType: TD.DMG.FIRE,
    projectile: null,
    cone: true,            // continuous cone attack (damage value = damage-per-second)
    cannotFreeze: true,    // immune to the Ice Wizard's freeze
    base: { damage: 46, range: 90, fireRate: 1, projSpeed: 1, crit: 0.04, splash: 0, antiAir: true,
            coneAngle: 0.5, burn: { dps: 8, dur: 1.5 },
            fuel: 5, rechargeTime: 10 }, // 5s of fire, then a 10s refuel
    perLevel: { damage: 16, range: 3, burnDps: 3 },
    upgradeCost: { base: 55, growth: 1.30 },
    evolve: {
      inferno: { name: 'Inferno', desc: 'Wider, hotter cone.',
        mods: { damage: 1.5, coneAngle: 1.4, range: 1.15 }, color: '#ff5a2a' },
      napalm: { name: 'Napalm', desc: 'Clings and burns over time.',
        mods: { damage: 1.2, burnDps: 2.6, burnDur: 2 }, color: '#ff9a3a' },
    },
  },
  tesla: {
    key: 'tesla', name: 'Tesla', color: '#67e8f9', barrel: '#1f7a8c',
    cost: 120, hotkey: '5', unlock: 7, maxCountP2: 5,
    desc: 'Electric bolts chain between nearby enemies.',
    dmgType: TD.DMG.ENERGY,
    projectile: 'lightning',
    base: { damage: 16, range: 120, fireRate: 1.2, projSpeed: 30, crit: 0.06, splash: 0, antiAir: true,
            chain: 3, chainFalloff: 0.8, shock: 0.25 },
    perLevel: { damage: 6, range: 4, fireRate: 0.05, chainAdd: 0.25 },
    upgradeCost: { base: 80, growth: 1.31 },
    evolve: {
      arc: { name: 'Arc Reactor', desc: 'Chains to everything in range.',
        mods: { chain: 6, damage: 1.2, chainFalloff: 0.9 }, color: '#67e8f9' },
      railgun: { name: 'Railgun', desc: 'Single devastating piercing bolt.',
        mods: { damage: 3, fireRate: 0.7, chain: 0, pierce: 6, projSpeed: 1.5 }, color: '#9beaff' },
    },
  },
  laser: {
    key: 'laser', name: 'Laser', color: '#ff6b81', barrel: '#8c1f33',
    cost: 160, hotkey: '6', unlock: 7, maxCountP2: 4,
    desc: 'Continuous beam — ramps up DPS the longer it burns one target.',
    dmgType: TD.DMG.ENERGY,
    projectile: 'beam',
    base: { damage: 30, range: 130, fireRate: 1000, projSpeed: 999, crit: 0.05, splash: 0, antiAir: true,
            beam: true, rampMax: 2.5, rampRate: 0.6, burn: { dps: 6, dur: 1.5 } },
    perLevel: { damage: 12, range: 5, burnDps: 3 },
    upgradeCost: { base: 100, growth: 1.32 },
    evolve: {
      plasma: { name: 'Plasma Lance', desc: 'Beam splashes & burns hard.',
        mods: { damage: 1.4, splash: 40, burnDps: 2 }, color: '#ff8aa0' },
      deathray: { name: 'Death Ray', desc: 'Insane ramping single-target DPS.',
        mods: { damage: 1.6, rampMax: 2, rampRate: 1.5 }, color: '#ff4d68' },
    },
  },
  ice: {
    key: 'ice', name: 'Ice Tower', color: '#7fd8ff', barrel: '#256a8c',
    cost: 95, hotkey: '7', unlock: 6, maxCountP2: 5,
    desc: 'Sprays freezing gas in a short cone — deals NO damage but slows everything (debuff lingers 3s) and may freeze a target solid. Recharges like the Flamethrower. No effect on bosses, wizards, or Paladin-guarded mobs.',
    dmgType: null,
    projectile: null,
    cone: true, slowGas: true,
    base: { damage: 0, range: 90, fireRate: 1, projSpeed: 1, crit: 0, splash: 0, antiAir: true,
            coneAngle: 0.5, slow: 0.5, slowDur: 3, freezeChance: 0.05, freezeDur: 10, fuel: 5, rechargeTime: 10 },
    perLevel: { range: 3, slow: 0.03, freezeChance: 0.01 },
    upgradeCost: { base: 55, growth: 1.30 },
    evolve: {
      blizzard: { name: 'Blizzard', desc: 'Wider cone, stronger slow.',
        mods: { coneAngle: 1.4, slow: 1.35, range: 1.15 }, color: '#aee9ff' },
      glacier: { name: 'Glacier', desc: 'Much higher freeze chance & longer freeze.',
        mods: { freezeChance: 3, freezeDur: 1.5 }, color: '#5fb8ff' },
    },
  },
  support: {
    key: 'support', name: 'Support', color: '#ffd27a', barrel: '#9c7a26',
    cost: 55, hotkey: '8', unlock: 3, maxLevel: 3,
    maxCount: 5,            // most Support towers you can have on the board
    revealChance: 0.5,     // chance each pulse to flush nearby Arsonists out of stealth
    revealDuration: 1,     // seconds an Arsonist stays revealed
    repairPerPulse: 0.05,  // fraction rebuilt per pulse PER LEVEL (L1 5% · L2 10% · L3 15%)
    desc: 'Pulse (every 20s→10s by level) cleanses Freeze/Mind Control/Shutdown, buffs nearby towers 5s, and may reveal Arsonists.',
    dmgType: null,
    projectile: null,
    isSupport: true,
    cannotFreeze: false,
    base: { range: 110, pulse: 10 }, // pulse cadence (s); buffs unlocked via upgrades (see tower.js)
    perLevel: { range: 55 },         // L1 r110 · L2 r165 · L3 r220 (reach grows each level)
    upgradeCost: { base: 45, growth: 1.5 }, // 50% cheaper · L1→2 = 45, L2→3 = 68
    // Level 2 grants +15% dmg / +12% fire rate / +10% range / +5% crit (in tower.js)
    // Level 3 adds tower-specific bonuses (Archer +1 arrow, Tesla wider chain); non-overlapping
  },
};

TD.TOWER_ORDER = ['archer', 'cannon', 'magic', 'flamethrower', 'tesla', 'laser', 'ice', 'support'];
TD.MAX_LEVEL = 10;

/* ============================================================
   ENEMIES
   ============================================================ */
TD.ENEMIES = {
  normal:  { key:'normal',  name:'Grunt',    color:'#cfd8e8', r:11, hp:55,  speed:55, armor:0,   reward:5,  flying:false },
  fast:    { key:'fast',    name:'Runner',   color:'#6ee7ff', r:9,  hp:34,  speed:104, armor:0,  reward:6,  flying:false },
  tank:    { key:'tank',    name:'Brute',    color:'#9b7bff', r:15, hp:230, speed:36, armor:2,   reward:11, flying:false },
  armored: { key:'armored', name:'Knight',   color:'#a0aab8', r:12, hp:120, speed:50, armor:8,   reward:10, flying:false },
  flying:  { key:'flying',  name:'Wyvern',   color:'#ffd27a', r:11, hp:80,  speed:78, armor:1,   reward:9,  flying:true },
  splitter:{ key:'splitter',name:'Splitter', color:'#7fe07f', r:13, hp:90,  speed:52, armor:0,   reward:8,  flying:false, split:{ into:'splitterling', count:2 } },
  splitterling:{ key:'splitterling', name:'Spawn', color:'#bdf0bd', r:8, hp:28, speed:80, armor:0, reward:2, flying:false },
  healer:  { key:'healer',  name:'Cleric',   color:'#ff9bd0', r:12, hp:140, speed:46, armor:1,   reward:13, flying:false, heal:{ amount:14, radius:70, every:1.0 } },
  shielded:{ key:'shielded',name:'Bulwark',  color:'#8ad0ff', r:13, hp:130, speed:48, armor:3,   reward:12, flying:false, shield:0.4 },
  // Ice Wizard — slow roamer. When a tower comes into range it pauses, picks a
  // RANDOM tower in range and freezes it; the freeze then CHAINS through every
  // tower touching it (sharing a border — orthogonal neighbours, not diagonals)
  // and onward through the whole connected cluster, for the REST OF THE WAVE.
  // Then it keeps moving. 5s cast cooldown.
  // caster: { castRange (px), pause (s it stops to cast), cooldown (s between casts) }
  // Ice Wizard — freezes a tower + its touching cluster for the rest of the wave.
  // On death it EXPLODES, granting nearby enemies 75% damage reduction for 10s.
  wizard:  { key:'wizard',  name:'Ice Wizard',color:'#8fb4ff', r:12, hp:120, speed:24, armor:1,   reward:18, flying:false,
             caster:{ castRange:120, pause:0.6, cooldown:5 }, deathEffect:'frostward' },
  // Dark Wizard — mind-controls a tower for 10s (the tower HEALS enemies). On death
  // it EXPLODES, making nearby enemies invulnerable for 10s and +25% movement speed.
  darkwizard:{ key:'darkwizard', name:'Dark Wizard', color:'#7a3fbf', r:13, hp:170, speed:30, armor:1, reward:24, flying:false,
             mind:{ castRange:120, pause:0.6, cooldown:5, duration:10 }, deathEffect:'rally' },
  // Shadow Wizard — one per wave. Reflect RE-ARMS every 5s (the first tower TYPE to
  // hit her is shut down for 20s each time). Every 5s she also picks a random mob on
  // screen and gives it +50% speed. On death she EXPLODES, granting nearby enemies
  // Blink (teleport 1-10 path spaces forward every 3s).
  fairy:   { key:'fairy',   name:'Red Wizard', color:'#d23a3a', r:13, hp:160, speed:60, armor:0, reward:28, flying:false,
             reflect:{ shutdown:20, reset:5 }, haste:{ mul:1.5 }, randomSpeed:[0.55, 1.8], deathEffect:'blink' },
  // Boss gold scales with difficulty (rewardMul); these are Normal-mode base values.
  boss:    { key:'boss',    name:'Boss',     color:'#ff6b6b', r:22, hp:2600, speed:30, armor:6,  reward:75,  flying:false, boss:true },
  miniboss:{ key:'miniboss',name:'Trumpinator',color:'#ff6a00', r:18, hp:1100, speed:34, armor:4,  reward:50,  flying:false, boss:true,
             taunt:{ gapMin:1, gapMax:5, dur:5,
               lines:[ "You're fired!", "Sad!", "Believe me, I'm the best", "It's going to be tremendous!",
                       "Nobody does it better.", "We have the best mobs", "Fake news!",
                       "We're winning. We're winning big. You are a loser!", "Total disaster!",
                       "These towers are made in Gina" ],
               death:"It's Biden's Fault" } },
  eliteboss:{ key:'eliteboss',name:'Warlord',color:'#ff3b5c', r:26, hp:6000, speed:28, armor:10, reward:100, flying:false, boss:true, regen:30 },
  // Arsonist — invisible while stealthed (untargetable). Every 20s it surfaces and
  // burns down nearby towers (1 every 2s). A tower takes 5s to burn down, then goes
  // offline until repaired. If not killed it re-stealths and keeps moving.
  arsonist: { key:'arsonist', name:'Arsonist', color:'#e0662a', r:12, hp:300, speed:46, armor:0, reward:35, flying:false,
              arson:{ stealthMin:1, stealthMax:15, active:5, burnRange:120, burnTime:5 } },
  // Paladin — slow mounted boss. Immune to ALL damage except Archers & Cannons. While
  // it lives, every mob in range is immune to damage; on death those mobs heal to 100%.
  paladin:  { key:'paladin', name:'Paladin', color:'#ece2bd', r:20, hp:3500, speed:24, armor:6, reward:120, flying:false, boss:true,
              immuneExcept:['archer','cannon'], guardRadius:135, deathHeal:true, auraSpeedMul:1.3 },
};

// Death-effect tuning (radius in px, duration in s)
TD.DEATH_EFFECTS = {
  frostward: { radius: 110, dur: 10, dmgReduction: 0.75 },          // Ice Wizard
  rally:     { radius: 110, dur: 10, invuln: true, speedMul: 1.25 }, // Dark Wizard
  blink:     { radius: 110, dur: 12, blinkEvery: 3, minSpaces: 1, maxSpaces: 10 }, // Shadow Wizard
};

/* ============================================================
   SPECIAL SPAWN RULES (data-driven — editable in the setup page)
   per enemy: { startWave, chance (0-1 per wave), min, max } injected each wave.
   ============================================================ */
TD.SPAWN = {
  wizard:     { startWave: 4, chance: 0.45, min: 1, max: 3 },
  darkwizard: { startWave: 6, chance: 0.35, min: 1, max: 2 },
  fairy:      { startWave: 3, chance: 0.50, min: 1, max: 1 },
  arsonist:   { startWave: 5, chance: 0.50, min: 1, max: 1 },
  paladin:    { startWave: 8, chance: 0.30, min: 1, max: 1 }, // random any wave from 8+
};

/* ============================================================
   BOSS SCHEDULE (which wave each boss type appears, per phase — editable).
   Each value is the wave number; the key names the boss (trailing digits ignored).
   ============================================================ */
TD.BOSSWAVES = {
  // One 25-level game: a boss-type every 5th level, escalating to the Warlord.
  phase1: { miniboss1: 5, boss1: 10, miniboss2: 15, boss2: 20, eliteboss: 25 },
  phase2: { miniboss1: 5, boss1: 10, miniboss2: 15, boss2: 20, eliteboss: 25 },
};

/* ============================================================
   GUARDIAN — a map power you control. Builds up over `chargeTime`, then you
   pick one of three abilities. All reveal stealthed mobs for `revealDuration`.
   ============================================================ */
TD.GUARDIAN = {
  chargeTime: 120,       // seconds to charge / recharge
  slowAmount: 0.5,       // permanent slow fraction (snow ❄)
  lightningDamage: 100,  // HP removed from each mob (lightning ⚡)
  freezeDuration: 20,    // seconds all mobs are frozen in place (ice 🧊)
  revealDuration: 20,    // seconds stealthed mobs are revealed
};

/* ============================================================
   WAVES
   Hand-authored opening waves; procedurally extended afterward.
   group: { type, count, spacing(s), delay(s before group) }
   ============================================================ */
TD.WAVES = [
  // Early levels: small, gentle. Group count and size grow as levels progress.
  { groups:[ {type:'normal', count:8,  spacing:0.85} ] },                                                   // L1 — 1 group
  { groups:[ {type:'normal', count:12, spacing:0.75} ] },                                                   // L2 — 1
  { groups:[ {type:'normal', count:10, spacing:0.7}, {type:'fast', count:6, spacing:0.5, delay:2} ] },      // L3 — 2
  { groups:[ {type:'fast', count:12, spacing:0.45}, {type:'normal', count:10, spacing:0.6, delay:2} ] },    // L4 — 2
  { groups:[ {type:'armored', count:10, spacing:0.7}, {type:'normal', count:12, spacing:0.6, delay:2} ] },  // L5 — 2 (Mini-Boss)
  { groups:[ {type:'fast', count:14, spacing:0.4}, {type:'armored', count:10, spacing:0.65, delay:2}, {type:'normal', count:10, spacing:0.55, delay:2} ] }, // L6 — 3
  { groups:[ {type:'tank', count:6, spacing:1.0}, {type:'fast', count:16, spacing:0.4, delay:2}, {type:'normal', count:12, spacing:0.55, delay:2} ] },      // L7 — 3
  { groups:[ {type:'flying', count:12, spacing:0.55}, {type:'fast', count:14, spacing:0.4, delay:2}, {type:'armored', count:8, spacing:0.7, delay:2} ] },   // L8 — 3
  { groups:[ {type:'splitter', count:8, spacing:0.85}, {type:'armored', count:10, spacing:0.65, delay:2}, {type:'fast', count:14, spacing:0.4, delay:2}, {type:'normal', count:10, spacing:0.55, delay:2} ] }, // L9 — 4
  { groups:[ {type:'shielded', count:8, spacing:0.75}, {type:'tank', count:6, spacing:1.0, delay:2}, {type:'flying', count:10, spacing:0.5, delay:2}, {type:'fast', count:14, spacing:0.4, delay:2} ] },        // L10 — 4 (Boss)
];

/* Procedurally build a wave definition for level n (1-based) beyond the authored list.
   Traditional ramp: more groups and bigger groups the deeper you go. */
TD.buildProceduralWave = function (n) {
  const groups = [];
  const pool = ['normal', 'fast', 'armored', 'tank', 'flying', 'splitter', 'healer', 'shielded'];
  // group count keeps climbing past level 10, up to 6 groups per wave
  const variety = Math.min(6, 4 + Math.floor((n - 9) / 3)); // L11:4, L12-14:5, L15+:6
  for (let i = 0; i < variety; i++) {
    const type = pool[(n * 3 + i * 5) % pool.length];
    const count = 7 + Math.floor(n * 0.6) + i * 2;          // bigger groups at higher levels
    groups.push({ type, count, spacing: Math.max(0.3, 0.65 - n * 0.01), delay: i === 0 ? 0 : 1.4 });
  }
  // cap total mobs so late waves stay performant (heavy rendering at high counts)
  const CAP = 130;
  let total = groups.reduce((s, g) => s + g.count, 0);
  if (total > CAP) {
    const k = CAP / total;
    for (const g of groups) g.count = Math.max(4, Math.round(g.count * k));
  }
  // bosses come from the editable schedule (TD.BOSSWAVES), not procedurally
  return { groups };
};

/* Pristine snapshot of all tunable data — the setup page reads these as the
   "default" values, and Settings.apply() rebuilds the live config from here. */
TD.BASE = JSON.parse(JSON.stringify({
  difficulty: TD.DIFFICULTY,
  towers: TD.TOWERS,
  enemies: TD.ENEMIES,
  spawn: TD.SPAWN,
  bossWaves: TD.BOSSWAVES,
  guardian: TD.GUARDIAN,
}));
