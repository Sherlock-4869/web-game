# Tower Defense

A polished, browser-based tower defense game built with pure HTML5, CSS, Canvas, and modern JavaScript. No engine, no backend, no frameworks, no build step.

## Run it

Open `index.html` in any modern browser. That's it.

## How to play

- Pick a tower from the bottom bar (or press its number key), then click a green grass tile to build. Right-click / Esc cancels.
- Click a placed tower to upgrade it, choose its specialization at level 10, change its target priority, or sell it (70% refund).
- Press **Start Wave** (waves also auto-start after a countdown). Survive — if 20 enemies leak past your defenses, it's over.
- Earn gold from kills, wave-clear bonuses, and banked interest every 5 waves. Spend it to out-scale the enemy.

### Controls
- **Mouse:** left-click = select / place / upgrade · right-click = cancel
- **1–9:** select tower · **Space/P:** pause · **F:** fast-forward (1×/2×/4×) · **U:** upgrade selected · **Del:** sell selected · **Esc:** cancel

## Towers
Archer (→ Ranger / Sniper), Cannon (→ Heavy / Mortar), Magic (→ Ice / Lightning), Poison (→ Toxic / Venom), Tesla (chain), Laser (ramping beam), Support (auras). Each has 10 upgrade levels then a two-branch evolution.

## Enemies
Normal, Fast, Tank, Armored, Flying (needs anti-air), Splitter, Healer, Shielded, plus Mini-Boss / Boss / Elite Boss on milestone waves.

## Architecture

Everything hangs off a single global namespace (`window.TD`) so there are no scattered globals. Each system lives in its own file and content is data-driven:

| File | Responsibility |
|------|----------------|
| `js/config.js` | All towers, enemies, waves, upgrades, difficulty as **data** — add content here without touching logic |
| `js/economy.js` | Gold, lives, interest, refunds |
| `js/map.js` | Grid, path waypoints, buildability, aerial lane |
| `js/enemy.js` | Enemy movement, status effects, death, splitting/healing/shields |
| `js/tower.js` | Stat computation, targeting, firing, upgrades, evolution, support auras |
| `js/projectile.js` | Projectiles, splash, chain lightning, on-hit effects |
| `js/wave.js` | Spawning, scaling, wave previews |
| `js/effects.js` | Particles, floating numbers, arcs, screen shake |
| `js/audio.js` | Web Audio synthesized SFX + music |
| `js/renderer.js` | All canvas drawing |
| `js/input.js` | Mouse + keyboard |
| `js/ui.js` | DOM HUD, toolbar, side panel, tooltips |
| `js/upgrades.js` | Tower info + upgrade tree rendering |
| `js/save.js` | localStorage autosave / load |
| `js/game.js` | Main loop, state, orchestration |

## Extending

- **New tower:** add an entry to `TD.TOWERS` in `config.js` and its key to `TD.TOWER_ORDER`. Define base stats, per-level growth, and two evolution branches.
- **New enemy:** add to `TD.ENEMIES`. Special behaviors (`split`, `heal`, `shield`, `flying`, `boss`, `regen`) are picked up automatically.
- **New wave:** append to `TD.WAVES`, or adjust `TD.buildProceduralWave` for the endless tail.

The structure is intentionally ready for future maps, endless/campaign modes, hero units, and modifiers without core refactoring.

## Notes
Graphics are drawn on the canvas and audio is synthesized at runtime, so the `assets/` folders are empty by default — drop in your own art/sound there if you want to reskin.
