// Pushes simulation state into meshes and moves the camera.
import * as THREE from 'three';
import { ENEMY_TYPES, LIMITS, MAPS, SHIELD_AURA, SHOULDERS, TANK } from './config';
import { animateMech, placeMechWreck, setMechRim } from './mech';
import {
  ENEMY_HOVER, beamMesh, bulletGlint, bulletHalo, bulletMesh, camera, cloudBall, cloudMat, cloudRing, cloudStem, debrisMesh, decoyMesh, domeMat, domeMesh, enemyColors, enemyParts, enemyRimColors, eshotGlint, eshotHalo, eshotMesh, gemMesh, scrapMesh,
  followFloor, groundRingMesh, laser, laserGeo, mineMesh, muzzle, partMesh, sun, wreckMeshes,
} from './scene';
import { G, P, aim } from './state';
import { rand } from './utils';

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const white = new THREE.Color(1, 1, 1);
const darkMetal = new THREE.Color(0x2a2f45);
const shieldTint = new THREE.Color(0x9fe8ff);
const tankShell = new THREE.Color(0xff2a2a);
const bodyC = new THREE.Color();
const darkC = new THREE.Color();
const glowC = new THREE.Color();
const wreckC = new THREE.Color(0x1b1f2e);
const emberC = new THREE.Color(0xff6b1a);

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

/**
 * Neon glow of a shot pool: the halo copies the shots' transforms and colors as they are, the floor glint drops them to the floor.
 * A switched-off pool draws nothing.
 */
function mirror(src: THREE.InstancedMesh, n: number, halo: THREE.InstancedMesh, haloOn: boolean, glint: THREE.InstancedMesh, glintOn: boolean): void {
  const mats = src.instanceMatrix.array.subarray(0, n * 16), cols = src.instanceColor!.array.subarray(0, n * 3);
  for (const [dst, on, floor] of [[halo, haloOn, false], [glint, glintOn, true]] as const) {
    if (!on) { dst.count = 0; continue; }
    const m = dst.instanceMatrix.array as Float32Array;
    m.set(mats);
    if (floor) for (let i = 0; i < n; i++) m[i * 16 + 13] = 0.05;
    dst.instanceColor!.array.set(cols);
    commit(dst, n);
  }
}

const counts = Object.fromEntries(ENEMY_TYPES.map(k => [k, 0])) as Record<(typeof ENEMY_TYPES)[number], number>;

export function renderWorld(dt: number, playing: boolean): void {
  const t = G.time;
  const pal = MAPS[G.map].palette;
  const rimOn = pal.modelRim !== false;

  // enemy machines: every part of a machine shares its transform, plus its own small animation
  for (const k of ENEMY_TYPES) counts[k] = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const i = counts[e.type]++;
    bodyC.copy(enemyColors[e.type]);
    darkC.copy(darkMetal);
    if (e.shielded) bodyC.lerp(shieldTint, 0.3);
    if (e.flash > 0) { bodyC.lerp(white, 0.85); darkC.lerp(white, 0.6); }
    const s = Math.min(1, (t - e.born) * 4) * (e.r / e.t.r); // grow in; the final boss is bigger than its type
    const hover = ENEMY_HOVER[e.type];
    const y = hover ? (hover + Math.sin(t * 5 + e.id) * 0.1) * s : 0;
    const step = Math.sin(t * 9 + e.id);
    for (const part of enemyParts[e.type]) {
      if (part.rim && !rimOn) continue;
      let py = y, ry = e.rot;
      if (part.anim === 'hull') ry = e.mrot;
      else if (part.anim === 'rotor') ry = t * 14 + e.id;
      else if (part.anim === 'legL') py += Math.max(0, step) * 0.16 * s;
      else if (part.anim === 'legR') py += Math.max(0, -step) * 0.16 * s;
      // neon outline: a near-white core in the middle of a tube of the type color
      const col = part.rim ? (part.mat === 'halo' ? enemyRimColors[e.type] : e.flash > 0 ? white : glowC.copy(enemyRimColors[e.type]).lerp(white, 0.6))
        : part.mat === 'body' ? bodyC : part.mat === 'dark' ? darkC : e.flash > 0 ? white : glowC.copy(part.glow);
      writeInstance(part.mesh, i, e.x, py, e.z, ry, s, s, s, col);
    }
  }
  for (const k of ENEMY_TYPES) for (const part of enemyParts[k]) commit(part.mesh, part.rim && !rimOn ? 0 : counts[k]);

  // debris chunks shrink away at the end of their life
  let n = 0;
  for (const d of G.debris) {
    if (d.life <= 0) continue;
    tmpC.setHex(d.col);
    const k = d.s * Math.min(1, d.life / 0.4);
    writeInstance(debrisMesh, n++, d.x, d.y, d.z, d.ry, k, k, k, tmpC);
  }
  commit(debrisMesh, n);

  // wrecks sink into the ground before they vanish
  for (const k of ENEMY_TYPES) counts[k] = 0;
  let mechSink: number | null = null;
  for (const w of G.wrecks) {
    if (w.life <= 0) continue;
    const sink = Math.max(0, 0.8 - w.life) * 0.6 * w.s;
    if (w.model === 'mech') { mechSink = sink; continue; }
    // charred metal with a faint hint of the machine's color, still glowing hot for a moment
    const hot = Math.max(0, 1 - (w.max - w.life) / 0.6);
    tmpC.copy(wreckC).lerp(enemyColors[w.model], 0.04).lerp(emberC, hot * 0.5);
    writeInstance(wreckMeshes[w.model], counts[w.model]++, w.x, -sink, w.z, w.rot, w.s, w.s, w.s, tmpC);
  }
  for (const k of ENEMY_TYPES) commit(wreckMeshes[k], counts[k]);
  placeMechWreck(mechSink);

  // ground rings: artillery warnings (outer edge + filling disc)
  n = 0;
  for (const st of G.strikes) {
    if (st.t >= st.dur) continue;
    const p = st.t / st.dur;
    tmpC.setHex(st.friendly ? 0x4cc9f0 : 0xff5a36).multiplyScalar(0.6 + 0.4 * Math.sin(t * 20));
    writeInstance(groundRingMesh, n++, st.x, 0, st.z, 0, st.r, 1, st.r, tmpC);
    tmpC.setHex(st.friendly ? 0x9fe8ff : 0xffb347).multiplyScalar(0.8);
    writeInstance(groundRingMesh, n++, st.x, 0, st.z, 0, st.r * p, 1, st.r * p, tmpC);
  }
  const cap = groundRingMesh.instanceMatrix.count;
  // napalm: a flickering edge and a hot core
  for (const f of G.fires) {
    if (f.life <= 0 || n + 2 > cap) continue;
    const k = Math.min(1, f.life / 0.5);
    tmpC.setHex(0xff6b1a).multiplyScalar(k * (0.7 + 0.3 * Math.sin(t * 17 + f.x)));
    writeInstance(groundRingMesh, n++, f.x, 0, f.z, 0, f.r, 1, f.r, tmpC);
    tmpC.setHex(0xffb347).multiplyScalar(k * 0.6);
    writeInstance(groundRingMesh, n++, f.x, 0, f.z, 0, f.r * 0.55, 1, f.r * 0.55, tmpC);
  }
  // designator marks: a red ring that tightens around the target
  tmpC.setHex(0xff3b3b);
  for (const e of G.enemies) {
    if (e.dead || e.mark <= 0 || n >= cap) continue;
    const r = e.r + 0.35 + 0.15 * Math.sin(t * 8);
    writeInstance(groundRingMesh, n++, e.x, 0, e.z, 0, r, 1, r, tmpC);
  }
  const dc = G.decoy;
  decoyMesh.visible = dc.life > 0;
  if (dc.life > 0) {
    decoyMesh.position.set(dc.x, 0, dc.z);
    decoyMesh.material.opacity = 0.25 + 0.15 * Math.sin(t * 20);
    tmpC.setHex(0x80ffdb).multiplyScalar(0.6);
    const r = 1.2 + ((t * 2) % 1) * 1.5;
    if (n < cap) writeInstance(groundRingMesh, n++, dc.x, 0, dc.z, 0, r, 1, r, tmpC);
  }
  commit(groundRingMesh, n);

  // shield domes flicker when a bearer is hit; they grow in with the machine
  n = 0;
  domeMat.uniforms.uTime.value = t;
  for (const e of G.enemies) {
    if (e.dead || e.type !== 'shield' || n >= domeMesh.instanceMatrix.count) continue;
    tmpC.copy(shieldTint).multiplyScalar(0.8 + Math.sin(t * 3 + e.id) * 0.15 + (e.flash > 0 ? 0.8 : 0));
    const r = SHIELD_AURA.r * Math.min(1, (t - e.born) * 2);
    writeInstance(domeMesh, n++, e.x, 0, e.z, 0, r, r * 0.55, r, tmpC);
  }
  commit(domeMesh, n);

  renderMushrooms(t);

  // mines: dark while arming, blinking red once live
  n = 0;
  for (const m of G.mines) {
    if (m.dead) continue;
    tmpC.setHex(m.arm > 0 ? 0x3a3f55 : Math.sin(t * 10 + m.x) > 0 ? 0xff3b3b : 0x5a1a1a);
    writeInstance(mineMesh, n++, m.x, 0, m.z, 0, 1, 1, 1, tmpC);
  }
  commit(mineMesh, n);

  // beams: the laser flickers in width, the railgun slug trail thins and fades
  n = 0;
  // aiming tanks: a thin red sight line to the mech that brightens right before the shot
  for (const e of G.enemies) {
    if (e.dead || e.aim <= 0 || n >= beamMesh.instanceMatrix.count) continue;
    const len = Math.hypot(P.x - e.x, P.z - e.z), k = 1 - e.aim / TANK.aim;
    tmpC.setHex(0xff2a2a).multiplyScalar(0.3 + 0.7 * k);
    writeInstance(beamMesh, n++, e.x, 1, e.z, Math.atan2(P.x - e.x, P.z - e.z), 0.05 + 0.05 * k, 0.05, len, tmpC);
  }
  for (const b of G.beams) {
    if (b.life <= 0) continue;
    const k = b.life / b.max;
    const len = Math.hypot(b.x2 - b.x1, b.z2 - b.z1), w = b.w * (b.flicker ? rand(0.7, 1.2) : k);
    tmpC.setHex(b.col).multiplyScalar(b.flicker ? 1 : 0.3 + 0.7 * k);
    writeInstance(beamMesh, n++, b.x1, b.y, b.z1, Math.atan2(b.x2 - b.x1, b.z2 - b.z1), w, w, len, tmpC);
    b.life -= dt;
  }
  commit(beamMesh, n);

  // projectiles
  // rockets and mortar shells share the bullet pool
  n = 0;
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
  const glints = pal.floorGlint !== false, halos = pal.shotHalo !== false;
  mirror(bulletMesh, n, bulletHalo, halos, bulletGlint, glints);

  n = 0;
  tmpC.setHex(0xff6b35);
  const p = 1 + Math.sin(t * 20) * 0.15;
  for (const s of G.eshots) {
    if (s.life <= 0) continue;
    // tank shells are bigger and darker red
    const k = s.blast ? p * 1.7 : p;
    writeInstance(eshotMesh, n++, s.x, 1, s.z, 0, k, k, k, s.blast ? tankShell : tmpC);
  }
  commit(eshotMesh, n);
  mirror(eshotMesh, n, eshotHalo, halos, eshotGlint, glints);

  // xp gems: color and size by value; scrap is a spinning gear of its own mesh, big pieces in brass
  n = 0;
  let ns = 0;
  for (const g of G.gems) {
    if (g.dead) continue;
    const y = 0.45 + Math.sin(t * 4 + g.ph) * 0.12;
    if (g.kind === 'scrap') {
      const big = g.v >= 5;
      tmpC.setHex(big ? 0xe0b25a : 0xcfd6e6);
      const s = big ? 1.3 : 1;
      writeInstance(scrapMesh, ns++, g.x, y, g.z, t * 2.5 + g.ph, s, s, s, tmpC);
      continue;
    }
    // XP: blue, mint, pink; cores are big violet orbs
    let s: number;
    if (g.kind === 'core') { tmpC.setHex(0xb98cff); s = 2.4; }
    else {
      tmpC.setHex(g.v >= 20 ? 0xff5ef0 : g.v >= 5 ? 0x80ffdb : 0x4cc9f0);
      s = g.v >= 20 ? 1.8 : g.v >= 5 ? 1.35 : 1;
    }
    writeInstance(gemMesh, n++, g.x, y, g.z, t * 2 + g.ph, s, s, s, tmpC);
  }
  commit(gemMesh, n);
  commit(scrapMesh, ns);

  n = 0;
  for (const q of G.parts) {
    if (q.life <= 0) continue;
    tmpC.setHex(q.col);
    const s = q.s * (q.life / q.max);
    writeInstance(partMesh, n++, q.x, q.y, q.z, q.life * 10, s, s, s, tmpC);
  }
  commit(partMesh, n);

  // player
  setMechRim(rimOn);
  animateMech(dt, playing);
  muzzle.intensity *= Math.exp(-28 * dt);

  // the laser runs parallel to the torso facing like the shots, so it shows where they actually go while the torso turns
  const lp = laserGeo.attributes.position as THREE.BufferAttribute;
  const reach = Math.hypot(P.tx - P.x, P.tz - P.z);
  lp.setXYZ(0, P.mx, P.my, P.mz);
  lp.setXYZ(1, P.mx + Math.sin(P.ang) * reach, 1, P.mz + Math.cos(P.ang) * reach);
  lp.needsUpdate = true;
  laser.visible = playing;
}

// ---------------- mushroom clouds ----------------

const SMOKE = new THREE.Color(0x76696a);
const FIRE = new THREE.Color(0xff6a1a);
/** Over-bright on purpose: no tone mapping, so it clips to a blinding white-yellow. */
const FLASH = new THREE.Color(0xfff1b8).multiplyScalar(1.8);
const cloudC = new THREE.Color();

/** Heat 1 = white-hot flash, 0.5 = fire, 0 = cold smoke. */
function cloudColor(heat: number): THREE.Color {
  return heat > 0.5 ? cloudC.copy(FIRE).lerp(FLASH, (heat - 0.5) * 2) : cloudC.copy(SMOKE).lerp(FIRE, heat * 2);
}

function writeCloud(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, col: THREE.Color, a: number): void {
  writeInstance(mesh, i, x, y, z, 0, sx, sy, sz, col);
  (mesh.geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute).setX(i, a);
}

/**
 * A classic mushroom: a fireball flashes on the ground, then the cap rolls upward on a stem
 * while everything cools from white through orange to brown smoke and fades.
 */
function renderMushrooms(t: number): void {
  let nb = 0, nr = 0, ns = 0;
  for (const m of G.mushrooms) {
    if (m.t >= m.dur) continue;
    const p = m.t / m.dur, r = m.r;
    const rise = 1 - (1 - Math.min(1, p / 0.55)) ** 3; // fast start, eases into place
    const h = r * 1.5 * rise;
    const heat = Math.max(0, 1 - p * 1.2);
    const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    // fireball: blinding at first, swallowed by the cap
    if (p < 0.22) {
      const k = p / 0.22, s = r * (0.35 + 0.45 * k);
      writeCloud(cloudBall, nb++, m.x, s * 0.5 + h * 0.4, m.z, s, s, s, cloudColor(1), 1 - k * k);
    }
    const capR = r * (0.28 + 0.34 * rise);
    writeCloud(cloudRing, nr++, m.x, h, m.z, capR, capR * 0.9, capR, cloudColor(heat), fade);
    writeCloud(cloudBall, nb++, m.x, h + capR * 0.25, m.z, capR * 1.05, capR * 0.6, capR * 1.05, cloudColor(heat * 0.9), fade);
    // stem stays a bit darker and thins as it cools
    const stemR = r * 0.12 * (1 - p * 0.4);
    writeCloud(cloudStem, ns++, m.x, 0, m.z, stemR, Math.max(0.01, h), stemR, cloudColor(heat * 0.7), fade * 0.95);
    // ground skirt: a dust ring rolling outward
    const skirt = r * (0.35 + 0.4 * rise);
    writeCloud(cloudRing, nr++, m.x, 0.15, m.z, skirt, skirt * 0.18, skirt, cloudColor(heat * 0.3), fade * 0.45);
  }
  cloudMat.uniforms.uTime.value = t;
  for (const [mesh, n] of [[cloudBall, nb], [cloudRing, nr], [cloudStem, ns]] as const) {
    commit(mesh, n);
    (mesh.geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
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
  followFloor(camTarget.x, camTarget.z);
}
