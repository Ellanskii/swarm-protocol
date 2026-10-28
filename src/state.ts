// Mutable game state shared by all systems. Modules mutate fields on these objects
// instead of reassigning exports, so everyone sees the same data.
import * as THREE from 'three';
import {
  BRACE, CHAIN, ENEMY_TYPES, HEAT, MECHS, ORBITAL, WEAPONS, xpFor,
  type EnemyDef, type EnemyType, type MapId, type MechId, type ShoulderId, type WeaponDef, type WeaponId,
} from './config';
import type { ArmSlot, SlotId } from './mech';

export type GameState = 'start' | 'base' | 'play' | 'levelup' | 'pause' | 'over';

/** Multipliers and flat bonuses granted by upgrades. */
export interface Stats {
  dmg: number;
  rate: number;
  mag: number;
  reload: number;
  pierce: number;
  multi: number;
  crit: number;
  explode: number;
  speed: number;
  magnet: number;
  regen: number;
  dashMul: number;
  /** Extra width of the active-reload window. */
  arW: number;
  aura: number;
  /** Scrap pickup multiplier. */
  scrap: number;
  /** Explosion radius multiplier. */
  blast: number;
  /** Heat cooling and vent speed multiplier. */
  cool: number;
  /** Heat per shot multiplier. */
  heat: number;
  /** Heat from which energy weapons run hot, and their damage multiplier there. */
  hotAt: number;
  hotDmg: number;
  /** Armor ignored by ballistic hits. */
  pen: number;
  /** Levels of branch modifiers; 0 = not taken. */
  reactive: number;
  cluster: number;
  napalm: number;
  overload: number;
  mark: number;
  /** Perfect reload damage multiplier. */
  perfect: number;
  /** Capstones: orbital strike and chain lightning on/off, extra drones at the start. */
  orbital: number;
  chain: number;
  bay: number;
}

export interface Player {
  x: number;
  z: number;
  /** Torso facing around Y, radians. Turns toward the aim point at the mech's turn rate. */
  ang: number;
  /** Legs facing, follows the movement direction. */
  legAng: number;
  /** Walk cycle phase, radians. */
  walkPh: number;
  /** Point the torso is aiming at: along `ang`, at the aim distance. */
  tx: number;
  tz: number;
  /** How far the torso still has to turn to put the fire line on the aim point, radians. */
  aimErr: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  /** Seconds since the last hit. */
  calm: number;
  inv: number;
  blink: number;
  dashCharges: number;
  /** Time until the next dash charge comes back. */
  dashCd: number;
  /** Time until the next trail point while dashing. */
  trailT: number;
  dashT: number;
  /** Length of the current dash, for the jump arc. */
  dashMax: number;
  ddx: number;
  ddz: number;
  level: number;
  xp: number;
  xpNext: number;
  /** Muzzle position. */
  mx: number;
  my: number;
  mz: number;
  /** Current speed, world units per second. */
  speed: number;
  moving: boolean;
  /** Seconds standing still, for the Artillerist brace. */
  still: number;
}

export interface WeaponState {
  id: WeaponId;
  d: WeaponDef;
  slot: ArmSlot;
  lv: number;
  ammo: number;
  /** Time until the next shot. */
  cd: number;
}

/** One reload for all arm weapons at once. */
export interface ReloadState {
  on: boolean;
  t: number;
  dur: number;
  /** Active-reload window, as fractions of `dur`. */
  arS: number;
  arE: number;
  arUsed: boolean;
  /** The current magazines carry the perfect-reload damage bonus. */
  perfect: boolean;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  t: EnemyDef;
  x: number;
  z: number;
  kx: number;
  kz: number;
  hp: number;
  maxHp: number;
  r: number;
  flash: number;
  cd: number;
  side: number;
  /** Facing toward the player (turrets, walkers). */
  rot: number;
  /** Facing along the movement (tank hulls). */
  mrot: number;
  /** Inside a shield bearer's aura this frame. */
  shielded: boolean;
  /** Seconds left on a target designator mark. */
  mark: number;
  /** Seconds left burning (flamethrower) and the damage per second of that fire. */
  burn: number;
  burnDps: number;
  /** Time to the next burn tick. */
  burnTick: number;
  /** Bastion repel cooldown for this machine. */
  bump: number;
  /** Heavy tank: seconds left aiming before the shot; 0 = not aiming. */
  aim: number;
  /** Last dash that hit this machine, so a ram or phase dash hits it once. */
  dashHit: number;
  dead: boolean;
  born: number;
  boss: boolean;
  /** The final boss: beating it starts the evacuation. */
  final?: boolean;
  /** Cores dropped on death (bosses only). */
  cores?: number;
}

export interface Bullet {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  dmg: number;
  life: number;
  pierce: number;
  col: number;
  /** Id of the last enemy hit, so piercing shots don't hit it twice. */
  last: number;
  /** Visual size. */
  s: number;
  /** Explodes on impact with this radius; 0 = plain shot. */
  blast: number;
  /** Armor ignored on hit. */
  pen: number;
  /** Chain lightning jumps when it explodes. */
  chain: number;
  /** Burns through shield auras. */
  energy: boolean;
  /** Sets machines on fire. */
  ignite: boolean;
}

export interface ShoulderState { id: ShoulderId; lv: number; cd: number; slot: SlotId; evo?: boolean }
export interface Rocket { x: number; z: number; y: number; vx: number; vz: number; target: Enemy | null; age: number; life: number; dmg: number; blast: number }
/** Mortar shell: flies from (x0, z0) to (tx, tz) along an arc over `dur` seconds. */
export interface Shell { x0: number; z0: number; tx: number; tz: number; x: number; z: number; y: number; t: number; dur: number; dmg: number; blast: number; life: number }
export interface TrailPoint { x: number; z: number; life: number; tick: number }
/** Dropped mine: arms after a moment, blows up when a machine comes close. */
export interface Mine { x: number; z: number; arm: number; life: number; dmg: number; blast: number; dead: boolean }
/** Hitscan shot (laser, railgun), drawn for a moment and fading out. */
export interface Beam { x1: number; z1: number; x2: number; z2: number; y: number; life: number; max: number; w: number; col: number; flicker: boolean }
/** Dash variants from the tech branches; a mech carries one. */
export type DashMod = 'dash' | 'jump' | 'ram' | 'phase' | 'decoy';
/** Burning ground from napalm. */
export interface Fire { x: number; z: number; r: number; life: number; tick: number; dps: number }
/** Cluster bomblet waiting to go off. */
export interface Bomblet { x: number; z: number; t: number; r: number; dmg: number }

/** Enemy projectile. Tank shells have `blast` and burst after `left` more distance, or on the mech. */
export interface EnemyShot { x: number; z: number; vx: number; vz: number; dmg: number; life: number; blast?: number; left?: number }
/** Magnet-collected drop: XP, or meta currency (scrap, cores). */
export type GemKind = 'xp' | 'scrap' | 'core';
export interface Gem { kind: GemKind; x: number; z: number; v: number; vel: number; pull: boolean; ph: number; dead: boolean }
export interface Pickup { kind: 'heart' | 'magnet'; x: number; z: number; mesh: THREE.Object3D; life: number; dead: boolean }
/** `g` is gravity: sparks fall, smoke (negative g) rises. */
export interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; g: number; life: number; max: number; col: number; s: number }
/** Lit chunk of a destroyed machine: tumbles, lands, fades. */
export interface Debris { x: number; y: number; z: number; vx: number; vy: number; vz: number; ry: number; spin: number; life: number; max: number; col: number; s: number }
/** Burnt-out hull left by a bigger machine; smokes, then sinks. */
/** Mushroom cloud over a big blast; `r` is the blast radius, `t` runs up to `dur`. */
export interface Mushroom { x: number; z: number; r: number; t: number; dur: number }
/** Burnt-out hull: the machine's own model in charred metal, or the mech's (`mech`). `s` is the model scale. */
/** `r` and `h` are the hull's radius and height, so fire and smoke come out of its sides and top instead of the middle. */
export interface Wreck { model: EnemyType | 'mech'; x: number; z: number; rot: number; s: number; r: number; h: number; life: number; max: number; smokeT: number }
/** Artillery shell on its way: the zone is marked until it lands. */
/** A marked zone that blows up after a warning. Enemy artillery hits everyone; `friendly` (orbital strike) only machines. */
export interface Strike { x: number; z: number; t: number; dur: number; r: number; dmg: number; friendly?: boolean }
export interface Drone { mesh: THREE.Mesh; cd: number; x: number; z: number }

export const S = {} as Stats;
export const P = {} as Player;
/** Mouse aim point on the y = 1 plane. */
export const aim = new THREE.Vector3();

export const G = {
  /** Seeds the pillar layout; new every run. */
  fieldSeed: 0,
  state: 'start' as GameState,
  /** Selected mech. Not touched by resetState(), so the choice survives restarts. */
  mech: 'guard' as MechId,
  /** Chosen on the title screen, like the mech; survives resetState(). */
  map: 'field' as MapId,
  time: 0,
  kills: 0,
  spawnAcc: 0,
  nextBurst: 0,
  nextBoss: 0,
  bossN: 0,
  shake: 0,
  nextId: 1,
  pendingLevels: 0,
  /** Meta currency picked up this run; added to the save when the run ends. */
  loot: { scrap: 0, cores: 0 },
  /** Countdown to the victory screen after the final boss dies; 0 while the run goes on. */
  evacT: 0,
  /** Set when the evacuation finishes; the main loop then shows the victory screen. */
  won: false,
  /** Countdown from the mech's death blast to the death screen; 0 while the mech is alive. */
  deathT: 0,
  auraT: 0,
  gunKick: 0,
  owned: {} as Partial<Record<WeaponId, WeaponState>>,
  reload: { on: false, t: 0, dur: 1, arS: 0, arE: 0, arUsed: false, perfect: false } as ReloadState,
  /** Shared heat of all energy weapons, 0..1. */
  heat: 0,
  /** Seconds since an energy weapon last fired; cooling starts after HEAT.coolDelay. */
  heatIdle: 0,
  /** Venting heat: same timing window as the reload; `perfect` is unused. */
  vent: { on: false, t: 0, dur: 1, arS: 0, arE: 0, arUsed: false, perfect: false } as ReloadState,
  /** Heat when the vent started; the gauge drains from it to 0 over the vent. */
  ventFrom: 0,
  upLv: {} as Record<string, number>,
  enemies: [] as Enemy[],
  bullets: [] as Bullet[],
  eshots: [] as EnemyShot[],
  gems: [] as Gem[],
  pickups: [] as Pickup[],
  parts: [] as Particle[],
  debris: [] as Debris[],
  wrecks: [] as Wreck[],
  strikes: [] as Strike[],
  drones: [] as Drone[],
  shoulders: [] as ShoulderState[],
  rockets: [] as Rocket[],
  shells: [] as Shell[],
  trails: [] as TrailPoint[],
  mines: [] as Mine[],
  beams: [] as Beam[],
  fires: [] as Fire[],
  bomblets: [] as Bomblet[],
  mushrooms: [] as Mushroom[],
  /** Decoy hologram; `life` 0 = none. */
  decoy: { x: 0, z: 0, life: 0, power: 1 },
  designT: 0,
  reactiveCd: 0,
  orbitalT: 0,
  chainT: 0,
  /** Counts dashes, see Enemy.dashHit. */
  dashId: 0,
  dashMod: 'dash' as DashMod,
  /** Level of the dash module (1..MAX_LEVEL); 0 while the plain dash is on. */
  dashLv: 0,
  typeCount: {} as Record<EnemyType, number>,
  /** Debug invulnerability. Not touched by resetState(), so it survives restarts. */
  god: false,
  /** Debug: the level-up screen offers every available upgrade instead of 3. Survives restarts like `god`. */
  allUps: false,
  /** Debug: tech costs nothing on the base. Survives restarts like `god`. */
  infRes: false,
  /** Debug editor (P in dev): machines and their shots freeze, nothing spawns. Survives restarts like `god`. */
  editor: false,
};

export const magSize = (d: WeaponDef): number => Math.max(1, Math.round(d.mag * S.mag));

export function mkWeapon(id: WeaponId, slot: ArmSlot): WeaponState {
  const d = WEAPONS[id];
  return { id, d, slot, lv: 1, ammo: magSize(d), cd: 0 };
}

export const armWeapons = (): WeaponState[] => Object.values(G.owned);

/** Artillerist planted on its supports: more damage, faster shoulders. */
export const braced = (): boolean => !!MECHS[G.mech].brace && P.still >= BRACE.delay;

/** Resets stats, player and world data. Scene objects must be removed by the caller first. */
export function resetState(): void {
  Object.assign(S, {
    dmg: 1, rate: 1, mag: 1, reload: 1, pierce: 0, multi: 0, crit: 0.05, explode: 0,
    speed: 1, magnet: 3.2, regen: 0, dashMul: 1, arW: 0, aura: 0, scrap: 1, blast: 1, cool: 1, heat: 1,
    hotAt: HEAT.hot, hotDmg: HEAT.hotDmg, pen: 0, reactive: 0, cluster: 0, napalm: 0, overload: 0, mark: 0,
    perfect: 1.5, orbital: 0, chain: 0, bay: 0,
  } satisfies Stats);
  const mech = MECHS[G.mech];
  Object.assign(P, {
    x: 0, z: 0, ang: 0, legAng: 0, walkPh: 0, tx: 0, tz: 1, aimErr: 0, hp: mech.hp, maxHp: mech.hp,
    shield: 0, maxShield: 0, calm: 0, inv: 0, blink: 0,
    dashCharges: mech.dash.charges, dashCd: 0, trailT: 0, dashT: 0, dashMax: 1, ddx: 0, ddz: 1, still: 0,
    level: 1, xp: 0, xpNext: xpFor(1), mx: 0, my: 1, mz: 0, speed: 0, moving: false,
  } satisfies Player);
  Object.assign(G, {
    fieldSeed: (Math.random() * 2 ** 32) >>> 0, time: 0, kills: 0, spawnAcc: 0, nextBurst: 45, nextBoss: 120, bossN: 0, shake: 0,
    pendingLevels: 0, loot: { scrap: 0, cores: 0 }, evacT: 0, won: false, deathT: 0, auraT: 0, gunKick: 0,
    owned: { [mech.start]: mkWeapon(mech.start, 'armR') }, upLv: {},
    reload: { on: false, t: 0, dur: 1, arS: 0, arE: 0, arUsed: false, perfect: false },
    heat: 0, heatIdle: 0, ventFrom: 0,
    vent: { on: false, t: 0, dur: 1, arS: 0, arE: 0, arUsed: false, perfect: false },
    enemies: [], bullets: [], eshots: [], gems: [], pickups: [], parts: [], debris: [], wrecks: [], strikes: [], drones: [],
    shoulders: [], rockets: [], shells: [], trails: [], mines: [], dashMod: 'dash', dashLv: 0,
    beams: [], fires: [], bomblets: [], mushrooms: [], decoy: { x: 0, z: 0, life: 0, power: 1 }, designT: 0, reactiveCd: 0, orbitalT: ORBITAL.every, chainT: CHAIN.every, dashId: 0,
  });
  for (const k of ENEMY_TYPES) G.typeCount[k] = 0;
}

resetState();
