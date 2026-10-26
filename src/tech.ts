// Base tech tree: node data, prices, what each node unlocks, permanent bonuses.
import type { MechId } from './config';
import { persist, save } from './save';
import { P, S } from './state';

export type Branch = 'core' | 'ballistics' | 'rockets' | 'energy' | 'robotics' | 'hull';

export interface TechNode {
  id: string;
  name: string;
  desc: string;
  branch: Branch;
  /** Grid position on the base map; the command center sits at 0,0, +y is down. */
  x: number;
  y: number;
  parent: string | null;
  max: number;
  /** Scrap price of the first level; later levels cost more. */
  scrap: number;
  /** Cores, paid for the first level only. */
  cores?: number;
  /** Run upgrade ids this node adds to the level-up pool. */
  unlocks?: string[];
  mech?: MechId;
  /** Permanent bonus applied at the start of every run. */
  bonus?(lv: number): void;
}

export const TECH: TechNode[] = [
  { id: 'core', name: 'Командный центр', desc: 'Сердце базы. Отсюда расходятся все ветки.', branch: 'core', x: 0, y: 0, parent: null, max: 1, scrap: 0 },

  // ballistics (right): heavy single hits, armor piercing, the active reload
  { id: 'ballistics', name: 'Калибр', desc: '+6% урона всем оружием за уровень', branch: 'ballistics', x: 1, y: 0, parent: 'core', max: 5, scrap: 20, bonus: lv => { S.dmg *= 1 + 0.06 * lv; } },
  { id: 'mg', name: 'Пулемёт', desc: 'В забеге выпадает пулемёт', branch: 'ballistics', x: 2, y: -1, parent: 'ballistics', max: 1, scrap: 40, unlocks: ['mg'] },
  { id: 'flak', name: 'Зенитка', desc: 'В забеге выпадает плечевая зенитка: сбивает вражеские снаряды и дронов-камикадзе', branch: 'ballistics', x: 2, y: 0, parent: 'ballistics', max: 1, scrap: 80, cores: 1, unlocks: ['flak'] },
  { id: 'shotgun', name: 'Дробовик', desc: 'В забеге выпадает дробовик', branch: 'ballistics', x: 2, y: 1, parent: 'ballistics', max: 1, scrap: 60, unlocks: ['shotgun'] },
  { id: 'pierce', name: 'Бронебойные', desc: 'В забеге выпадает апгрейд «Бронебойные»: пули прошивают врагов', branch: 'ballistics', x: 3, y: -1, parent: 'mg', max: 1, scrap: 120, unlocks: ['pierce'] },
  { id: 'autoload', name: 'Автомат заряжания', desc: 'Перезарядка на 6% быстрее за уровень', branch: 'ballistics', x: 3, y: 0, parent: 'flak', max: 5, scrap: 60, bonus: lv => { S.reload *= 1 + 0.06 * lv; } },
  { id: 'multi', name: 'Сдвоенный ствол', desc: 'В забеге выпадает апгрейд «Сдвоенный ствол»', branch: 'ballistics', x: 3, y: 1, parent: 'shotgun', max: 1, scrap: 150, unlocks: ['multi'] },
  { id: 'belts', name: 'Магазинные ленты', desc: '+8% патронов в магазине за уровень', branch: 'ballistics', x: 4, y: 0, parent: 'autoload', max: 3, scrap: 100, bonus: lv => { S.mag *= 1 + 0.08 * lv; } },

  // rockets (up): area damage, cooldowns, jump jets
  { id: 'warheads', name: 'Боеголовки', desc: '+10% к радиусу всех взрывов за уровень', branch: 'rockets', x: 0, y: -1, parent: 'core', max: 3, scrap: 20, bonus: lv => { S.blast *= 1 + 0.1 * lv; } },
  { id: 'rockets', name: 'Ракеты', desc: 'В забеге выпадают плечевые самонаводящиеся ракеты', branch: 'rockets', x: 0, y: -2, parent: 'warheads', max: 1, scrap: 80, cores: 1, unlocks: ['rockets'] },
  { id: 'jump', name: 'Прыжковые двигатели', desc: 'В забеге выпадает модуль рывка: прыжок с неуязвимостью и ударом при приземлении', branch: 'rockets', x: -1, y: -3, parent: 'rockets', max: 1, scrap: 150, cores: 1, unlocks: ['jump'] },
  { id: 'explode', name: 'Разрывные', desc: 'В забеге выпадает апгрейд «Разрывные»: попадания взрываются', branch: 'rockets', x: 0, y: -3, parent: 'rockets', max: 1, scrap: 200, unlocks: ['explode'] },
  { id: 'mortar', name: 'Миномёт', desc: 'В забеге выпадает плечевой миномёт', branch: 'rockets', x: 1, y: -3, parent: 'rockets', max: 1, scrap: 150, cores: 2, unlocks: ['mortar'] },

  // energy (left): ignores shields, chains, weak against armor
  { id: 'reactor', name: 'Реактор', desc: '+5% скорострельности за уровень', branch: 'energy', x: -1, y: 0, parent: 'core', max: 5, scrap: 20, bonus: lv => { S.rate *= 1 + 0.05 * lv; } },
  { id: 'laser', name: 'Лазер', desc: 'В забеге выпадает лазер: луч прожигает всех на линии и игнорирует щиты, но вязнет в броне', branch: 'energy', x: -2, y: -1, parent: 'reactor', max: 1, scrap: 80, cores: 1, unlocks: ['laser', 'cooling'] },
  { id: 'radiators', name: 'Радиаторы', desc: '+20% к скорости остывания энергетического оружия за уровень', branch: 'energy', x: -2, y: 0, parent: 'reactor', max: 3, scrap: 50, bonus: lv => { S.cool *= 1 + 0.2 * lv; } },
  { id: 'aura', name: 'Тесла-катушка', desc: 'В забеге выпадает тесла-катушка: бьёт током всех вокруг меха', branch: 'energy', x: -2, y: 1, parent: 'reactor', max: 1, scrap: 80, cores: 1, unlocks: ['aura'] },
  { id: 'scout', name: 'Прототип «Скаут»', desc: 'Открывает Скаута: лёгкий мех с двумя рывками и жгучим плазменным следом', branch: 'energy', x: -3, y: -1, parent: 'laser', max: 1, scrap: 200, cores: 2, mech: 'scout' },

  // robotics (down): helpers, mines, crits
  { id: 'sensors', name: 'Сенсоры', desc: '+3% шанса крита за уровень', branch: 'robotics', x: 0, y: 1, parent: 'core', max: 3, scrap: 20, bonus: lv => { S.crit += 0.03 * lv; } },
  { id: 'drone', name: 'Боевой дрон', desc: 'В забеге выпадает плечевой дрон', branch: 'robotics', x: -1, y: 2, parent: 'sensors', max: 1, scrap: 60, cores: 1, unlocks: ['drone'] },
  { id: 'mines', name: 'Минный раскладчик', desc: 'В забеге выпадает плечевой раскладчик мин', branch: 'robotics', x: 0, y: 2, parent: 'sensors', max: 1, scrap: 80, cores: 1, unlocks: ['mines'] },
  { id: 'crit', name: 'Слабые места', desc: 'В забеге выпадает апгрейд на шанс крита', branch: 'robotics', x: -1, y: 3, parent: 'drone', max: 1, scrap: 150, unlocks: ['crit'] },
  { id: 'regen', name: 'Ремонтные наниты', desc: 'В забеге выпадает регенерация HP', branch: 'robotics', x: 0, y: 3, parent: 'mines', max: 1, scrap: 120, unlocks: ['regen'] },

  // hull (down-right, shared): useful whatever branch you play
  { id: 'armor', name: 'Бронепластины', desc: '+10 к максимуму HP за уровень', branch: 'hull', x: 1, y: 1, parent: 'core', max: 5, scrap: 25, bonus: lv => { P.maxHp += 10 * lv; P.hp = P.maxHp; } },
  { id: 'magnet', name: 'Магнитный контур', desc: '+15% к радиусу сбора за уровень', branch: 'hull', x: 1, y: 2, parent: 'armor', max: 3, scrap: 30, bonus: lv => { S.magnet *= 1 + 0.15 * lv; } },
  { id: 'salvage', name: 'Сборщик лома', desc: '+10% лома с врагов за уровень', branch: 'hull', x: 1, y: 3, parent: 'magnet', max: 5, scrap: 60, bonus: lv => { S.scrap *= 1 + 0.1 * lv; } },
  { id: 'servo', name: 'Сервоприводы', desc: '+4% к скорости за уровень', branch: 'hull', x: 2, y: 3, parent: 'magnet', max: 5, scrap: 30, bonus: lv => { S.speed *= 1 + 0.04 * lv; } },
  { id: 'dash', name: 'Ускоритель', desc: 'В забеге выпадает ускоренная перезарядка рывка', branch: 'hull', x: 3, y: 3, parent: 'servo', max: 1, scrap: 80, unlocks: ['dash'] },
];

const byId = new Map(TECH.map(n => [n.id, n]));
/** Which node gates each run upgrade. Upgrades no node lists are always in the pool. */
const unlockedBy = new Map(TECH.flatMap(n => (n.unlocks ?? []).map(u => [u, n.id] as const)));

export const techNode = (id: string): TechNode | undefined => byId.get(id);
export const techLv = (id: string): number => (id === 'core' ? 1 : save.tech[id] ?? 0);

/** A node can be bought once its parent is. */
export const techOpen = (n: TechNode): boolean => !n.parent || techLv(n.parent) > 0;

export function techCost(n: TechNode): { scrap: number; cores: number } {
  const lv = techLv(n.id);
  return { scrap: Math.round(n.scrap * (1 + 0.6 * lv)), cores: lv === 0 ? n.cores ?? 0 : 0 };
}

export function canBuy(n: TechNode): boolean {
  if (!techOpen(n) || techLv(n.id) >= n.max) return false;
  const c = techCost(n);
  return save.scrap >= c.scrap && save.cores >= c.cores;
}

export function buyTech(n: TechNode): boolean {
  if (!canBuy(n)) return false;
  const c = techCost(n);
  save.scrap -= c.scrap;
  save.cores -= c.cores;
  save.tech[n.id] = techLv(n.id) + 1;
  persist();
  return true;
}

/** Bought and not switched off on the base. */
export function upgradeUnlocked(upgradeId: string): boolean {
  const node = unlockedBy.get(upgradeId);
  return !node || (techLv(node) > 0 && !save.off.includes(node));
}

/** Unlock nodes can be taken out of the run pool and put back. */
export const techOff = (n: TechNode): boolean => save.off.includes(n.id);

export function toggleTechOff(n: TechNode): void {
  if (!n.unlocks || techLv(n.id) === 0) return;
  save.off = techOff(n) ? save.off.filter(id => id !== n.id) : [...save.off, n.id];
  persist();
}

export function mechUnlocked(id: MechId): boolean {
  const node = TECH.find(n => n.mech === id);
  return !node || techLv(node.id) > 0;
}

/** Applies permanent bonuses. Call right after resetState(). */
export function applyTech(): void {
  for (const n of TECH) {
    const lv = techLv(n.id);
    if (lv > 0 && n.bonus) n.bonus(lv);
  }
}
