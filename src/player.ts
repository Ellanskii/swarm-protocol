// Player movement, dash, taking damage.
import { pushOutPillars } from './arena';
import { sfx } from './audio';
import { ARENA, MECHS } from './config';
import { flashVignette, sparks } from './fx';
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
const DASH_COOLDOWN = 2;

export const dashCooldown = (): number => DASH_COOLDOWN * S.dashMul;

export function tryDash(): void {
  if (P.dashCd > 0) return;
  let [dx, dz] = moveInput();
  if (!dx && !dz) { dx = Math.sin(P.ang); dz = Math.cos(P.ang); }
  P.ddx = dx;
  P.ddz = dz;
  P.dashT = DASH_TIME;
  P.dashCd = dashCooldown();
  P.inv = Math.max(P.inv, 0.25);
  sfx('dash');
}

export function updatePlayer(dt: number): void {
  const [mx, mz] = moveInput();
  P.dashCd -= dt;
  P.inv -= dt;
  P.blink -= dt;

  let vx: number, vz: number;
  if (P.dashT > 0) {
    P.dashT -= dt;
    vx = P.ddx * DASH_SPEED;
    vz = P.ddz * DASH_SPEED;
    sparks(P.x, 0.5, P.z, 0x4cc9f0, 1, 2);
  } else {
    const sp = MECHS[G.mech].speed * S.speed;
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
  P.ang = turnToward(P.ang, Math.atan2(aim.x - P.x, aim.z - P.z), MECHS[G.mech].turnRate * dt);
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

/** Applies damage unless invulnerable. Death is detected by the main loop (P.hp <= 0). */
export function hurt(amount: number): void {
  if (P.inv > 0 || G.state !== 'play') return;
  // god mode keeps the hit feedback so damage sources stay visible while testing
  if (!G.god) P.hp = Math.max(0, P.hp - amount);
  P.inv = 0.6;
  P.blink = 0.6;
  G.shake = Math.min(1.2, G.shake + 0.55);
  flashVignette();
  sfx('hurt');
}
