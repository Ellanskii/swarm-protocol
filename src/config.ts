// All tunable numbers live here: weapons, enemies, pacing.

/** Half-size of the square arena, world units. */
export const ARENA = 60;

export const LIMITS = {
  bullets: 900,
  enemyShots: 300,
  gems: 1200,
  particles: 1600,
  enemies: 650,
} as const;

export const PACING = {
  /** Encirclement wave interval, seconds. */
  burstEvery: 45,
  /** Boss interval, seconds. */
  bossEvery: 120,
  /** Enemy HP grows by this fraction per minute survived. */
  hpPerMinute: 0.5,
  /** Contact damage doubles every N seconds. */
  dmgDoubleEvery: 300,
} as const;

// ---------------- mechs ----------------

export type MechId = 'guard' | 'scout';

/** Proportions of the procedural model, world units before `scale`. */
export interface MechFrame {
  hipH: number;
  legW: number;
  torso: [w: number, h: number, d: number];
}

export interface MechDef {
  name: string;
  role: string;
  passive: string;
  hp: number;
  speed: number;
  /** Torso turn speed toward the aim point, rad/s. */
  turnRate: number;
  dash: { charges: number; cd: number };
  /** Number of shoulder slots. */
  shoulders: 1 | 2;
  start: WeaponId;
  /** Regenerating shield on top of HP, 0 for none. */
  shield: number;
  /** Dash leaves a damaging trail. */
  trail: boolean;
  scale: number;
  frame: MechFrame;
  /** Armor trim and glow color. */
  trim: number;
}

export const MECHS: Record<MechId, MechDef> = {
  guard: {
    name: 'Страж', role: 'Средний, универсальный', passive: 'Щит восстанавливается, если 3 секунды не получать урон',
    hp: 120, speed: 6.2, turnRate: 9, dash: { charges: 1, cd: 2 }, shoulders: 2, start: 'cannon', shield: 40, trail: false,
    scale: 1, frame: { hipH: 1.1, legW: 0.24, torso: [1.0, 0.65, 0.8] }, trim: 0x4cc9f0,
  },
  scout: {
    name: 'Скаут', role: 'Лёгкий, быстрый', passive: 'Два заряда рывка, рывок оставляет жгучий след',
    hp: 75, speed: 8.2, turnRate: 13, dash: { charges: 2, cd: 1.6 }, shoulders: 1, start: 'mg', shield: 0, trail: true,
    scale: 0.92, frame: { hipH: 1.25, legW: 0.18, torso: [0.78, 0.5, 0.66] }, trim: 0x80ffdb,
  },
};

/** Guard shield: delay after the last hit, then regen per second. */
export const SHIELD = { delay: 3, regen: 15 } as const;
/** Scout dash trail. */
export const TRAIL = { every: 0.04, life: 1.4, tick: 0.3, r: 1.1, dmg: 12 } as const;

export const MECH_ORDER: MechId[] = ['guard', 'scout'];

// ---------------- weapons ----------------

/** Arm weapons. */
export type WeaponId = 'mg' | 'cannon' | 'shotgun';

/** Slot-mounted models, see PART_BUILDERS in mech.ts. */
export type PartId = 'mg' | 'cannon' | 'shotgun' | 'rockets' | 'mortar' | 'drone';

export interface WeaponDef {
  name: string;
  key: number;
  dmg: number;
  /** Shots per second. */
  rate: number;
  mag: number;
  /** Reload time, seconds. */
  reload: number;
  /** Random spread, radians. */
  spread: number;
  pellets: number;
  speed: number;
  range: number;
  color: number;
  /** Enemies a shot passes through, on top of upgrades. */
  pierce: number;
  /** Visual projectile size. */
  size: number;
  /** Screen shake per shot. */
  kick: number;
  /** Model mounted in the arm slot. */
  part: PartId;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  mg:      { name: 'Пулемёт',   key: 1, dmg: 8,  rate: 11,  mag: 40, reload: 1.5, spread: 0.08, pellets: 1, speed: 52, range: 24, pierce: 0, size: 0.8, color: 0x7fe3ff, kick: 0.08, part: 'mg' },
  cannon:  { name: 'Автопушка', key: 2, dmg: 22, rate: 3.2, mag: 14, reload: 1.4, spread: 0.03, pellets: 1, speed: 44, range: 30, pierce: 1, size: 1.6, color: 0xffd166, kick: 0.3,  part: 'cannon' },
  shotgun: { name: 'Дробовик',  key: 3, dmg: 9,  rate: 1.4, mag: 6,  reload: 1.6, spread: 0.3,  pellets: 7, speed: 38, range: 15, pierce: 0, size: 1,   color: 0xffc36b, kick: 0.6,  part: 'shotgun' },
};

export const WEAPON_ORDER: WeaponId[] = ['mg', 'cannon', 'shotgun'];

// ---------------- shoulder systems ----------------

export type ShoulderId = 'rockets' | 'mortar' | 'drone';

export interface ShoulderDef {
  name: string;
  desc: string;
  /** Seconds between volleys; for drones, between shots of each drone. */
  cd: number;
  dmg: number;
  /** Projectiles per volley (drones: drone count) at level 1, plus `perLevel` per level. */
  count: number;
  perLevel: number;
  range: number;
  /** Blast radius; 0 for direct hits. */
  blast: number;
  color: number;
  max: number;
}

export const SHOULDERS: Record<ShoulderId, ShoulderDef> = {
  rockets: { name: 'Ракеты',      desc: 'Залп самонаводящихся ракет по ближайшим целям', cd: 3.2, dmg: 24, count: 3, perLevel: 1, range: 22, blast: 2.2, color: 0xff8c42, max: 5 },
  mortar:  { name: 'Миномёт',     desc: 'Навесной выстрел по самой плотной толпе',     cd: 4.5, dmg: 60, count: 1, perLevel: 1, range: 20, blast: 3.6, color: 0xffb347, max: 4 },
  drone:   { name: 'Боевой дрон', desc: 'Дрон кружит рядом и стреляет по ближайшим',   cd: 0.65, dmg: 10, count: 1, perLevel: 1, range: 15, blast: 0,   color: 0x80ffdb, max: 4 },
};

// ---------------- enemies ----------------

export type EnemyType = 'grunt' | 'runner' | 'spitter' | 'brute' | 'boss';

export interface EnemyDef {
  hp: number;
  speed: number;
  /** Collision radius. */
  r: number;
  /** Contact damage. */
  dmg: number;
  xp: number;
  color: number;
  /** Height of the mesh center above ground. */
  y: number;
  /** Max simultaneous instances. */
  max: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  grunt:   { hp: 26,   speed: 3.3, r: 0.55, dmg: 10, xp: 1,  color: 0xff4d6d, y: 0.55, max: 520 },
  runner:  { hp: 11,   speed: 5.9, r: 0.42, dmg: 6,  xp: 1,  color: 0xffd23f, y: 0.5,  max: 300 },
  spitter: { hp: 38,   speed: 2.7, r: 0.6,  dmg: 8,  xp: 2,  color: 0xff8c42, y: 1.0,  max: 120 },
  brute:   { hp: 210,  speed: 2.0, r: 1.15, dmg: 25, xp: 6,  color: 0x9b5de5, y: 1.15, max: 80 },
  boss:    { hp: 2600, speed: 2.5, r: 2.3,  dmg: 35, xp: 60, color: 0xf72585, y: 2.4,  max: 6 },
};

export const ENEMY_TYPES = Object.keys(ENEMIES) as EnemyType[];

/** XP needed to go from `level` to `level + 1`. */
export const xpFor = (level: number): number => Math.round(6 + (level - 1) * 5 + Math.pow(level - 1, 1.6));
