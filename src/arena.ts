// Endless field: map bounds and walls, cover pillars generated per chunk around the mech, circle-vs-pillar collision.
import * as THREE from 'three';
import { FIELD, MAPS, MAP_ORDER } from './config';
import { applyPalette, scene } from './scene';
import { G, P } from './state';
import { rand } from './utils';

export interface Pillar { x: number; z: number; r: number; h: number }

/** Pillars of the chunks around the mech; rebuilt when the mech crosses into another chunk. */
export const pillars: Pillar[] = [];

const MAX = (2 * FIELD.near + 1) ** 2 * Math.max(...MAP_ORDER.map(id => MAPS[id].pillars));
const pillarMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
const capMat = new THREE.MeshBasicMaterial();
const bodyMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.08, 1, 8), pillarMat, MAX);
const capMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.01, 1.01, 0.08, 8), capMat, MAX);
bodyMesh.castShadow = bodyMesh.receiveShadow = true;
// instances move with the mech, so the meshes' own bounds would cull them wrongly
bodyMesh.frustumCulled = capMesh.frustumCulled = false;
bodyMesh.count = capMesh.count = 0;
scene.add(bodyMesh, capMesh);

// ---------------- bounds ----------------
// A map bounds X (a corridor up and down), Z (left and right) or nothing; walls slide along with the mech.

const halfX = (): number => MAPS[G.map].halfX;
const halfZ = (): number => MAPS[G.map].halfZ;

/** Keeps a circle of radius `r` inside the map. */
export function keepInField(o: { x: number; z: number }, r: number): void {
  const hx = halfX() - r, hz = halfZ() - r;
  o.x = Math.max(-hx, Math.min(hx, o.x));
  o.z = Math.max(-hz, Math.min(hz, o.z));
}

export const outOfField = (x: number, z: number): boolean => Math.abs(x) > halfX() || Math.abs(z) > halfZ();

/**
 * Moves a spawn point that falls outside the walls to a random spot across the corridor,
 * on the same end of it and at the same distance `d` from the mech.
 */
export function intoField(x: number, z: number, d: number): [number, number] {
  const hx = halfX() - 1, hz = halfZ() - 1;
  if (Math.abs(x) > hx) {
    const nx = rand(-hx, hx), dx = nx - P.x;
    z = P.z + Math.sign(z - P.z || 1) * Math.sqrt(Math.max(0, d * d - dx * dx));
    x = nx;
  }
  if (Math.abs(z) > hz) {
    const nz = rand(-hz, hz), dz = nz - P.z;
    x = P.x + Math.sign(x - P.x || 1) * Math.sqrt(Math.max(0, d * d - dz * dz));
    z = nz;
  }
  return [x, z];
}

const WALL_LEN = 200;
const wallMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.9 });
// beyond the walls the floor grid is covered with the background color
const voidMat = new THREE.MeshBasicMaterial();

/** Two walls with the void behind them. `acrossX`: the walls bound X and run along Z; otherwise they bound Z and run along X. */
function wallPair(acrossX: boolean): THREE.Group {
  const pair = new THREE.Group();
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(acrossX ? new THREE.BoxGeometry(1, 1.2, WALL_LEN) : new THREE.BoxGeometry(WALL_LEN, 1.2, 1), wallMat);
    const cover = new THREE.Mesh(acrossX ? new THREE.PlaneGeometry(120, WALL_LEN) : new THREE.PlaneGeometry(WALL_LEN, 120), voidMat);
    cover.rotation.x = -Math.PI / 2;
    if (acrossX) {
      wall.position.set(side * 0.5, 0.6, 0);
      cover.position.set(side * 61, 0.03, 0);
    } else {
      wall.position.set(0, 0.6, side * 0.5);
      cover.position.set(0, 0.03, side * 61);
    }
    const g = new THREE.Group();
    g.add(wall, cover);
    g.userData.side = side;
    pair.add(g);
  }
  scene.add(pair);
  return pair;
}
const wallsX = wallPair(true), wallsZ = wallPair(false);

// ---------------- pillars ----------------

/** Same chunk and seed always give the same pillars, so walking back finds the same cover. */
function chunkRng(cx: number, cz: number, seed: number): () => number {
  let s = (Math.imul(cx, 0x27d4eb2d) ^ Math.imul(cz, 0x165667b1) ^ seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkPillars(cx: number, cz: number, out: Pillar[]): void {
  const map = MAPS[G.map], [r0, r1] = map.pillarR;
  const rng = chunkRng(cx, cz, G.fieldSeed), C = FIELD.chunk, from = out.length;
  for (let i = 0; i < map.pillars; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const r = r0 + rng() * (r1 - r0);
      // the edge margin keeps corridors between pillars of neighboring chunks too
      const m = r + FIELD.gap / 2;
      const x = cx * C + m + rng() * (C - 2 * m), z = cz * C + m + rng() * (C - 2 * m);
      // keep the start point clear and leave corridors between pillars
      if (Math.hypot(x, z) < FIELD.clear || Math.abs(x) + r > halfX() - FIELD.gap || Math.abs(z) + r > halfZ() - FIELD.gap) continue;
      let ok = true;
      for (let j = from; j < out.length && ok; j++) ok = Math.hypot(out[j].x - x, out[j].z - z) > out[j].r + r + FIELD.gap;
      if (!ok) continue;
      out.push({ x, z, r, h: 1.6 + rng() * 2.2 });
      break;
    }
  }
}

let curX = NaN, curZ = NaN, curSeed = NaN, curMap = '';
const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), rot = new THREE.Quaternion();

function paint(): void {
  const p = MAPS[G.map].palette;
  applyPalette(p);
  pillarMat.color.setHex(p.pillar);
  capMat.color.setHex(p.cap);
  wallMat.color.setHex(p.wall);
  wallMat.emissive.setHex(p.wallGlow);
  voidMat.color.setHex(p.sky);
}

/** Slides the walls along with the mech; loads the pillars around it when it enters another chunk or a new run starts. */
export function updateField(): void {
  if (G.map !== curMap) paint();
  const hx = halfX(), hz = halfZ();
  wallsX.visible = hx < Infinity;
  if (wallsX.visible) {
    wallsX.position.z = Math.round(P.z / 10) * 10;
    for (const g of wallsX.children) g.position.x = g.userData.side * hx;
  }
  wallsZ.visible = hz < Infinity;
  if (wallsZ.visible) {
    wallsZ.position.x = Math.round(P.x / 10) * 10;
    for (const g of wallsZ.children) g.position.z = g.userData.side * hz;
  }
  const cx = Math.floor(P.x / FIELD.chunk), cz = Math.floor(P.z / FIELD.chunk);
  if (cx === curX && cz === curZ && G.fieldSeed === curSeed && G.map === curMap) return;
  curX = cx;
  curZ = cz;
  curSeed = G.fieldSeed;
  curMap = G.map;
  pillars.length = 0;
  for (let dx = -FIELD.near; dx <= FIELD.near; dx++) {
    for (let dz = -FIELD.near; dz <= FIELD.near; dz++) chunkPillars(cx + dx, cz + dz, pillars);
  }
  pillars.forEach((p, i) => {
    bodyMesh.setMatrixAt(i, m4.compose(pos.set(p.x, p.h / 2, p.z), rot, scl.set(p.r, p.h, p.r)));
    capMesh.setMatrixAt(i, m4.compose(pos.set(p.x, p.h + 0.04, p.z), rot, scl.set(p.r, 1, p.r)));
  });
  bodyMesh.count = capMesh.count = pillars.length;
  bodyMesh.instanceMatrix.needsUpdate = capMesh.instanceMatrix.needsUpdate = true;
}

updateField();

/** Moves a circle of radius `r` out of any pillar it overlaps. */
export function pushOutPillars(o: { x: number; z: number }, r: number): void {
  for (const p of pillars) {
    const ox = o.x - p.x, oz = o.z - p.z, rr = p.r + r, d2 = ox * ox + oz * oz;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 0.001;
      o.x = p.x + (ox / d) * rr;
      o.z = p.z + (oz / d) * rr;
    }
  }
}

export function insidePillar(x: number, z: number): boolean {
  for (const p of pillars) {
    const ox = x - p.x, oz = z - p.z;
    if (ox * ox + oz * oz < p.r * p.r) return true;
  }
  return false;
}
