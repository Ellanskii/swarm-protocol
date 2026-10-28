// Upgrade pool and the level-up screen.
import { sfx } from './audio';
import { DASH_LEVELS, EVOLUTIONS, MAX_LEVEL, SHOULDERS, WEAPONS, WEAPON_LEVELS, type BaseWeaponId, type EvoDef, type ShoulderId, type WeaponId } from './config';
import { icon } from './icons';
import { mouse } from './input';
import { freeShoulderSlot, installShoulder } from './shoulders';
import { G, P, S, armWeapons, magSize, type DashMod } from './state';

const hasAmmoWeapon = (): boolean => armWeapons().some(w => !w.d.heat);
const hasHeatWeapon = (): boolean => armWeapons().some(w => !!w.d.heat);
import { upgradeUnlocked } from './tech';
import { $ } from './utils';
import { evolveWeapon, freeArmSlot, giveWeapon, levelBarrels } from './weapons';

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  /** Arm weapon, shoulder system, dash module or evolution: shown with its own card style and tag. */
  kind?: 'weapon' | 'shoulder' | 'dash' | 'evo';
  /** Extra condition to appear in the pool. */
  avail?(): boolean;
  /** Current level when it is tracked outside `G.upLv` (mounted weapons and systems). */
  level?(): number;
  apply(): void;
}

const WEAPON_DESC: Record<BaseWeaponId, string> = {
  mg: 'Ручное оружие. Быстрые одиночные выстрелы, большой магазин',
  cannon: 'Ручное оружие. Тяжёлые снаряды прошивают врага насквозь',
  shotgun: 'Ручное оружие. Семь дробин, вблизи разносит всё',
  laser: 'Ручное оружие. Непрерывный луч прожигает всех на линии и игнорирует щиты, но вязнет в броне',
  railgun: 'Ручное оружие. Редкий мощный выстрел прошивает всё на линии, броня ему почти не мешает',
  launcher: 'Ручное оружие. Ракеты взрываются при попадании и бьют по площади',
  flamethrower: 'Ручное оружие. Короткая широкая струя огня поджигает всех на пути, горящих броня не защищает',
};

const evoOf = (base: WeaponId | ShoulderId): EvoDef | undefined => Object.values(EVOLUTIONS).find(e => e.base === base);
/** Catalyst of an evolution: a run upgrade taken, or an arm weapon mounted. */
const hasCatalyst = (e: EvoDef): boolean => (G.upLv[e.needs] ?? 0) > 0 || !!G.owned[e.needs as WeaponId];
const evoHint = (base: WeaponId | ShoulderId): string => {
  const e = evoOf(base);
  return e ? `. На максимуме вместе с «${e.needsName}» эволюционирует в «${e.name}»` : '';
};

/** Needs a free arm unless already mounted, then it levels up. Gone once it evolved. */
const weaponUp = (id: BaseWeaponId): Upgrade => ({
  id, name: WEAPONS[id].name, max: WEAPON_LEVELS.max, kind: 'weapon',
  get desc() {
    const w = G.owned[id];
    if (!w) return WEAPON_DESC[id];
    const more = w.d.beam ? ' и шире луч' : w.d.ignite ? ' и ещё две струи' : w.d.pellets > 1 ? ' и ещё две дробины' : ' и ещё один ствол';
    const extra = levelBarrels(w.lv + 1) > levelBarrels(w.lv) ? more : '';
    return `+${WEAPON_LEVELS.dmg * 100}% урона${extra}${w.lv + 1 === WEAPON_LEVELS.max ? evoHint(id) : ''}`;
  },
  avail: () => {
    const into = evoOf(id)?.into;
    return !(into && G.owned[into]) && (!!G.owned[id] || freeArmSlot() !== null);
  },
  level: () => G.owned[id]?.lv ?? 0,
  apply: () => giveWeapon(id),
});

/** Needs a free shoulder slot unless already mounted, then it levels up. */
const shoulderUp = (id: ShoulderId): Upgrade => ({
  id, name: SHOULDERS[id].name, max: SHOULDERS[id].max, kind: 'shoulder',
  get desc() {
    const lv = G.shoulders.find(s => s.id === id)?.lv ?? 0;
    return SHOULDERS[id].desc + (lv + 1 === SHOULDERS[id].max ? evoHint(id) : '');
  },
  avail: () => G.shoulders.some(s => s.id === id) || freeShoulderSlot() !== null,
  level: () => G.shoulders.find(s => s.id === id)?.lv ?? 0,
  apply: () => installShoulder(id),
});

/** A dash module: picking it replaces the plain dash, picking it again levels it up. */
const dashUp = (id: Exclude<DashMod, 'dash'>, name: string, desc: string): Upgrade => ({
  id, name, max: MAX_LEVEL, kind: 'dash',
  get desc() {
    return G.dashMod === id
      ? `Рывок длиннее на ${DASH_LEVELS.reach * 100}%, урон рывка +${DASH_LEVELS.dmg * 100}%`
      : desc;
  },
  avail: () => G.dashMod === 'dash' || G.dashMod === id,
  level: () => (G.dashMod === id ? G.dashLv : 0),
  apply: () => { G.dashMod = id; G.dashLv++; },
});

export const UPGRADES: Upgrade[] = [
  { id: 'dmg', name: 'Калибр', desc: '+34% урона всем оружием', max: MAX_LEVEL, apply: () => { S.dmg *= 1.34; } },
  { id: 'rate', name: 'Облегчённый затвор', desc: '+25% к скорострельности', max: MAX_LEVEL, apply: () => { S.rate *= 1.25; } },
  {
    id: 'mag', name: 'Длинный магазин', desc: '+35% патронов в магазине', max: MAX_LEVEL, avail: hasAmmoWeapon,
    apply: () => {
      S.mag *= 1.35;
      for (const w of armWeapons()) w.ammo = magSize(w.d);
      G.reload.on = false;
    },
  },
  { id: 'reload', name: 'Быстрые руки', desc: 'Перезарядка на 20% быстрее, жёлтая зона шире', max: MAX_LEVEL, avail: hasAmmoWeapon, apply: () => { S.reload *= 1.2; S.arW += 0.03; } },
  { id: 'cooling', name: 'Теплоотвод', desc: 'Энергетическое оружие греется на 10% меньше и остывает на 20% быстрее', max: MAX_LEVEL, avail: hasHeatWeapon, apply: () => { S.heat *= 0.9; S.cool *= 1.2; } },
  { id: 'multi', name: 'Сдвоенный ствол', desc: '+1 пуля за выстрел, дробовику +2 дробины', max: MAX_LEVEL, apply: () => { S.multi++; } },
  { id: 'pierce', name: 'Бронебойные', desc: 'Пуля прошивает ещё одного врага', max: MAX_LEVEL, apply: () => { S.pierce++; } },
  { id: 'crit', name: 'Слабые места', desc: '+10% шанс крита, крит наносит ×2.2', max: MAX_LEVEL, apply: () => { S.crit += 0.1; } },
  { id: 'explode', name: 'Разрывные', desc: '+12% шанс, что попадание взорвётся', max: MAX_LEVEL, apply: () => { S.explode += 0.12; } },
  { id: 'aura', name: 'Тесла-катушка', desc: 'Бьёт током всех рядом. С каждым уровнем шире и больнее', max: MAX_LEVEL, apply: () => { S.aura++; } },
  { id: 'speed', name: 'Сервоприводы', desc: '+10% к скорости бега', max: MAX_LEVEL, apply: () => { S.speed *= 1.1; } },
  { id: 'hp', name: 'Бронепластины', desc: '+30 к максимуму HP и полное лечение', max: MAX_LEVEL, apply: () => { P.maxHp += 30; P.hp = P.maxHp; } },
  { id: 'regen', name: 'Ремонтные наниты', desc: '+1 HP в секунду', max: MAX_LEVEL, apply: () => { S.regen += 1; } },
  { id: 'magnet', name: 'Магнит', desc: '+38% к радиусу сбора опыта', max: MAX_LEVEL, apply: () => { S.magnet *= 1.38; } },
  { id: 'pen', name: 'Подкалиберные', desc: 'Пули и снаряды игнорируют 2 единицы брони', max: MAX_LEVEL, avail: hasAmmoWeapon, apply: () => { S.pen += 2; } },
  { id: 'reactive', name: 'Реактивная броня', desc: 'Получив удар, броня взрывается вокруг меха (не чаще раза в 3 с). Уровень усиливает взрыв', max: MAX_LEVEL, apply: () => { S.reactive++; } },
  { id: 'cluster', name: 'Кассетные', desc: 'Каждый взрыв разбрасывает малые бомбы: +1 за уровень', max: MAX_LEVEL, apply: () => { S.cluster++; } },
  { id: 'napalm', name: 'Напалм', desc: 'Взрывы оставляют горящую землю. Уровень усиливает огонь', max: MAX_LEVEL, apply: () => { S.napalm += 0.6; } },
  {
    id: 'eshield', name: 'Энергощит', desc: '+24 к щиту. Щит принимает урон первым и восстанавливается через 3 с без попаданий', max: MAX_LEVEL,
    apply: () => { P.maxShield += 24; P.shield += 24; },
  },
  {
    id: 'capacitors', name: 'Конденсаторы', desc: 'Горячая зона нагрева начинается на 6% раньше, урон в ней ещё +6%', max: MAX_LEVEL, avail: hasHeatWeapon,
    apply: () => { S.hotAt -= 0.06; S.hotDmg += 0.06; },
  },
  { id: 'overload', name: 'Перегрузка', desc: 'Перегрев не ранит меха, а бьёт молнией всех вокруг. Уровень усиливает разряд', max: MAX_LEVEL, avail: hasHeatWeapon, apply: () => { S.overload++; } },
  { id: 'designator', name: 'Целеуказатель', desc: 'Метит самую крепкую машину рядом: она получает +30% урона. +1 цель за уровень', max: MAX_LEVEL, apply: () => { S.mark++; } },
  { id: 'dash', name: 'Ускоритель', desc: 'Рывок перезаряжается на 16% быстрее', max: MAX_LEVEL, apply: () => { S.dashMul *= 0.84; } },
  weaponUp('mg'),
  weaponUp('cannon'),
  weaponUp('shotgun'),
  weaponUp('laser'),
  weaponUp('railgun'),
  weaponUp('launcher'),
  weaponUp('flamethrower'),
  shoulderUp('rockets'),
  shoulderUp('mortar'),
  shoulderUp('drone'),
  shoulderUp('mines'),
  shoulderUp('flak'),
  shoulderUp('repair'),
  // dash modules replace the plain dash; a mech carries only one, and it levels up: longer dash, harder hit
  dashUp('jump', 'Прыжковые двигатели', 'Рывок становится прыжком: неуязвимость в полёте и удар по площади при приземлении'),
  dashUp('ram', 'Таран', 'Рывок сносит машины на пути: урон без учёта брони и отброс'),
  dashUp('phase', 'Фазовый рывок', 'Мгновенный скачок сквозь машины: прожигает их и сбрасывает 30% тепла'),
  dashUp('decoy', 'Приманка', 'Рывок оставляет голограмму: она стягивает ближних машин и через 3 с взрывается'),
  // evolutions: base at max level + a catalyst from another branch
  ...Object.entries(EVOLUTIONS).map(([id, e]): Upgrade => ({
    id, name: e.name, max: 1, kind: 'evo',
    get desc() { return `${e.desc}. ${baseName(e)} + ${e.needsName}`; },
    avail: () => baseMaxed(e) && hasCatalyst(e),
    apply: () => {
      if (e.into) evolveWeapon(e.base as WeaponId, e.into);
      else {
        const sh = G.shoulders.find(s => s.id === e.base);
        if (sh) sh.evo = true;
      }
    },
  })),
];

function baseName(e: EvoDef): string {
  return e.slot === 'arm' ? WEAPONS[e.base as WeaponId].name : SHOULDERS[e.base as ShoulderId].name;
}

function baseMaxed(e: EvoDef): boolean {
  if (e.slot === 'arm') return G.owned[e.base as WeaponId]?.lv === WEAPON_LEVELS.max;
  const sh = G.shoulders.find(s => s.id === e.base);
  return !!sh && !sh.evo && sh.lv >= SHOULDERS[sh.id].max;
}

const FALLBACK: Upgrade = { id: 'heal', name: 'Аптечка', desc: 'Полное лечение', max: Infinity, apply: () => { P.hp = P.maxHp; } };
/** Evolutions are hard to miss once ready; weapons and shoulder systems show up a bit more often than stat upgrades. */
const weight = (u: Upgrade) => (u.kind === 'evo' ? 4 : u.kind ? 1.6 : 1);

const levelOf = (u: Upgrade): number => u.level?.() ?? G.upLv[u.id] ?? 0;

let choices: Upgrade[] = [];

function rollChoices(): Upgrade[] {
  // the debug "all upgrades" mode also ignores the tech tree
  const pool = UPGRADES.filter(u => levelOf(u) < u.max && (u.avail?.() ?? true) && (G.allUps || upgradeUnlocked(u.id)));
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
    b.className = 'card' + (u.kind === 'evo' ? ' evo' : u.kind ? ' weapon' : '');
    const tag = lv ? `УР ${lv} → ${lv + 1}` : u.kind === 'weapon' ? 'НОВОЕ ОРУЖИЕ · РУКА' : u.kind === 'shoulder' ? 'НОВОЕ · ПЛЕЧО' : u.kind === 'dash' ? 'МОДУЛЬ РЫВКА' : u.kind === 'evo' ? 'ЭВОЛЮЦИЯ' : 'НОВОЕ';
    b.innerHTML = `<small>${i + 1}</small><div class="chead"><span class="ibox">${icon(u.id)}</span><h3>${u.name}</h3></div><p>${u.desc}</p><em>${tag}</em>`;
    b.addEventListener('click', () => choose(i));
    return b;
  }));
  screen.hidden = false;
  sfx('level');
}

/** Takes an upgrade one level, as if it was picked on the level-up screen. */
export function takeUpgrade(u: Upgrade): void {
  u.apply();
  G.upLv[u.id] = (G.upLv[u.id] ?? 0) + 1;
}

export function choose(i: number): void {
  const u = choices[i];
  if (!u || G.state !== 'levelup') return;
  takeUpgrade(u);
  G.pendingLevels--;
  if (G.pendingLevels > 0) { openLevelUp(); return; }
  screen.hidden = true;
  G.state = 'play';
  document.body.classList.remove('menu');
  mouse.down = false;
}
