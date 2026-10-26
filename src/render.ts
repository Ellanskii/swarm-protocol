// Pushes simulation state into meshes and moves the camera.
import * as THREE from 'three';
import { ENEMY_TYPES, LIMITS, SHOULDERS } from './config';
import { animateMech } from './mech';
import {
  bulletMesh, camera, enemyColors, enemyMeshes, eshotMesh, gemMesh,
  laser, laserGeo, muzzle, partMesh, sun,
} from './scene';
import { G, P, aim } from './state';
import { rand } from './utils';

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const white = new THREE.Color(1, 1, 1);

function writeInstance(
  mesh: THREE.InstancedMesh, i: number,
  x: number, y: number, z: number, ry: number,
  sx: number, sy: number, sz: number, col: THREE.Color,
): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, ry, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
  mesh.setColorAt(i, col);
}

function commit(mesh: THREE.InstancedMesh, n: number): void {
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

const counts = Object.fromEntries(ENEMY_TYPES.map(k => [k, 0])) as Record<(typeof ENEMY_TYPES)[number], number>;

export function renderWorld(dt: number, playing: boolean): void {
  const t = G.time;

  // enemies
  for (const k of ENEMY_TYPES) counts[k] = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    tmpC.copy(enemyColors[e.type]);
    if (e.flash > 0) tmpC.lerp(white, 0.85);
    const spawnK = Math.min(1, (t - e.born) * 4); // grow in
    const hopper = e.type === 'grunt' || e.type === 'runner';
    const bob = hopper ? Math.abs(Math.sin(t * 9 + e.id)) * 0.12 : Math.sin(t * 3 + e.id) * 0.15;
    const spins = e.type === 'boss' || e.type === 'spitter';
    const s = spawnK * (e.r / e.t.r); // the final boss is bigger than its type
    writeInstance(enemyMeshes[e.type], counts[e.type]++, e.x, e.t.y * s + bob, e.z, spins ? t * 1.5 + e.id : e.rot, s, s, s, tmpC);
  }
  for (const k of ENEMY_TYPES) commit(enemyMeshes[k], counts[k]);

  // projectiles
  // rockets and mortar shells share the bullet pool
  let n = 0;
  for (const b of G.bullets) {
    if (b.life <= 0) continue;
    tmpC.setHex(b.col);
    writeInstance(bulletMesh, n++, b.x, b.y, b.z, Math.atan2(b.vx, b.vz), b.s, b.s, b.s, tmpC);
  }
  tmpC.setHex(SHOULDERS.rockets.color);
  for (const r of G.rockets) {
    if (r.life <= 0 || n >= LIMITS.bullets) continue;
    writeInstance(bulletMesh, n++, r.x, r.y, r.z, Math.atan2(r.vx, r.vz), 1.8, 1.8, 0.8, tmpC);
  }
  tmpC.setHex(SHOULDERS.mortar.color);
  for (const s of G.shells) {
    if (s.life <= 0 || n >= LIMITS.bullets) continue;
    writeInstance(bulletMesh, n++, s.x, s.y, s.z, Math.atan2(s.tx - s.x0, s.tz - s.z0), 3, 3, 0.5, tmpC);
  }
  commit(bulletMesh, n);

  n = 0;
  tmpC.setHex(0xff6b35);
  const p = 1 + Math.sin(t * 20) * 0.15;
  for (const s of G.eshots) {
    if (s.life <= 0) continue;
    writeInstance(eshotMesh, n++, s.x, 1, s.z, 0, p, p, p, tmpC);
  }
  commit(eshotMesh, n);

  // xp gems: color and size by value
  n = 0;
  for (const g of G.gems) {
    if (g.dead) continue;
    // XP by value: blue, mint, pink; scrap is pale metal; cores are big violet orbs
    let s: number;
    if (g.kind === 'scrap') { tmpC.setHex(0xcfd6e6); s = g.v >= 5 ? 1.2 : 0.85; }
    else if (g.kind === 'core') { tmpC.setHex(0xb98cff); s = 2.4; }
    else {
      tmpC.setHex(g.v >= 20 ? 0xff5ef0 : g.v >= 5 ? 0x80ffdb : 0x4cc9f0);
      s = g.v >= 20 ? 1.8 : g.v >= 5 ? 1.35 : 1;
    }
    writeInstance(gemMesh, n++, g.x, 0.45 + Math.sin(t * 4 + g.ph) * 0.12, g.z, t * 2 + g.ph, s, s, s, tmpC);
  }
  commit(gemMesh, n);

  n = 0;
  for (const q of G.parts) {
    if (q.life <= 0) continue;
    tmpC.setHex(q.col);
    const s = q.s * (q.life / q.max);
    writeInstance(partMesh, n++, q.x, q.y, q.z, q.life * 10, s, s, s, tmpC);
  }
  commit(partMesh, n);

  // player
  animateMech(dt, playing);
  muzzle.intensity *= Math.exp(-28 * dt);

  // the laser follows the torso, so it shows where shots actually go while the torso turns
  const lp = laserGeo.attributes.position as THREE.BufferAttribute;
  lp.setXYZ(0, P.mx, P.my, P.mz);
  lp.setXYZ(1, P.tx, 1, P.tz);
  lp.needsUpdate = true;
  laser.visible = playing;
}

// ---------------- camera ----------------
export const camTarget = new THREE.Vector3();
const CAM_HEIGHT = 25;
const CAM_BACK = 13;

/** Follows the player with a lead toward the cursor, plus screen shake. */
export function updateCamera(dt: number): void {
  const ax = aim.x - P.x, az = aim.z - P.z, al = Math.hypot(ax, az) || 1;
  const lead = Math.min(al, 10) * 0.28;
  const k = 1 - Math.exp(-6 * dt);
  camTarget.x += (P.x + (ax / al) * lead - camTarget.x) * k;
  camTarget.z += (P.z + (az / al) * lead - camTarget.z) * k;

  G.shake *= Math.exp(-6 * dt);
  const s = G.shake * G.shake * 0.7;
  camera.position.set(camTarget.x + rand(-s, s), CAM_HEIGHT, camTarget.z + CAM_BACK + rand(-s, s));
  camera.lookAt(camTarget.x, 0, camTarget.z);
  sun.position.set(camTarget.x + 10, 30, camTarget.z + 6);
  sun.target.position.set(camTarget.x, 0, camTarget.z);
}
