// DOM HUD. Every write goes through a cache so unchanged values don't touch the DOM.
import { MECHS, SHOULDERS, WEAPON_ORDER } from './config';
import { dashCooldown } from './player';
import { G, P, magSize } from './state';
import { UPGRADES } from './upgrades';
import { $, fmtTime } from './utils';

const el = {
  hpfill: $('hpfill'), hptext: $('hptext'), shieldfill: $('shieldfill'), dash: $('dash'), xpfill: $('xpfill'), lvl: $('lvl'),
  timer: $('timer'), kills: $('kills'), loot: $('loot'), dashfill: $('dashfill'),
  ammo: $('ammo'), slots: $('slots'), ups: $('ups'),
  reload: $('reload'), rzone: $('rzone'), rmark: $('rmark'),
  boss: $('boss'), bossfill: $('bossfill'), cross: $('cross'),
};

const cache = new Map<string, unknown>();
function set<T>(key: string, value: T, apply: (v: T) => void): void {
  if (cache.get(key) === value) return;
  cache.set(key, value);
  apply(value);
}

export function resetHUD(): void {
  cache.clear();
}

export function updateHUD(): void {
  set('hp', (P.hp / P.maxHp * 100).toFixed(1), v => { el.hpfill.style.width = v + '%'; });
  set('shield', P.maxShield ? (P.shield / P.maxShield * 100).toFixed(1) : '', v => {
    el.shieldfill.hidden = !v;
    el.shieldfill.style.width = v + '%';
  });
  const sh = P.maxShield ? ` +${Math.ceil(P.shield)}` : '';
  set('hpt', `${Math.ceil(P.hp)} / ${P.maxHp}${sh}${G.god ? ' · GOD' : ''}`, v => { el.hptext.textContent = v; });
  set('xp', (P.xp / P.xpNext * 100).toFixed(1), v => { el.xpfill.style.width = v + '%'; });
  set('lvl', 'УР ' + P.level, v => { el.lvl.textContent = v; });
  set('time', fmtTime(G.time), v => { el.timer.textContent = v; });
  set('kills', G.kills + ' убито', v => { el.kills.textContent = v; });
  set('loot', `${G.loot.scrap}:${G.loot.cores}`, () => {
    const cores = G.loot.cores ? ` <span class="cur core"></span>${G.loot.cores}` : '';
    el.loot.innerHTML = G.loot.scrap || G.loot.cores ? `<span class="cur scrap"></span>${G.loot.scrap}${cores}` : '';
  });
  // one bar split into charge segments; the recharging charge fills the next segment
  const charges = MECHS[G.mech].dash.charges;
  const partial = P.dashCharges < charges ? 1 - Math.max(0, P.dashCd) / dashCooldown() : 0;
  set('dash', (((P.dashCharges + partial) / charges) * 100).toFixed(0), v => { el.dashfill.style.width = v + '%'; });
  set('dashN', charges, v => { el.dash.style.setProperty('--n', String(v)); });

  // one row per mounted arm weapon: name, level, ammo
  const r = G.reload;
  const arms = WEAPON_ORDER.flatMap(id => G.owned[id] ?? []);
  const ammo = arms.map(w =>
    `<div><span>${w.d.name} <b>${w.lv}</b></span><span class="mono">${r.on ? '—' : w.ammo} <small>/ ${magSize(w.d)}</small></span></div>`,
  ).join('');
  set('ammo', ammo, v => { el.ammo.innerHTML = v; });
  set('perfect', r.perfect, v => { el.ammo.classList.toggle('perfect', v); });
  set('reloading', r.on, v => { el.reload.hidden = !v; el.cross.classList.toggle('rl', v); });
  if (r.on) {
    el.rzone.style.left = r.arS * 100 + '%';
    el.rzone.style.width = (r.arE - r.arS) * 100 + '%';
    el.rzone.classList.toggle('used', r.arUsed);
    el.rmark.style.left = Math.min(100, (r.t / r.dur) * 100) + '%';
  }

  set('slots', G.shoulders.map(s => s.id + s.lv).join(','), () => {
    el.slots.innerHTML = G.shoulders.map(s => `<span class="sh">${SHOULDERS[s.id].name} <b>${s.lv}</b></span>`).join('');
  });

  const owned = UPGRADES.filter(u => G.upLv[u.id] && !u.kind);
  set('ups', owned.map(u => u.id + G.upLv[u.id]).join(','), () => {
    el.ups.innerHTML = owned.map(u => `<span>${u.name} <b>${G.upLv[u.id]}</b></span>`).join('');
  });

  const boss = G.enemies.find(e => e.boss && !e.dead);
  set('boss', !!boss, v => { el.boss.hidden = !v; });
  if (boss) el.bossfill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
}
