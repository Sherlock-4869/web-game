# Tower Defense — Characters Reference

All values are base values on **Normal** difficulty at wave 1 (mob HP, speed, and gold scale up each wave; difficulty multiplies on top). Everything below is editable per difficulty in the in‑game **Customize** page.

---

## Towers (your defenders)

Built in this order (hotkeys 1–8). Each has 10 upgrade levels (Support has 3) and a two‑branch evolution at max level.

| Tower | Cost | Unlocks | What it does |
|---|---|---|---|
| **Archer** | 40 | Wave 0 | Cheap, fast single‑target arrows. Hits flyers. Evolves → Ranger (2 targets, range/crit) or Sniper (huge damage/range). |
| **Cannon** | 80 | Wave 0 | Slow, heavy **splash** damage; targets the **strongest** mob by default. **Can't hit flyers.** Evolves → Heavy Cannon or Mortar (range/splash + stun). |
| **Magic** | 95 | Wave 0 | Medium speed, high single‑target; **ignores armor**. Evolves → Ice Mage (slow/freeze) or Lightning Mage (chain + shock). |
| **Flamethrower** | 90 | Wave 0 | Short **cone of fire**, heavy sustained damage. **Immune to freezing.** Fires 5s, then a 10s refuel. Evolves → Inferno or Napalm. |
| **Tesla** | 120 | Wave 3 | Energy bolts **chain** between nearby mobs + shock slow. Evolves → Arc Reactor or Railgun. |
| **Laser** | 160 | Wave 5 | Continuous beam; DPS **ramps up** the longer it holds a target. Expensive. Evolves → Plasma Lance or Death Ray. |
| **Ice Tower** | 95 | Wave 0 | Short **cone of freezing gas** — **no damage**; slows everything (debuff lingers 3s after leaving) and has a **5%/sec chance to freeze a target for 10s** (one frozen target per tower). Fires 5s, 10s refuel. **No effect on bosses, wizards, or Paladin‑guarded mobs.** Evolves → Blizzard or Glacier. |
| **Support** | 55 | Wave 2 | Doesn't attack. Pulses every **20s→15s→10s** (by level): cleanses Freeze/Mind‑Control/Shutdown, buffs nearby towers for 5s (+15/12/10/5% → stronger by level), gives a **steady +range aura**, and **rebuilds burned towers 5%/10%/15% per pulse**. 50% chance per pulse to **reveal Arsonists** (1s) and to **break a nearby Paladin's shield** (3s). Lvl‑3 also gives Archers +1 arrow / Teslas wider chains and **2× Flamethrower recharge**. **Max 5 on the board.** Lvl‑3 is freeze‑immune. |

**Build caps:** towers are uncapped on Phase‑1 maps; on Phase‑2 maps caps apply — Archer 8, Cannon 6, Magic 6, Flamethrower 5, Tesla 5, Laser 4, Ice 5, Support 5.

**Tower hit points:** every tower has HP scaled by level. It can never be destroyed — taking enough damage reverts its upgrades toward level 1.

---

## Mobs (the enemies)

| Mob | HP | Speed | Gold | What it does |
|---|---|---|---|---|
| **Grunt** | 55 | 55 | 5 | Baseline mob, no ability. |
| **Runner** | 34 | 104 | 6 | Very fast, very fragile. |
| **Brute** | 230 | 36 | 11 | Slow HP sponge (armor 2). |
| **Knight** | 120 | 50 | 10 | Heavy armor 8 — Magic & Poison/fire ignore it. |
| **Wyvern** | 80 | 78 | 9 | **Flying** — only the Cannon can't hit it. |
| **Splitter** | 90 | 52 | 8 | Splits into 2 Spawns on death. |
| **Spawn** | 28 | 80 | 2 | The fast offspring of a Splitter. |
| **Cleric** | 140 | 46 | 13 | Heals nearby mobs ~14 HP/sec. |
| **Bulwark** | 130 | 48 | 12 | Energy shield soaks ~52 damage before its HP (armor 3). |
| **Ice Wizard** | 120 | 24 | 18 | Slowest mob. Freezes any tower on the map for the rest of the wave — 75% chance to hit a *touching cluster* (incl. diagonals), 25% a single tower. 5s cooldown. Immune for its first 5s. **On death:** nearby mobs get 75% damage reduction for 10s. |
| **Dark Wizard** | 170 | 30 | 24 | Every 5s mind‑controls **all towers of one type** for 10s (they heal enemies instead of attacking); picking a new type frees the old. Immune for its first 5s. **On death:** nearby mobs become immune + 25% faster for 10s. |
| **Shadow Wizard** | 160 | random | 28 | One per wave, randomized speed. Reflects the **first tower type** to hit her → those towers shut down 20s; the reflect **re‑arms every 5s**. Also speeds a random mob +50% every 5s. Immune for first 5s. **On death:** nearby mobs gain Blink (teleport 1–10 tiles forward every 3s). |
| **Arsonist** | 300 | 46 | 35 | Invisible/untargetable; surfaces for 5s every **1–15s** to burn one nearby tower, then re‑hides. A burning tower dies after 5s, goes offline, and the **fire spreads to touching towers (incl. diagonals)**. Revealed by Support pulses or any Guardian power. |
| **Paladin** | 3500 | 24 | 120 | Mounted boss (random, any wave 8+). **Immune to all damage except Archers & Cannons.** All mobs in its aura are **immune to damage**, and faster mobs are slowed to linger in it. **On death** all nearby mobs heal to 100%. A Support pulse drops its shield for 3s. |
| **Mini‑Boss** | 1,100 | 34 | 50 | Scheduled boss (see below). |
| **Boss** | 2,600 | 30 | 75 | Scheduled boss. |
| **Warlord (Elite Boss)** | 6,000 | 28 | 100 | Scheduled boss; regenerates 30 HP/sec. |

---

## Guardian (your map power)

An animated crystal totem embedded in every map. It charges over **2 minutes**; when ready, three symbols appear above its head — click one to unleash it (then a 2‑minute recharge). **Every ability reveals stealthed mobs for 20s.**

- **⚡ Lightning Storm** — strikes every mob on screen for **−100 HP** (flat, ignores armor/immunity).
- **❄ Frozen Winds** — permanently slows every mob currently on screen by **50%** until it dies or leaves.
- **🧊 Deep Freeze** — freezes **all mobs in place for 20 seconds**.

---

## Game structure & special spawns

- **Phase 1:** a random single‑entrance map, **15 waves**. Bosses: Mini‑Boss @ wave 5, Boss @ 10, Warlord @ 15.
- **Phase 2:** clearing wave 15 moves you to a random **two‑entrance** map. Board resets, you get **300 gold**, **20 waves** to win. Bosses: Mini‑Boss @ 5, Mini‑Boss @ 10, Boss @ 15, Warlord @ 20.
- **Random specials each wave:** Ice Wizard (wave 4+, 1–3), Dark Wizard (6+, 1–2), Shadow Wizard (3+, 1), Arsonist (5+, 1), Paladin (8+, 1).
- **Difficulty (Normal):** start 200 gold, 20 lives. Easy/Hard/Nightmare adjust gold, lives, and HP/speed/reward multipliers.
- **Economy:** gold from kills, a **+100g flawless‑wave bonus** (no leaks), and 8% interest every 5 waves.

*All numbers above are the defaults and can be changed per difficulty in the Customize page.*
