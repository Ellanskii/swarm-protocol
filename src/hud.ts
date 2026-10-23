// DOM HUD. Every write goes through a cache so unchanged values don't touch the DOM.
import { WEAPONS, WEAPON_ORDER } from './config';
import { dashCooldown } from './player';
import { G, P, curWeapon, magSize } from './state';
import { UPGRADES } from './upgrades';
import { $, fmtTime } from './utils';

const el = {
  hpfill: $('hpfill'), hptext: $('hptext'), xpfill: $('xpfill'), lvl: $('lvl'),
  timer: $('timer'), kills: $('kills'), dashfill: $('dashfill'),
  wname: $('wname'), ammo: $('ammo'), slots: $('slots'), ups: $('ups'),
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
  set('hpt', `${Math.ceil(P.hp)} / ${P.maxHp}${G.god ? ' · GOD' : ''}`, v => { el.hptext.textContent = v; });
  set('xp', (P.xp / P.xpNext * 100).toFixed(1), v => { el.xpfill.style.width = v + '%'; });
  set('lvl', 'УР ' + P.level, v => { el.lvl.textContent = v; });
  set('time', fmtTime(G.time), v => { el.timer.textContent = v; });
  set('kills', G.kills + ' убито', v => { el.kills.textContent = v; });
  set('dash', ((1 - Math.max(0, P.dashCd) / dashCooldown()) * 100).toFixed(0), v => { el.dashfill.style.width = v + '%'; });

  const w = curWeapon();
  set('wname', w.d.name, v => { el.wname.textContent = v; });
  set('ammo', `${w.reloading ? '—' : w.ammo} <small>/ ${magSize(w.d)}</small>`, v => { el.ammo.innerHTML = v; });
  set('perfect', w.perfect > 0, v => { el.ammo.classList.toggle('perfect', v); });
  set('reloading', w.reloading, v => { el.reload.hidden = !v; el.cross.classList.toggle('rl', v); });
  if (w.reloading) {
    el.rzone.style.left = w.arS * 100 + '%';
    el.rzone.style.width = (w.arE - w.arS) * 100 + '%';
    el.rzone.classList.toggle('used', w.arUsed);
    el.rmark.style.left = Math.min(100, (w.t / w.dur) * 100) + '%';
  }

  const slotsKey = G.cur + ':' + WEAPON_ORDER.filter(id => G.owned[id]).join(',');
  set('slots', slotsKey, () => {
    el.slots.innerHTML = WEAPON_ORDER.map(id => {
      const cls = [id === G.cur ? 'on' : '', G.owned[id] ? '' : 'locked'].join(' ');
      return `<span class="${cls}">${WEAPONS[id].key} ${WEAPONS[id].name}</span>`;
    }).join('');
  });

  const owned = UPGRADES.filter(u => G.upLv[u.id] && !u.weapon);
  set('ups', owned.map(u => u.id + G.upLv[u.id]).join(','), () => {
    el.ups.innerHTML = owned.map(u => `<span>${u.name} <b>${G.upLv[u.id]}</b></span>`).join('');
  });

  const boss = G.enemies.find(e => e.boss && !e.dead);
  set('boss', !!boss, v => { el.boss.hidden = !v; });
  if (boss) el.bossfill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
}
