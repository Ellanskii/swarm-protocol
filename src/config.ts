// All tunable numbers live here: weapons, enemies, pacing.

/** Half-size of the square arena, world units. */
export const ARENA = 60;

export const LIMITS = {
  bullets: 900,
  debris: 500,
  wrecks: 40,
  strikes: 24,
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
  /** The last boss is the final one: beating it ends the run with an evacuation. */
  bossCount: 3,
  /** Final boss HP multiplier on top of the usual boss scaling. */
  finalBossHp: 1.6,
  /** Seconds between beating the final boss and the victory screen. */
  evacDelay: 3,
  /** Enemy HP grows by this fraction per minute survived. */
  hpPerMinute: 0.5,
  /** Contact damage doubles every N seconds. */
  dmgDoubleEvery: 300,
} as const;

/** Meta currencies dropped in a run. Scrap comes from every enemy, cores only from bosses. */
export const LOOT = {
  /** Cores per boss, by boss number (1-based); the last entry is the final boss. */
  bossCores: [1, 2, 3],
  /** Scrap from a boss, scattered as several pickups. */
  bossScrap: 40,
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

/** Jump jets (rockets branch): the dash becomes a jump that slams the ground on landing. */
export const JUMP = { time: 0.45, speed: 14, height: 2.2, r: 3.2, dmg: 40 } as const;

export const MECH_ORDER: MechId[] = ['guard', 'scout'];

// ---------------- weapons ----------------

/** Arm weapons. */
export type WeaponId = 'mg' | 'cannon' | 'shotgun' | 'laser';

/** Slot-mounted models, see PART_BUILDERS in mech.ts. */
export type PartId = 'mg' | 'cannon' | 'shotgun' | 'laser' | 'rockets' | 'mortar' | 'drone' | 'mines' | 'flak';

export interface WeaponDef {
  name: string;
  dmg: number;
  /** Shots per second. */
  rate: number;
  /** Sized so every magazine runs dry after about the same time of fire, see the shared reload. */
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
  /** Hitscan beam instead of projectiles: hits everything on the line up to `range`, ignores shield auras. */
  beam?: boolean;
  /** Model mounted in the arm slot. */
  part: PartId;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  mg:      { name: 'Пулемёт',   dmg: 8,  rate: 11,  mag: 44, reload: 1.5, spread: 0.08, pellets: 1, speed: 52, range: 24, pierce: 0, size: 0.8, color: 0x7fe3ff, kick: 0.08, part: 'mg' },
  cannon:  { name: 'Автопушка', dmg: 22, rate: 3.2, mag: 13, reload: 1.4, spread: 0.03, pellets: 1, speed: 44, range: 30, pierce: 1, size: 1.6, color: 0xffd166, kick: 0.3,  part: 'cannon' },
  shotgun: { name: 'Дробовик',  dmg: 9,  rate: 1.4, mag: 6,  reload: 1.6, spread: 0.3,  pellets: 7, speed: 38, range: 15, pierce: 0, size: 1,   color: 0xffc36b, kick: 0.6,  part: 'shotgun' },
  // many weak ticks: shreds crowds and shielded machines, barely scratches armor
  laser:   { name: 'Лазер',     dmg: 3.2, rate: 20, mag: 90, reload: 1.6, spread: 0,    pellets: 1, speed: 0,  range: 20, pierce: 0, size: 1,   color: 0xff4df0, kick: 0.02, part: 'laser', beam: true },
};

export const WEAPON_ORDER: WeaponId[] = ['mg', 'cannon', 'shotgun', 'laser'];

/** Arm weapon levels: picking an owned weapon again levels it up. */
export const WEAPON_LEVELS = {
  max: 5,
  /** Damage bonus per level above 1. */
  dmg: 0.25,
  /** An extra barrel (shotgun: two pellets) every N levels. */
  barrelEvery: 2,
} as const;

// ---------------- shoulder systems ----------------

export type ShoulderId = 'rockets' | 'mortar' | 'drone' | 'mines' | 'flak';

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
  // mines: `count` is how many can lie at once (+perLevel), `range` the trigger radius
  mines:   { name: 'Минный раскладчик', desc: 'Сбрасывает мины на ходу. Мина взрывается, когда рядом машина', cd: 1.2, dmg: 38, count: 6, perLevel: 3, range: 1.3, blast: 2.6, color: 0xff3b3b, max: 4 },
  // flak: shoots down enemy shells first, then kamikaze drones; `count` targets per burst
  flak:    { name: 'Зенитка', desc: 'Сбивает вражеские снаряды и дронов-камикадзе', cd: 0.45, dmg: 14, count: 1, perLevel: 1, range: 11, blast: 0, color: 0xffe066, max: 4 },
};

// ---------------- enemies ----------------

/**
 * Factory machines. grunt — walking assembler, runner — kamikaze drone, spitter — light tank,
 * brute — heavy tank, artillery — shells a marked zone, shield — protects its neighbours, boss — the Forge.
 */
export type EnemyType = 'grunt' | 'runner' | 'spitter' | 'brute' | 'artillery' | 'shield' | 'boss';

export interface EnemyDef {
  hp: number;
  speed: number;
  /** Collision radius. */
  r: number;
  /** Contact damage. */
  dmg: number;
  /** Flat damage taken off every hit, down to 25% of it: light rapid fire barely scratches heavy armor. */
  armor: number;
  xp: number;
  /** Average scrap per kill; the fraction is rolled as a chance for one more. */
  scrap: number;
  color: number;
  /** Height of the body center above ground, for effects. */
  y: number;
  /** Max simultaneous instances. */
  max: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  grunt:     { hp: 26,   speed: 3.3, r: 0.55, dmg: 10, armor: 0, xp: 1,  scrap: 0.25, color: 0xff4d6d, y: 0.75, max: 520 },
  runner:    { hp: 11,   speed: 5.9, r: 0.42, dmg: 14, armor: 0, xp: 1,  scrap: 0.2,  color: 0xffd23f, y: 0.8,  max: 300 },
  spitter:   { hp: 38,   speed: 2.7, r: 0.6,  dmg: 8,  armor: 2, xp: 2,  scrap: 1,    color: 0xff8c42, y: 0.6,  max: 120 },
  brute:     { hp: 210,  speed: 2.0, r: 1.15, dmg: 25, armor: 6, xp: 6,  scrap: 4,    color: 0xc0392b, y: 0.9,  max: 80 },
  artillery: { hp: 70,   speed: 1.6, r: 0.85, dmg: 8,  armor: 3, xp: 4,  scrap: 2,    color: 0xffb347, y: 0.8,  max: 24 },
  shield:    { hp: 90,   speed: 2.6, r: 0.75, dmg: 10, armor: 3, xp: 4,  scrap: 2,    color: 0xf4a259, y: 0.9,  max: 30 },
  boss:      { hp: 2600, speed: 2.5, r: 2.3,  dmg: 35, armor: 8, xp: 60, scrap: 0,    color: 0xf72585, y: 2.2,  max: 6 },
};

export const ENEMY_TYPES = Object.keys(ENEMIES) as EnemyType[];

/** Artillery platform: keeps its distance and shells the spot the player stands on. */
export const ARTILLERY = {
  /** Preferred distance band to the player. */
  near: 12,
  far: 18,
  /** Fires when the player is closer than this. */
  range: 24,
  every: 4.5,
  /** Warning time between marking the zone and the hit, seconds. */
  warn: 1.3,
  r: 2.6,
  dmg: 18,
  /** Shells hit machines too, this many times harder than the mech: lure the swarm under the fire. */
  friendlyMult: 2.5,
} as const;

/** Shield bearer: machines near it take reduced damage. */
export const SHIELD_AURA = { r: 5, mult: 0.5 } as const;

/** XP needed to go from `level` to `level + 1`. */
export const xpFor = (level: number): number => Math.round(6 + (level - 1) * 5 + Math.pow(level - 1, 1.6));
