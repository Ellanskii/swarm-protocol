// DOM HUD. Every write goes through a cache so unchanged values don't touch the DOM.
import * as THREE from 'three';
import { MECHS, PACING, WEAPON_ORDER } from './config';
import { dashCooldown } from './player';
import { camera } from './scene';
import { shoulderName } from './shoulders';
import { G, P, S, magSize } from './state';
import { UPGRADES } from './upgrades';
import { $, fmtTime } from './utils';

const el = {
  hpfill: $('hpfill'), hptext: $('hptext'), shieldfill: $('shieldfill'), dash: $('dash'), xpfill: $('xpfill'), lvl: $('lvl'),
  timer: $('timer'), kills: $('kills'), loot: $('loot'), goal: $('goal'), dashfill: $('dashfill'),
  ammo: $('ammo'), slots: $('slots'), ups: $('ups'),
  reload: $('reload'), rzone: $('rzone'), rmark: $('rmark'),
  vent: $('vent'), vzone: $('vzone'), vmark: $('vmark'), heat: $('heat'), heatfill: $('heatfill'),
  boss: $('boss'), bossfill: $('bossfill'), bossname: $('bossname'), bossArrow: $('bossArrow'), cross: $('cross'),
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

  // one row per mounted arm weapon: name, level, ammo or heat
  const r = G.reload, v = G.vent;
  const arms = WEAPON_ORDER.flatMap(id => G.owned[id] ?? []);
  const heatPct = Math.round(G.heat * 100), hot = G.heat >= S.hotAt;
  const ammo = arms.map(w => w.d.heat
    ? `<div${hot ? ' class="hot"' : ''}><span>${w.d.name} <b>${w.lv}</b></span><span class="mono">${heatPct} <small>% тепла</small></span></div>`
    : `<div><span>${w.d.name} <b>${w.lv}</b></span><span class="mono">${r.on ? '—' : w.ammo} <small>/ ${magSize(w.d)}</small></span></div>`,
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

  const heated = arms.some(w => w.d.heat);
  set('heated', heated, h => { el.heat.hidden = !h; });
  set('hotAt', S.hotAt, v => { el.heat.style.setProperty('--hot', v * 100 + '%'); });
  if (heated) {
    el.heatfill.style.width = G.heat * 100 + '%';
    set('heatState', v.on ? 'vent' : hot ? 'hot' : '', s => { el.heat.className = s; });
  }
  set('venting', v.on, on => { el.vent.hidden = !on; });
  if (v.on) {
    el.vzone.style.left = v.arS * 100 + '%';
    el.vzone.style.width = (v.arE - v.arS) * 100 + '%';
    el.vzone.classList.toggle('used', v.arUsed);
    el.vmark.style.left = Math.min(100, (v.t / v.dur) * 100) + '%';
  }

  set('slots', G.shoulders.map(s => s.id + s.lv + (s.evo ? 'e' : '')).join(','), () => {
    el.slots.innerHTML = G.shoulders.map(s => `<span class="sh${s.evo ? ' evo' : ''}">${shoulderName(s)} <b>${s.lv}</b></span>`).join('');
  });

  const owned = UPGRADES.filter(u => G.upLv[u.id] && !u.kind);
  set('ups', owned.map(u => u.id + G.upLv[u.id]).join(','), () => {
    el.ups.innerHTML = owned.map(u => `<span>${u.name} <b>${G.upLv[u.id]}</b></span>`).join('');
  });

  // run goal: which forge is next and when; the third one is the final, beating it means evacuation
  const boss = G.enemies.find(e => e.boss && !e.dead);
  const total = PACING.bossCount;
  let goal: string, cls = '';
  if (G.evacT > 0) { goal = 'Эвакуация'; cls = 'evac'; }
  else if (boss) { goal = `Кузня ${G.bossN}/${total}${boss.final ? ' · финал' : ''}: уничтожь`; cls = boss.final ? 'final' : ''; }
  else if (G.bossN < total) {
    const final = G.bossN + 1 === total;
    goal = `Кузня ${G.bossN + 1}/${total}${final ? ' · финал' : ''} через ${fmtTime(Math.max(0, G.nextBoss - G.time))}`;
  } else goal = '';
  set('goal', goal + cls, () => { el.goal.textContent = goal; el.goal.className = cls; });

  set('boss', !!boss, v => { el.boss.hidden = !v; });
  set('bossname', boss ? (boss.final ? 'ФИНАЛЬНАЯ КУЗНЯ' : `КУЗНЯ ${G.bossN}/${total}`) : '', n => { el.bossname.textContent = n; });
  if (boss) el.bossfill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
  bossArrow(boss);
}

const ndc = new THREE.Vector3();
/** Arrow on the screen edge toward an off-screen boss. */
function bossArrow(boss: { x: number; z: number } | undefined): void {
  let show = false;
  if (boss) {
    ndc.set(boss.x, 1, boss.z).project(camera);
    // behind the camera the projection flips; the camera never looks up, so only clamp what's in front
    show = Math.abs(ndc.x) > 0.95 || Math.abs(ndc.y) > 0.95 || ndc.z > 1;
    if (show) {
      const pad = 0.88, k = pad / Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
      const x = ndc.x * k, y = ndc.y * k;
      const px = (x + 1) / 2 * innerWidth, py = (1 - y) / 2 * innerHeight;
      el.bossArrow.style.transform = `translate(${px}px, ${py}px) rotate(${Math.atan2(x, y)}rad)`;
    }
  }
  set('bossArrow', show, v => { el.bossArrow.hidden = !v; });
}
