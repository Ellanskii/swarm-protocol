// Base tech tree: node data, prices, what each node unlocks, permanent bonuses.
import type { MechId } from './config';
import { persist, save } from './save';
import { P, S } from './state';

export type Branch = 'core' | 'ballistics' | 'rockets' | 'energy' | 'hull';

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

  // ballistics: arm weapons and their modifiers
  { id: 'ballistics', name: 'Баллистика', desc: '+6% урона всем оружием за уровень', branch: 'ballistics', x: 1, y: 0, parent: 'core', max: 5, scrap: 20, bonus: lv => { S.dmg *= 1 + 0.06 * lv; } },
  { id: 'mg', name: 'Пулемёт', desc: 'В забеге может выпасть пулемёт для второй руки', branch: 'ballistics', x: 2, y: -1, parent: 'ballistics', max: 1, scrap: 40, unlocks: ['mg'] },
  { id: 'shotgun', name: 'Дробовик', desc: 'В забеге может выпасть дробовик', branch: 'ballistics', x: 2, y: 1, parent: 'ballistics', max: 1, scrap: 60, unlocks: ['shotgun'] },
  { id: 'pierce', name: 'Бронебойные', desc: 'В забеге выпадает апгрейд «Бронебойные»: пули прошивают врагов', branch: 'ballistics', x: 3, y: -1, parent: 'mg', max: 1, scrap: 120, unlocks: ['pierce'] },
  { id: 'multi', name: 'Сдвоенный ствол', desc: 'В забеге выпадает апгрейд «Сдвоенный ствол»', branch: 'ballistics', x: 3, y: 1, parent: 'shotgun', max: 1, scrap: 150, unlocks: ['multi'] },
  { id: 'crit', name: 'Слабые места', desc: 'В забеге выпадает апгрейд на шанс крита', branch: 'ballistics', x: 4, y: -1, parent: 'pierce', max: 1, scrap: 220, unlocks: ['crit'] },
  { id: 'belts', name: 'Магазинные ленты', desc: '+8% патронов в магазине за уровень', branch: 'ballistics', x: 4, y: 1, parent: 'multi', max: 3, scrap: 100, bonus: lv => { S.mag *= 1 + 0.08 * lv; } },

  // rockets: shoulder artillery
  { id: 'rockets', name: 'Ракетные технологии', desc: 'В забеге выпадают плечевые ракеты', branch: 'rockets', x: 0, y: -1, parent: 'core', max: 1, scrap: 80, cores: 1, unlocks: ['rockets'] },
  { id: 'mortar', name: 'Миномёт', desc: 'В забеге выпадает плечевой миномёт', branch: 'rockets', x: 0, y: -2, parent: 'rockets', max: 1, scrap: 150, cores: 2, unlocks: ['mortar'] },
  { id: 'explode', name: 'Разрывные', desc: 'В забеге выпадает апгрейд «Разрывные»: попадания взрываются', branch: 'rockets', x: -1, y: -2, parent: 'mortar', max: 1, scrap: 200, unlocks: ['explode'] },
  { id: 'autoload', name: 'Автомат заряжания', desc: 'Перезарядка на 6% быстрее за уровень', branch: 'rockets', x: 1, y: -2, parent: 'rockets', max: 5, scrap: 60, bonus: lv => { S.reload *= 1 + 0.06 * lv; } },

  // energy: drones and fields
  { id: 'drone', name: 'Боевой дрон', desc: 'В забеге выпадает плечевой дрон', branch: 'energy', x: -1, y: 0, parent: 'core', max: 1, scrap: 60, cores: 1, unlocks: ['drone'] },
  { id: 'aura', name: 'Статическое поле', desc: 'В забеге выпадает статическое поле вокруг меха', branch: 'energy', x: -2, y: -1, parent: 'drone', max: 1, scrap: 150, cores: 1, unlocks: ['aura'] },
  { id: 'reactor', name: 'Реактор', desc: '+5% скорострельности за уровень', branch: 'energy', x: -2, y: 1, parent: 'drone', max: 5, scrap: 50, bonus: lv => { S.rate *= 1 + 0.05 * lv; } },
  { id: 'regen', name: 'Нанорегенерация', desc: 'В забеге выпадает регенерация HP', branch: 'energy', x: -3, y: 1, parent: 'reactor', max: 1, scrap: 120, unlocks: ['regen'] },

  // hull: armor, chassis, salvage, mechs
  { id: 'armor', name: 'Бронепластины', desc: '+10 к максимуму HP за уровень', branch: 'hull', x: 0, y: 1, parent: 'core', max: 5, scrap: 25, bonus: lv => { P.maxHp += 10 * lv; P.hp = P.maxHp; } },
  { id: 'servo', name: 'Сервоприводы', desc: '+4% к скорости за уровень', branch: 'hull', x: -1, y: 2, parent: 'armor', max: 5, scrap: 30, bonus: lv => { S.speed *= 1 + 0.04 * lv; } },
  { id: 'dash', name: 'Ускоритель', desc: 'В забеге выпадает ускоренная перезарядка рывка', branch: 'hull', x: -2, y: 2, parent: 'servo', max: 1, scrap: 80, unlocks: ['dash'] },
  { id: 'scout', name: 'Прототип «Скаут»', desc: 'Открывает Скаута: лёгкий мех с двумя рывками и жгучим следом', branch: 'hull', x: 0, y: 2, parent: 'armor', max: 1, scrap: 200, cores: 2, mech: 'scout' },
  { id: 'magnet', name: 'Магнитный контур', desc: '+15% к радиусу сбора за уровень', branch: 'hull', x: 1, y: 2, parent: 'armor', max: 3, scrap: 30, bonus: lv => { S.magnet *= 1 + 0.15 * lv; } },
  { id: 'salvage', name: 'Сборщик лома', desc: '+10% лома с врагов за уровень', branch: 'hull', x: 2, y: 2, parent: 'magnet', max: 5, scrap: 60, bonus: lv => { S.scrap *= 1 + 0.1 * lv; } },
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

export function upgradeUnlocked(upgradeId: string): boolean {
  const node = unlockedBy.get(upgradeId);
  return !node || techLv(node) > 0;
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
