// Player movement, dash, mech passives, taking damage.
import { pushOutPillars } from './arena';
import { sfx } from './audio';
import { damage } from './combat';
import { ARENA, MECHS, SHIELD, TRAIL } from './config';
import { flashVignette, sparks } from './fx';
import { forNear } from './grid';
import { moveInput } from './input';
import { muzzleOffset } from './mech';
import { G, P, S, aim } from './state';
import { clamp } from './utils';

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
  P.dashT = DASH_TIME;
  if (P.dashCharges-- === MECHS[G.mech].dash.charges) P.dashCd = dashCooldown();
  P.inv = Math.max(P.inv, 0.25);
  P.trailT = 0;
  sfx('dash');
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
  P.calm += dt;
  if (P.maxShield && P.calm >= SHIELD.delay) P.shield = Math.min(P.maxShield, P.shield + SHIELD.regen * dt);

  let vx: number, vz: number;
  if (P.dashT > 0) {
    P.dashT -= dt;
    vx = P.ddx * DASH_SPEED;
    vz = P.ddz * DASH_SPEED;
    sparks(P.x, 0.5, P.z, 0x4cc9f0, 1, 2);
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
  P.speed = Math.hypot(vx, vz);
  if (P.speed > 0.1) P.legAng = turnToward(P.legAng, Math.atan2(vx, vz), LEG_TURN * dt);
  P.x += vx * dt;
  P.z += vz * dt;
  pushOutPillars(P, RADIUS);
  P.x = clamp(P.x, -ARENA + RADIUS, ARENA - RADIUS);
  P.z = clamp(P.z, -ARENA + RADIUS, ARENA - RADIUS);

  if (S.regen) P.hp = Math.min(P.maxHp, P.hp + S.regen * dt);

  // the torso turns toward the aim point with inertia; muzzle sits on the right arm
  P.ang = turnToward(P.ang, Math.atan2(aim.x - P.x, aim.z - P.z), mech.turnRate * dt);
  const fx = Math.sin(P.ang), fz = Math.cos(P.ang);
  const [fwd, right, y] = muzzleOffset();
  P.mx = P.x + fx * fwd + fz * right;
  P.mz = P.z + fz * fwd - fx * right;
  P.my = y;
  const d = Math.max(MIN_AIM_DIST, Math.hypot(aim.x - P.x, aim.z - P.z));
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
  if (P.inv > 0 || G.state !== 'play') return;
  P.calm = 0;
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
