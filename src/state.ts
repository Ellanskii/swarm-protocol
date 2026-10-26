// Mutable game state shared by all systems. Modules mutate fields on these objects
// instead of reassigning exports, so everyone sees the same data.
import * as THREE from 'three';
import {
  ENEMY_TYPES, MECHS, WEAPONS, xpFor,
  type EnemyDef, type EnemyType, type MechId, type ShoulderId, type WeaponDef, type WeaponId,
} from './config';
import type { SlotId } from './mech';

export type GameState = 'start' | 'play' | 'levelup' | 'pause' | 'over';

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
}

export interface WeaponState {
  id: WeaponId;
  d: WeaponDef;
  ammo: number;
  reloading: boolean;
  t: number;
  dur: number;
  /** Active-reload window, as fractions of `dur`. */
  arS: number;
  arE: number;
  arUsed: boolean;
  /** Shots left with the perfect-reload damage bonus. */
  perfect: number;
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
  rot: number;
  dead: boolean;
  born: number;
  boss: boolean;
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
}

export interface ShoulderState { id: ShoulderId; lv: number; cd: number; slot: SlotId }
export interface Rocket { x: number; z: number; y: number; vx: number; vz: number; target: Enemy | null; age: number; life: number; dmg: number; blast: number }
/** Mortar shell: flies from (x0, z0) to (tx, tz) along an arc over `dur` seconds. */
export interface Shell { x0: number; z0: number; tx: number; tz: number; x: number; z: number; y: number; t: number; dur: number; dmg: number; blast: number; life: number }
export interface TrailPoint { x: number; z: number; life: number; tick: number }

export interface EnemyShot { x: number; z: number; vx: number; vz: number; dmg: number; life: number }
export interface Gem { x: number; z: number; v: number; vel: number; pull: boolean; ph: number; dead: boolean }
export interface Pickup { kind: 'heart' | 'magnet'; x: number; z: number; mesh: THREE.Object3D; life: number; dead: boolean }
export interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; col: number; s: number }
export interface Drone { mesh: THREE.Mesh; cd: number; x: number; z: number }

export const S = {} as Stats;
export const P = {} as Player;
/** Mouse aim point on the y = 1 plane. */
export const aim = new THREE.Vector3();

export const G = {
  state: 'start' as GameState,
  /** Selected mech. Not touched by resetState(), so the choice survives restarts. */
  mech: 'guard' as MechId,
  time: 0,
  kills: 0,
  spawnAcc: 0,
  nextBurst: 0,
  nextBoss: 0,
  bossN: 0,
  shake: 0,
  nextId: 1,
  pendingLevels: 0,
  auraT: 0,
  fireCd: 0,
  gunKick: 0,
  cur: 'cannon' as WeaponId,
  owned: {} as Partial<Record<WeaponId, WeaponState>>,
  upLv: {} as Record<string, number>,
  enemies: [] as Enemy[],
  bullets: [] as Bullet[],
  eshots: [] as EnemyShot[],
  gems: [] as Gem[],
  pickups: [] as Pickup[],
  parts: [] as Particle[],
  drones: [] as Drone[],
  shoulders: [] as ShoulderState[],
  rockets: [] as Rocket[],
  shells: [] as Shell[],
  trails: [] as TrailPoint[],
  typeCount: {} as Record<EnemyType, number>,
  /** Debug invulnerability. Not touched by resetState(), so it survives restarts. */
  god: false,
};

export const magSize = (d: WeaponDef): number => Math.max(1, Math.round(d.mag * S.mag));

export function mkWeapon(id: WeaponId): WeaponState {
  const d = WEAPONS[id];
  return { id, d, ammo: magSize(d), reloading: false, t: 0, dur: 1, arS: 0, arE: 0, arUsed: false, perfect: 0 };
}

export function curWeapon(): WeaponState {
  const w = G.owned[G.cur];
  if (!w) throw new Error(`weapon ${G.cur} is not owned`);
  return w;
}

/** Resets stats, player and world data. Scene objects must be removed by the caller first. */
export function resetState(): void {
  Object.assign(S, {
    dmg: 1, rate: 1, mag: 1, reload: 1, pierce: 0, multi: 0, crit: 0.05, explode: 0,
    speed: 1, magnet: 3.2, regen: 0, dashMul: 1, arW: 0, aura: 0,
  } satisfies Stats);
  const mech = MECHS[G.mech];
  Object.assign(P, {
    x: 0, z: 0, ang: 0, legAng: 0, walkPh: 0, tx: 0, tz: 1, hp: mech.hp, maxHp: mech.hp,
    shield: mech.shield, maxShield: mech.shield, calm: 0, inv: 0, blink: 0,
    dashCharges: mech.dash.charges, dashCd: 0, trailT: 0, dashT: 0, ddx: 0, ddz: 1,
    level: 1, xp: 0, xpNext: xpFor(1), mx: 0, my: 1, mz: 0, speed: 0, moving: false,
  } satisfies Player);
  Object.assign(G, {
    time: 0, kills: 0, spawnAcc: 0, nextBurst: 45, nextBoss: 120, bossN: 0, shake: 0,
    pendingLevels: 0, auraT: 0, fireCd: 0, gunKick: 0,
    cur: mech.start, owned: { [mech.start]: mkWeapon(mech.start) }, upLv: {},
    enemies: [], bullets: [], eshots: [], gems: [], pickups: [], parts: [], drones: [],
    shoulders: [], rockets: [], shells: [], trails: [],
  });
  for (const k of ENEMY_TYPES) G.typeCount[k] = 0;
}

resetState();
