// Upgrade pool and the level-up screen.
import { sfx } from './audio';
import { SHOULDERS, WEAPONS, WEAPON_LEVELS, type ShoulderId, type WeaponId } from './config';
import { mouse } from './input';
import { freeShoulderSlot, installShoulder } from './shoulders';
import { G, P, S, armWeapons, magSize } from './state';
import { $ } from './utils';
import { freeArmSlot, giveWeapon, levelBarrels } from './weapons';

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  /** New arm weapon or shoulder system: shown with its own card style and tag. */
  kind?: 'weapon' | 'shoulder';
  /** Extra condition to appear in the pool. */
  avail?(): boolean;
  /** Current level when it is tracked outside `G.upLv` (mounted weapons and systems). */
  level?(): number;
  apply(): void;
}

const WEAPON_DESC: Record<WeaponId, string> = {
  mg: 'Ручное оружие. Быстрые одиночные выстрелы, большой магазин',
  cannon: 'Ручное оружие. Тяжёлые снаряды прошивают врага насквозь',
  shotgun: 'Ручное оружие. Семь дробин, вблизи разносит всё',
};

/** Needs a free arm unless already mounted, then it levels up. */
const weaponUp = (id: WeaponId): Upgrade => ({
  id, name: WEAPONS[id].name, max: WEAPON_LEVELS.max, kind: 'weapon',
  get desc() {
    const w = G.owned[id];
    if (!w) return WEAPON_DESC[id];
    const extra = levelBarrels(w.lv + 1) > levelBarrels(w.lv) ? (w.d.pellets > 1 ? ' и ещё две дробины' : ' и ещё один ствол') : '';
    return `+${WEAPON_LEVELS.dmg * 100}% урона${extra}`;
  },
  avail: () => !!G.owned[id] || freeArmSlot() !== null,
  level: () => G.owned[id]?.lv ?? 0,
  apply: () => giveWeapon(id),
});

/** Needs a free shoulder slot unless already mounted, then it levels up. */
const shoulderUp = (id: ShoulderId): Upgrade => ({
  id, name: SHOULDERS[id].name, desc: SHOULDERS[id].desc, max: SHOULDERS[id].max, kind: 'shoulder',
  avail: () => G.shoulders.some(s => s.id === id) || freeShoulderSlot() !== null,
  level: () => G.shoulders.find(s => s.id === id)?.lv ?? 0,
  apply: () => installShoulder(id),
});

export const UPGRADES: Upgrade[] = [
  { id: 'dmg', name: 'Калибр', desc: '+20% урона всем оружием', max: 8, apply: () => { S.dmg *= 1.2; } },
  { id: 'rate', name: 'Облегчённый затвор', desc: '+15% к скорострельности', max: 8, apply: () => { S.rate *= 1.15; } },
  {
    id: 'mag', name: 'Длинный магазин', desc: '+35% патронов в магазине', max: 5,
    apply: () => {
      S.mag *= 1.35;
      for (const w of armWeapons()) w.ammo = magSize(w.d);
      G.reload.on = false;
    },
  },
  { id: 'reload', name: 'Быстрые руки', desc: 'Перезарядка на 20% быстрее, жёлтая зона шире', max: 5, apply: () => { S.reload *= 1.2; S.arW += 0.03; } },
  { id: 'multi', name: 'Сдвоенный ствол', desc: '+1 пуля за выстрел, дробовику +2 дробины', max: 4, apply: () => { S.multi++; } },
  { id: 'pierce', name: 'Бронебойные', desc: 'Пуля прошивает ещё одного врага', max: 4, apply: () => { S.pierce++; } },
  { id: 'crit', name: 'Слабые места', desc: '+10% шанс крита, крит наносит ×2.2', max: 5, apply: () => { S.crit += 0.1; } },
  { id: 'explode', name: 'Разрывные', desc: '+12% шанс, что попадание взорвётся', max: 5, apply: () => { S.explode += 0.12; } },
  { id: 'aura', name: 'Статическое поле', desc: 'Бьёт током всех рядом. С каждым уровнем шире и больнее', max: 5, apply: () => { S.aura++; } },
  { id: 'speed', name: 'Сервоприводы', desc: '+10% к скорости бега', max: 5, apply: () => { S.speed *= 1.1; } },
  { id: 'hp', name: 'Бронепластины', desc: '+25 к максимуму HP и полное лечение', max: 6, apply: () => { P.maxHp += 25; P.hp = P.maxHp; } },
  { id: 'regen', name: 'Нанорегенерация', desc: '+1 HP в секунду', max: 5, apply: () => { S.regen += 1; } },
  { id: 'magnet', name: 'Магнит', desc: '+50% к радиусу сбора опыта', max: 4, apply: () => { S.magnet *= 1.5; } },
  { id: 'dash', name: 'Ускоритель', desc: 'Рывок перезаряжается на 25% быстрее', max: 3, apply: () => { S.dashMul *= 0.75; } },
  weaponUp('mg'),
  weaponUp('cannon'),
  weaponUp('shotgun'),
  shoulderUp('rockets'),
  shoulderUp('mortar'),
  shoulderUp('drone'),
];

const FALLBACK: Upgrade = { id: 'heal', name: 'Аптечка', desc: 'Полное лечение', max: Infinity, apply: () => { P.hp = P.maxHp; } };
/** Weapons and shoulder systems show up a bit more often than stat upgrades. */
const weight = (u: Upgrade) => (u.kind ? 1.6 : 1);

const levelOf = (u: Upgrade): number => u.level?.() ?? G.upLv[u.id] ?? 0;

let choices: Upgrade[] = [];

function rollChoices(): Upgrade[] {
  const pool = UPGRADES.filter(u => levelOf(u) < u.max && (u.avail?.() ?? true));
  if (G.allUps) return pool.length ? pool : [FALLBACK];
  const out: Upgrade[] = [];
  while (out.length < 3 && pool.length) {
    let r = Math.random() * pool.reduce((s, u) => s + weight(u), 0);
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { r -= weight(pool[i]); if (r <= 0) { idx = i; break; } }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out.length ? out : [FALLBACK];
}

const screen = $('levelup');
const cards = $('cards');

export function openLevelUp(): void {
  G.state = 'levelup';
  mouse.down = false;
  document.body.classList.add('menu');
  choices = rollChoices();
  cards.classList.toggle('all', G.allUps);
  cards.replaceChildren(...choices.map((u, i) => {
    const lv = levelOf(u);
    const b = document.createElement('button');
    b.className = 'card' + (u.kind ? ' weapon' : '');
    const tag = lv ? `УР ${lv} → ${lv + 1}` : u.kind === 'weapon' ? 'НОВОЕ ОРУЖИЕ · РУКА' : u.kind === 'shoulder' ? 'НОВОЕ · ПЛЕЧО' : 'НОВОЕ';
    b.innerHTML = `<small>${i + 1}</small><h3>${u.name}</h3><p>${u.desc}</p><em>${tag}</em>`;
    b.addEventListener('click', () => choose(i));
    return b;
  }));
  screen.hidden = false;
  sfx('level');
}

export function choose(i: number): void {
  const u = choices[i];
  if (!u || G.state !== 'levelup') return;
  u.apply();
  G.upLv[u.id] = (G.upLv[u.id] ?? 0) + 1;
  G.pendingLevels--;
  if (G.pendingLevels > 0) { openLevelUp(); return; }
  screen.hidden = true;
  G.state = 'play';
  document.body.classList.remove('menu');
  mouse.down = false;
}
