// Player movement, dash, mech passives, taking damage.
import { keepInField, pushOutPillars } from './arena';
import { sfx } from './audio';
import { damage, explode } from './combat';
import { DECOY, JUMP, MECHS, PHASE, RAM, REACTIVE, SHIELD, TRAIL } from './config';
import { flashVignette, sparks } from './fx';
import { forNear } from './grid';
import { moveInput } from './input';
import { jumpHeight, muzzleOffset } from './mech';
import { G, P, S, aim, armWeapons, braced, type DashMod } from './state';

const RADIUS = 0.5;
/** Legs turn toward the movement direction this fast, rad/s. */
const LEG_TURN = 10;
/** Closer than this, the torso aim point stops converging on the cursor. */
const MIN_AIM_DIST = 3;
const DASH_SPEED = 23;
const DASH_TIME = 0.17;

export const dashCooldown = (): number => MECHS[G.mech].dash.cd * S.dashMul;


export function tryDash(): void {
  if (P.dashCharges <= 0 || P.dashT > 0) return;
  let [dx, dz] = moveInput();
  const l = Math.hypot(dx, dz);
  if (l < 0.1) { dx = Math.sin(P.legAng); dz = Math.cos(P.legAng); }
  else { dx /= l; dz /= l; }
  P.ddx = dx;
  P.ddz = dz;
  // jump jets: a longer, invulnerable leap; phase: a short blink
  const mod = G.dashMod;
  const time = mod === 'jump' ? JUMP.time : mod === 'phase' ? PHASE.time : DASH_TIME;
  P.dashT = P.dashMax = time;
  if (P.dashCharges-- === MECHS[G.mech].dash.charges) P.dashCd = dashCooldown();
  P.inv = Math.max(P.inv, mod === 'dash' ? 0.25 : time + 0.15);
  P.trailT = 0;
  G.dashId++;
  if (mod === 'phase' && !G.vent.on) G.heat = Math.max(0, G.heat - PHASE.vent);
  if (mod === 'decoy') Object.assign(G.decoy, { x: P.x, z: P.z, life: DECOY.life });
  sfx('dash');
}

const DASH_SPEED_BY: Record<DashMod, number> = { dash: DASH_SPEED, decoy: DASH_SPEED, ram: DASH_SPEED, jump: JUMP.speed, phase: PHASE.speed };

/** Ram and phase dashes hit every machine they pass, once per dash. */
function dashHits(): void {
  const ram = G.dashMod === 'ram';
  const reach = ram ? RAM.r : PHASE.r;
  for (const e of G.enemies) {
    if (e.dead || e.dashHit === G.dashId) continue;
    if ((e.x - P.x) ** 2 + (e.z - P.z) ** 2 > (reach + e.r) ** 2) continue;
    e.dashHit = G.dashId;
    if (ram) {
      // a steel ram: armor does not help, light machines fly off
      damage(e, RAM.dmg * S.dmg, P.ddx * RAM.push / e.r, P.ddz * RAM.push / e.r, true, false, 99);
      sparks(e.x, 0.8, e.z, 0xffd166, 8, 7);
      G.shake = Math.min(1.2, G.shake + 0.15);
    } else {
      damage(e, PHASE.dmg * S.dmg, 0, 0, true, true);
      sparks(e.x, 1, e.z, 0xb98cff, 6, 5);
    }
  }
}

export function updatePlayer(dt: number): void {
  const [mx, mz] = moveInput();
  const mech = MECHS[G.mech];
  // charges come back one at a time
  if (P.dashCharges < mech.dash.charges) {
    P.dashCd -= dt;
    if (P.dashCd <= 0) {
      P.dashCharges++;
      P.dashCd = P.dashCharges < mech.dash.charges ? dashCooldown() : 0;
    }
  }
  P.inv -= dt;
  P.blink -= dt;
  G.reactiveCd -= dt;
  P.calm += dt;
  if (P.maxShield && P.calm >= SHIELD.delay) P.shield = Math.min(P.maxShield, P.shield + SHIELD.regen * dt);

  let vx: number, vz: number;
  if (P.dashT > 0) {
    P.dashT -= dt;
    const mod = G.dashMod;
    const sp = DASH_SPEED_BY[mod];
    vx = P.ddx * sp;
    vz = P.ddz * sp;
    if (mod === 'ram' || mod === 'phase') dashHits();
    if (mod === 'phase') sparks(P.x, 1, P.z, 0xb98cff, 3, 2);
    else if (mod === 'jump') {
      sparks(P.x, jumpHeight() + 0.6, P.z, 0xff8c42, 2, 3);
      if (P.dashT <= 0) {
        // landing slam
        explode(P.x, P.z, JUMP.r, JUMP.dmg * S.dmg);
        G.shake = Math.min(1.2, G.shake + 0.4);
      }
    } else sparks(P.x, 0.5, P.z, 0x4cc9f0, 1, 2);
    if (mech.trail && (P.trailT -= dt) <= 0) {
      P.trailT = TRAIL.every;
      G.trails.push({ x: P.x, z: P.z, life: TRAIL.life, tick: 0 });
    }
  } else {
    const sp = mech.speed * S.speed;
    vx = mx * sp;
    vz = mz * sp;
  }
  P.moving = !!(mx || mz);
  // the Artillerist plants its supports after standing still for a moment
  const wasBraced = braced();
  P.still = P.moving || P.dashT > 0 ? 0 : P.still + dt;
  if (!wasBraced && braced()) {
    for (const s of [-1, 1]) sparks(P.x + Math.cos(P.legAng) * 0.5 * s, 0.1, P.z - Math.sin(P.legAng) * 0.5 * s, 0xff8c42, 5, 3);
    sfx('brace');
  }
  P.speed = Math.hypot(vx, vz);
  if (P.speed > 0.1) P.legAng = turnToward(P.legAng, Math.atan2(vx, vz), LEG_TURN * dt);
  P.x += vx * dt;
  P.z += vz * dt;
  pushOutPillars(P, RADIUS);
  keepInField(P, RADIUS);

  if (S.regen) P.hp = Math.min(P.maxHp, P.hp + S.regen * dt);

  // the torso turns toward the aim point with inertia; the aim laser starts at the right arm.
  // A single arm weapon puts its own fire line (and the laser) on the aim point instead of the torso center,
  // otherwise a machine right in front of the mech slips past the barrel
  const arms = armWeapons(), single = arms.length === 1;
  const [fwd, right, y] = muzzleOffset(single ? arms[0].slot : 'armR');
  const ax = aim.x - P.x, az = aim.z - P.z, ad = Math.hypot(ax, az);
  const want = Math.atan2(ax, az) - (single ? Math.asin(Math.max(-0.9, Math.min(0.9, right / (ad || 1)))) : 0);
  P.ang = turnToward(P.ang, want, mech.turnRate * dt);
  P.aimErr = Math.abs(Math.atan2(Math.sin(want - P.ang), Math.cos(want - P.ang)));
  const fx = Math.sin(P.ang), fz = Math.cos(P.ang);
  P.mx = P.x + fx * fwd + fz * right;
  P.mz = P.z + fz * fwd - fx * right;
  P.my = y;
  const d = Math.max(MIN_AIM_DIST, ad);
  P.tx = P.x + fx * d;
  P.tz = P.z + fz * d;
}

/** Rotates angle `a` toward `b` by at most `step`, the short way around. */
function turnToward(a: number, b: number, step: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return Math.abs(diff) <= step ? b : a + Math.sign(diff) * step;
}

/** Scout dash trail: burns enemies standing in it. Uses the grid, so runs after buildGrid(). */
export function updateTrails(dt: number): void {
  for (const t of G.trails) {
    t.life -= dt;
    if (t.life <= 0) continue;
    if (Math.random() < dt * 8) sparks(t.x, 0.15, t.z, 0x80ffdb, 1, 1.5);
    if ((t.tick -= dt) > 0) continue;
    t.tick = TRAIL.tick;
    forNear(t.x, t.z, e => {
      if (!e.dead && (e.x - t.x) ** 2 + (e.z - t.z) ** 2 < (TRAIL.r + e.r) ** 2) damage(e, TRAIL.dmg * S.dmg, 0, 0, false);
    });
  }
}

/** Applies damage unless invulnerable; the shield soaks it first. Death is detected by the main loop (P.hp <= 0). */
export function hurt(amount: number): void {
  if (P.inv > 0 || G.state !== 'play' || G.evacT > 0 || G.deathT > 0) return;
  P.calm = 0;
  amount *= 1 - (MECHS[G.mech].armor ?? 0);
  if (S.reactive && G.reactiveCd <= 0) {
    G.reactiveCd = REACTIVE.cd;
    explode(P.x, P.z, REACTIVE.r, REACTIVE.dmg * (1 + 0.5 * (S.reactive - 1)) * S.dmg);
  }
  const soak = Math.min(P.shield, amount);
  P.shield -= soak;
  amount -= soak;
  if (amount <= 0) {
    P.inv = 0.35;
    sparks(P.x, 1.4, P.z, 0x4cc9f0, 6, 5);
    G.shake = Math.min(1.2, G.shake + 0.2);
    sfx('shield');
    return;
  }
  // god mode keeps the hit feedback so damage sources stay visible while testing
  if (!G.god) P.hp = Math.max(0, P.hp - amount);
  P.inv = 0.6;
  P.blink = 0.6;
  G.shake = Math.min(1.2, G.shake + 0.55);
  flashVignette();
  sfx('hurt');
}
