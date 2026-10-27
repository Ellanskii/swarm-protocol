// All tunable numbers live here: weapons, enemies, pacing.

/** Endless field: cover pillars are generated per square chunk, only around the mech. */
export const FIELD = {
  /** Chunk size, world units. */
  chunk: 40,
  /** Chunks loaded on each side of the mech's chunk. */
  near: 1,
  /** Placement attempts per chunk; crowded spots drop some, so the average is a bit lower. */
  pillarsPerChunk: 3,
  /** Min free space between pillars. */
  gap: 4,
  /** No pillars this close to the start point. */
  clear: 10,
  /** XP crystals this far behind merge into one, so the field doesn't fill up with stragglers. */
  gemFar: 45,
} as const;

export type MapId = 'field' | 'corridor';

export interface MapDef {
  name: string;
  desc: string;
  /** Half-width of the playable strip along X; `Infinity` for an open field. Z is always endless. */
  halfX: number;
}

export const MAPS: Record<MapId, MapDef> = {
  field: { name: 'Пустошь', desc: 'открытое поле во все стороны', halfX: Infinity },
  corridor: { name: 'Магистраль', desc: 'бесконечный коридор вверх и вниз', halfX: 13 },
};

export const MAP_ORDER: MapId[] = ['field', 'corridor'];

export const LIMITS = {
  bullets: 900,
  debris: 500,
  wrecks: 40,
  strikes: 24,
  beams: 24,
  fires: 40,
  bomblets: 120,
  mushrooms: 16,
  enemyShots: 300,
  gems: 1200,
  particles: 1600,
  enemies: 650,
} as const;

export const PACING = {
  /** Encirclement wave interval, seconds. */
  burstEvery: 45,
  /** Encirclement ring radius: just outside the view, so the ring closes in from off screen. */
  burstR: 32,
  /** Seconds until the next boss; the countdown waits while a boss is alive, so they never stack. */
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

/** Machines left far behind are moved back around the mech, so outrunning the horde doesn't stall the fight. */
export const CROWD = {
  /** Beyond this distance from the mech a machine is relocated to the spawn ring. */
  far: 40,
  /** Chance that a relocated machine lands ahead of a moving mech rather than anywhere on the ring. */
  ahead: 0.65,
  /** The boss relocates sooner, onto a closer ring. */
  bossFar: 32,
  /** Past this distance the boss speeds up to catch the mech... */
  catchUp: 16,
  /** ...by this fraction of its speed per unit of distance, up to `catchUpMax` times its own speed. */
  catchUpRate: 0.15,
  catchUpMax: 3.5,
} as const;

/** Meta currencies dropped in a run. Scrap comes from every enemy, cores only from bosses. */
export const LOOT = {
  /** Cores per boss, by boss number (1-based); the last entry is the final boss. */
  bossCores: [1, 2, 3],
  /** Scrap from a boss, scattered as several pickups. */
  bossScrap: 40,
} as const;

// ---------------- mechs ----------------

export type MechId = 'guard' | 'scout' | 'bastion' | 'artillery' | 'carrier';

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
  /** Share of incoming damage the hull shrugs off. */
  armor?: number;
  /** Machines that ram the mech bounce off and take damage, see REPEL. */
  repel?: boolean;
  /** Standing still braces the mech, see BRACE. */
  brace?: boolean;
  /** Built-in drones that take no shoulder slot. */
  bay?: number;
  /** Shoulder system mounted at the start, on top of `start`. */
  startShoulder?: ShoulderId;
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
  // ballistics tier 3: a walking wall for close fights
  bastion: {
    name: 'Бастион', role: 'Тяжёлый, ближний бой', passive: 'Корпус гасит 20% урона, врезавшиеся машины отлетают и получают урон',
    hp: 170, speed: 5.2, turnRate: 6.5, dash: { charges: 1, cd: 3 }, shoulders: 2, start: 'shotgun', shield: 0, trail: false,
    armor: 0.2, repel: true,
    scale: 1.18, frame: { hipH: 1.0, legW: 0.3, torso: [1.2, 0.75, 0.95] }, trim: 0xffd166,
  },
  // rockets tier 3: fragile, deadly when planted
  artillery: {
    name: 'Артиллерист', role: 'Дальний бой', passive: 'Стоя на месте, упирается опорами: +30% урона, плечи перезаряжаются на 30% быстрее',
    hp: 85, speed: 6.4, turnRate: 8, dash: { charges: 1, cd: 2.2 }, shoulders: 2, start: 'launcher', startShoulder: 'mortar', shield: 0, trail: false,
    brace: true,
    scale: 1.02, frame: { hipH: 1.0, legW: 0.22, torso: [1.05, 0.55, 0.85] }, trim: 0xff8c42,
  },
  // robotics tier 3: fights through its drones
  carrier: {
    name: 'Носитель', role: 'Поддержка, дроны', passive: 'Ангар с двумя боевыми дронами, которые не занимают плечо',
    hp: 95, speed: 6.8, turnRate: 9, dash: { charges: 1, cd: 2 }, shoulders: 1, start: 'mg', shield: 0, trail: false,
    bay: 2,
    scale: 1.05, frame: { hipH: 1.15, legW: 0.22, torso: [1.1, 0.6, 1.0] }, trim: 0x7dff9a,
  },
};

/** Bastion: knockback and damage to a machine that touches the mech, at most once per `cd` per machine. */
export const REPEL = { push: 14, dmg: 18, cd: 0.6 } as const;
/** Artillerist: standing still for `delay` seconds braces the mech. */
export const BRACE = { delay: 0.5, dmg: 1.3, shoulderRate: 1.3 } as const;

/** Guard shield: delay after the last hit, then regen per second. */
export const SHIELD = { delay: 3, regen: 15 } as const;
/** Scout dash trail. */
export const TRAIL = { every: 0.04, life: 1.4, tick: 0.3, r: 1.1, dmg: 12 } as const;

/** Jump jets (rockets branch): the dash becomes a jump that slams the ground on landing. */
export const JUMP = { time: 0.45, speed: 14, height: 2.2, r: 3.2, dmg: 40 } as const;
/** Ram (ballistics branch): the dash hits every machine on the way, ignoring armor, and throws it aside. */
export const RAM = { dmg: 45, push: 16, r: 0.9 } as const;
/** Phase dash (energy branch): a short blink that burns through machines and dumps some heat. */
export const PHASE = { time: 0.12, speed: 40, dmg: 30, r: 0.9, vent: 0.3 } as const;
/** Decoy (robotics branch): the dash leaves a hologram that pulls melee machines in, then blows up. */
export const DECOY = { life: 3, pull: 12, r: 3.6, dmg: 60 } as const;

/** The mech's death: a mushroom blast wipes the machines nearby, loot flies in, then the death screen. */
export const MELTDOWN = { r: 14, wait: 3 } as const;

/** Reactive armor (ballistics): a hit on the mech sets off a blast around it, once per `cd`. Damage +50% per level. */
export const REACTIVE = { cd: 3, r: 3.2, dmg: 35 } as const;
/** Cluster munitions (rockets): every blast scatters bomblets (one per level, plus one). */
export const CLUSTER = { delay: 0.35, spread: 2.4, r: 1.5, dmg: 0.35 } as const;
/** Napalm (rockets): blasts leave burning ground. Damage per second per level. */
export const NAPALM = { life: 2.5, tick: 0.25, dps: 14, rMul: 0.7 } as const;
/** Overload (energy): an overheat discharges into everything around instead of hurting the mech. */
export const OVERLOAD = { r: 5.5, dmg: 70 } as const;
/** Target designator (robotics): marks the toughest machines nearby, one per level; marked ones take extra damage. */
export const DESIGNATOR = { every: 1.5, life: 4, range: 18, bonus: 0.3 } as const;

export const MECH_ORDER: MechId[] = ['guard', 'scout', 'bastion', 'artillery', 'carrier'];

// ---------------- weapons ----------------

/** Arm weapons. */
export type BaseWeaponId = 'mg' | 'cannon' | 'shotgun' | 'laser' | 'railgun' | 'launcher';
export type WeaponId = BaseWeaponId | EvoWeaponId;
/** Weapons that only come from evolutions. */
export type EvoWeaponId = 'plasma' | 'siege' | 'minigun' | 'arclauncher';

/** Slot-mounted models, see PART_BUILDERS in mech.ts. */
export type PartId = 'mg' | 'cannon' | 'shotgun' | 'laser' | 'railgun' | 'launcher' | 'rockets' | 'mortar' | 'drone' | 'mines' | 'flak' | 'repair';

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
  /** Hitscan beam instead of projectiles: hits everything on the line up to `range`. Energy beams ignore shield auras. */
  beam?: boolean;
  /** Projectiles explode on impact with this radius. */
  blast?: number;
  /** Projectiles burn through shield auras. */
  shieldPierce?: boolean;
  /** Blasts throw a chain lightning with this many jumps. */
  chain?: number;
  /** Energy weapon: each shot adds this much heat (1 = overheat) instead of spending ammo; `mag` and `reload` are unused. */
  heat?: number;
  /** Model mounted in the arm slot. */
  part: PartId;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  mg:      { name: 'Пулемёт',   dmg: 8,  rate: 11,  mag: 44, reload: 1.5, spread: 0.08, pellets: 1, speed: 52, range: 24, pierce: 0, size: 0.8, color: 0x7fe3ff, kick: 0.08, part: 'mg' },
  cannon:  { name: 'Автопушка', dmg: 22, rate: 3.2, mag: 13, reload: 1.4, spread: 0.03, pellets: 1, speed: 44, range: 30, pierce: 1, size: 1.6, color: 0xffd166, kick: 0.3,  part: 'cannon' },
  shotgun: { name: 'Дробовик',  dmg: 9,  rate: 1.4, mag: 6,  reload: 1.6, spread: 0.3,  pellets: 7, speed: 38, range: 15, pierce: 0, size: 1,   color: 0xffc36b, kick: 0.6,  part: 'shotgun' },
  // many weak ticks: shreds crowds and shielded machines, barely scratches armor
  laser:   { name: 'Лазер',     dmg: 3.2, rate: 20, mag: 0,  reload: 0,   spread: 0,    pellets: 1, speed: 0,  range: 20, pierce: 0, size: 1,   color: 0xff4df0, kick: 0.02, part: 'laser', beam: true, heat: 0.011 },
  // one slow slug through the whole line: armor barely matters at this damage
  railgun: { name: 'Рельсотрон', dmg: 110, rate: 0.8, mag: 4, reload: 1.9, spread: 0,   pellets: 1, speed: 0,  range: 34, pierce: 0, size: 2.4, color: 0x9fd8ff, kick: 0.9,  part: 'railgun', beam: true },
  // evolutions: replace their base weapon in the same arm, already at max level
  plasma:  { name: 'Плазменный дробовик', dmg: 14, rate: 1.6, mag: 8, reload: 1.5, spread: 0.32, pellets: 9, speed: 42, range: 16, pierce: 2, size: 1.3, color: 0xc77dff, kick: 0.6, part: 'shotgun', shieldPierce: true },
  siege:   { name: 'Осадная пушка', dmg: 40, rate: 2.6, mag: 12, reload: 1.4, spread: 0.03, pellets: 1, speed: 40, range: 30, pierce: 0, size: 2, color: 0xffb347, kick: 0.45, part: 'cannon', blast: 3 },
  minigun: { name: 'Миниган', dmg: 9, rate: 24, mag: 110, reload: 1.8, spread: 0.11, pellets: 1, speed: 55, range: 24, pierce: 0, size: 0.8, color: 0x9ff0ff, kick: 0.05, part: 'mg' },
  arclauncher: { name: 'Грозовая ракетница', dmg: 34, rate: 1.6, mag: 7, reload: 1.7, spread: 0.04, pellets: 1, speed: 26, range: 26, pierce: 0, size: 2, color: 0x9fe8ff, kick: 0.35, part: 'launcher', blast: 2.8, chain: 4 },
  launcher: { name: 'Ракетница', dmg: 26, rate: 1.5, mag: 6, reload: 1.8, spread: 0.04,  pellets: 1, speed: 24, range: 26, pierce: 0, size: 2,   color: 0xff8c42, kick: 0.35, part: 'launcher', blast: 2.6 },
};

/**
 * Heat for energy weapons: the energy branch's resource. Firing heats the shared gauge, it cools on its own after a pause.
 * Running hot hits harder; reaching 100% hurts the mech and forces a long vent. The reload button vents early,
 * with the same timing window: a hit cools instantly and blasts steam around the mech.
 */
export const HEAT = {
  /** Gauge per second once the guns stop firing for `coolDelay`. */
  cool: 0.35,
  coolDelay: 0.35,
  /** From this heat on, energy weapons deal `hotDmg` times damage. */
  hot: 0.7,
  hotDmg: 1.25,
  /** Overheat: damage to the mech and a forced vent of this many seconds. */
  overDmg: 15,
  overVent: 2.2,
  /** Manual vent time: base + per unit of heat. Below `minVent` there is nothing to vent. */
  ventBase: 0.5,
  ventPerHeat: 0.9,
  minVent: 0.15,
  /** Perfect vent: steam burst radius and damage at full heat (scales down to 40% when venting cold). */
  steamR: 3.6,
  steamDmg: 45,
  /** Auto-fire on touch holds energy weapons at this heat; only manual fire can overheat. */
  autoStop: 0.95,
} as const;

export const WEAPON_ORDER: WeaponId[] = ['mg', 'minigun', 'cannon', 'siege', 'shotgun', 'plasma', 'railgun', 'launcher', 'arclauncher', 'laser'];

/** Arm weapon levels: picking an owned weapon again levels it up. */
export const WEAPON_LEVELS = {
  max: 5,
  /** Damage bonus per level above 1. */
  dmg: 0.25,
  /** An extra barrel (shotgun: two pellets) every N levels. */
  barrelEvery: 2,
} as const;

// ---------------- evolutions ----------------

/**
 * A weapon or shoulder system at max level plus a catalyst from another branch evolves on level-up.
 * `needs` is a run upgrade id, or an arm weapon id that must be mounted.
 */
export interface EvoDef {
  name: string;
  desc: string;
  base: WeaponId | ShoulderId;
  slot: 'arm' | 'shoulder';
  /** Arm evolutions swap the weapon for this one. */
  into?: EvoWeaponId;
  needs: string;
  needsName: string;
}

export const EVOLUTIONS: Record<string, EvoDef> = {
  evoPlasma:  { name: 'Плазменный дробовик', desc: 'Дробь из плазмы прошивает две машины и игнорирует щиты', base: 'shotgun', slot: 'arm', into: 'plasma', needs: 'eshield', needsName: 'Энергощит' },
  evoSiege:   { name: 'Осадная пушка', desc: 'Тяжёлые снаряды взрываются при попадании', base: 'cannon', slot: 'arm', into: 'siege', needs: 'explode', needsName: 'Разрывные' },
  evoMinigun: { name: 'Миниган', desc: 'Вдвое быстрее, магазин на 110 патронов', base: 'mg', slot: 'arm', into: 'minigun', needs: 'crit', needsName: 'Слабые места' },
  evoArc:     { name: 'Грозовая ракетница', desc: 'Каждый взрыв пускает цепную молнию по четырём машинам', base: 'launcher', slot: 'arm', into: 'arclauncher', needs: 'aura', needsName: 'Тесла-катушка' },
  evoSwarm:   { name: 'Рой микроракет', desc: 'Вдвое больше ракет, залпы чаще, первыми бьют помеченные цели', base: 'rockets', slot: 'shoulder', needs: 'designator', needsName: 'Целеуказатель' },
  evoBeams:   { name: 'Лазерные дроны', desc: 'Дроны стреляют лучами: прожигают всех на линии и игнорируют щиты', base: 'drone', slot: 'shoulder', needs: 'laser', needsName: 'Лазер' },
};

// ---------------- capstones ----------------

/** Rockets capstone: an automatic friendly strike on the densest crowd. */
export const ORBITAL = { every: 15, warn: 1, r: 5, dmg: 150, range: 22 } as const;
/** Energy capstone: a lightning bolt that jumps between machines. */
export const CHAIN = { every: 3, range: 12, jump: 5, jumps: 4, dmg: 40 } as const;

// ---------------- shoulder systems ----------------

export type ShoulderId = 'rockets' | 'mortar' | 'drone' | 'mines' | 'flak' | 'repair';

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
  // repair drone: `count` is HP restored per cycle (+perLevel), only while the mech is damaged
  repair:  { name: 'Ремонтный дрон', desc: 'Чинит меха: возвращает HP раз в несколько секунд', cd: 4, dmg: 0, count: 8, perLevel: 4, range: 0, blast: 0, color: 0x7dff9a, max: 4 },
};

// ---------------- enemies ----------------

/**
 * Factory machines. grunt — walking assembler, runner — kamikaze drone, spitter — light tank,
 * brute — heavy tank that stops to fire slow bursting shells, artillery — shells a marked zone, shield — protects its neighbours, boss — the Forge.
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

/** Heavy tank: pushes in, now and then stops to aim (a red line shows it) and fires a slow shell that bursts where the mech stood. */
export const TANK = { every: 4.5, aim: 0.7, minRange: 3, range: 15, speed: 12, dmg: 22, r: 1.8 } as const;

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
