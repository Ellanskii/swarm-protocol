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

// ---------------- weapons ----------------

export type WeaponId = 'pistol' | 'shotgun' | 'smg';

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
  /** Screen shake per shot. */
  kick: number;
  /** Visual gun length. */
  gunLen: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol:  { name: 'Пистолет', key: 1, dmg: 14, rate: 5,   mag: 12, reload: 1.1, spread: 0.03, pellets: 1, speed: 46, range: 30, color: 0x7fe3ff, kick: 0.18, gunLen: 0.8 },
  shotgun: { name: 'Дробовик', key: 2, dmg: 9,  rate: 1.4, mag: 6,  reload: 1.6, spread: 0.3,  pellets: 7, speed: 38, range: 15, color: 0xffc36b, kick: 0.6,  gunLen: 1.05 },
  smg:     { name: 'ПП',       key: 3, dmg: 7,  rate: 13,  mag: 36, reload: 1.4, spread: 0.11, pellets: 1, speed: 52, range: 24, color: 0xb98cff, kick: 0.07, gunLen: 0.7 },
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'shotgun', 'smg'];

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
