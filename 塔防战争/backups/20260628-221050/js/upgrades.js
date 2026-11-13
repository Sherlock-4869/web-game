/* ============================================================
   upgrades.js — renders the selected tower's info + upgrade tree,
   and wires upgrade / evolve / sell / target-mode buttons.
   ============================================================ */
(function (TD) {
  const Upgrades = {
    /* Build the HTML for the tower info panel. */
    render(tower, game) {
      if (!tower) return '';
      const up = tower.canUpgrade();
      const cost = tower.upgradeCost();
      const afford = game.economy.canAfford(cost);
      const dt = tower.dotInfo, bn = tower.burnInfo;

      const statRow = (k, v) => `<div class="row"><span class="k">${k}</span><span>${v}</span></div>`;
      const hpRow = `<div class="row"><span class="k">Hit points</span><span data-live="hp">${Math.ceil(tower.hp)} / ${tower.maxHp}</span></div>`;
      const mcNote = tower.mindControlled > 0
        ? `<div class="muted" style="color:#c07bff;font-size:.8rem;margin:4px 0">☠ Mind-controlled — taking damage reverts its upgrades!</div>` : '';
      let stats = hpRow;
      if (!tower.isSupport) {
        stats += statRow('Damage', tower.damage.toFixed(0));
        stats += statRow('Fire rate', tower.fireRate.toFixed(2) + '/s');
        stats += statRow('Range', tower.range.toFixed(0));
        stats += statRow('Crit', (tower.crit * 100).toFixed(0) + '%');
        if (tower.splash > 0) stats += statRow('Splash', tower.splash.toFixed(0));
        if (dt) stats += statRow('Poison', dt.dps.toFixed(0) + ' dps');
        if (bn) stats += statRow('Burn', bn.dps.toFixed(0) + ' dps');
        if (tower.def.base.chain) stats += statRow('Chain', '✓');
        if (tower.fuelMax > 0) stats += `<div class="row"><span class="k">Fuel</span><span data-live="fuel">${Math.ceil(tower.fuel)}s</span></div>`;
        stats += `<div class="row"><span class="k">Kills</span><span data-live="kills">${tower.kills}</span></div>`;
        stats += `<div class="row"><span class="k">Damage done</span><span data-live="dmg">${Math.round(tower.damageDone).toLocaleString()}</span></div>`;
      } else {
        // Support tower: a pulse that cleanses + buffs nearby towers for 5s
        const pb = tower.pulseBuff();
        stats += statRow('Pulse range', tower.range.toFixed(0));
        stats += statRow('Pulse every', tower.pulsePeriod() + 's');
        stats += statRow('Buff lasts', '5s');
        stats += statRow('Pulse +Dmg', (pb.damage * 100).toFixed(0) + '%');
        stats += statRow('Pulse +Fire rate', (pb.fireRate * 100).toFixed(0) + '%');
        stats += statRow('Aura +Range', (pb.range * 100).toFixed(0) + '% (steady)');
        stats += statRow('Pulse +Crit', (pb.crit * 100).toFixed(0) + '%');
        stats += statRow('Cleanse', 'Freeze · Mind Control · Shutdown');
        if (tower.level >= 3) stats += statRow('Special', 'Archer +1 arrow · Tesla wider chain');
      }

      const wrap = (acts) => `
        <div class="ti-head">
          <div class="ti-name" style="color:${tower.displayColor}">${tower.displayName}</div>
          <div class="ti-level">Lv ${tower.level}${tower.evolution ? ' ★' : ''}</div>
        </div>
        <div class="muted" style="font-size:.78rem">${tower.evolution ? tower._evo().desc : tower.def.desc}</div>
        ${mcNote}
        <div class="ti-stats">${stats}</div>
        <div class="ti-actions">${acts}</div>`;

      // sell button (two-click confirm)
      const confirming = game._sellConfirmId === tower.id;
      const sellBtn = `<button class="btn sell-btn${confirming ? ' confirm' : ''}" data-act="sell">${confirming ? '⚠ Confirm sell · +' + tower.sellValue() + 'g' : '💰 Sell · +' + tower.sellValue() + 'g'}</button>`;

      let actions = '';
      // Burned-down / rebuilding state takes over the action area
      if (tower.repairing > 0) {
        actions += `<div class="muted" style="color:#6ee7ff;text-align:center;font-size:.85rem;padding:4px">🔧 Rebuilding… <span data-live="repair">${Math.ceil(tower.repairing)}s</span></div>`;
        actions += sellBtn;
        return wrap(actions);
      }
      if (tower.burnedDown) {
        const rc = tower.repairCost(), canRepair = game.economy.canAfford(rc);
        const prog = Math.round(tower.repairProgress * 100);
        actions += `<div class="muted" style="color:#ff7a2a;text-align:center;font-size:.85rem;padding:2px">🔥 Burned down — offline</div>`;
        actions += `<div class="muted" style="color:#6ee7ff;text-align:center;font-size:.78rem">Support rebuild: <span data-live="rebuild">${prog}</span>%</div>`;
        actions += `<button class="btn btn-primary up-btn" data-act="repair" ${canRepair ? '' : 'disabled'}>
          <span>🔧 Repair · ${tower.repairTime()}s</span><span class="cost">${rc}g</span></button>`;
        actions += sellBtn;
        return wrap(actions);
      }
      if (up) {
        actions += `<button class="btn btn-primary up-btn" data-act="upgrade" ${afford ? '' : 'disabled'}>
          <span>⬆ Upgrade · Lv ${tower.level + 1}</span><span class="cost">${cost}g</span></button>`;
      } else if (tower.canEvolve()) {
        const ev = tower.def.evolve;
        const keys = Object.keys(ev);
        const evCost = Math.round(tower.upgradeCost() * 2.2);
        actions += `<div class="muted" style="font-size:.8rem;margin:2px 0">Choose specialization (${evCost}g):</div><div class="evolve-box">`;
        for (const k of keys) {
          const can = game.economy.canAfford(evCost);
          actions += `<button class="btn" data-act="evolve" data-branch="${k}" ${can ? '' : 'disabled'} title="${ev[k].desc}">
            <span>${ev[k].name}</span><small>${evCost}g</small></button>`;
        }
        actions += `</div>`;
      } else {
        actions += `<div class="muted" style="font-size:.85rem;text-align:center;padding:4px">★ Fully evolved: <b style="color:#ffcf4a">${tower.displayName}</b></div>`;
      }

      // target mode selector (non-support)
      let targeting = '';
      if (!tower.isSupport) {
        const modes = [['first','First'],['last','Last'],['strong','Strong'],['weak','Weak']];
        targeting = `<div class="muted" style="font-size:.75rem;margin-top:6px">Target priority</div>
          <div class="evolve-box" style="margin-top:2px">` +
          modes.map(([m,l]) => `<button class="btn" data-act="target" data-mode="${m}" style="${tower.targetMode===m?'border-color:#6ee7ff;color:#6ee7ff':''}">${l}</button>`).join('') +
          `</div>`;
      }

      actions += targeting;
      actions += sellBtn;

      return wrap(actions);
    },

    /* Wire up the buttons inside the rendered panel. */
    bind(panel, tower, game) {
      panel.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          if (act === 'upgrade') game.upgradeSelected();
          else if (act === 'evolve') game.evolveSelected(btn.dataset.branch);
          else if (act === 'repair') game.repairSelected();
          else if (act === 'sell') game.sellSelected();
          else if (act === 'target') { tower.targetMode = btn.dataset.mode; game.ui.refreshTowerInfo(); }
        });
      });
    },
  };

  TD.Upgrades = Upgrades;
})(window.TD);
