// Player movement, dash, taking damage.
import { pushOutPillars } from './arena';
import { sfx } from './audio';
import { ARENA } from './config';
import { flashVignette, sparks } from './fx';
import { moveInput } from './input';
import { G, P, S, aim } from './state';
import { clamp } from './utils';

const RADIUS = 0.5;
const SPEED = 7;
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
    const sp = SPEED * S.speed;
    vx = mx * sp;
    vz = mz * sp;
  }
  P.moving = !!(mx || mz);
  P.x += vx * dt;
  P.z += vz * dt;
  pushOutPillars(P, RADIUS);
  P.x = clamp(P.x, -ARENA + RADIUS, ARENA - RADIUS);
  P.z = clamp(P.z, -ARENA + RADIUS, ARENA - RADIUS);

  if (S.regen) P.hp = Math.min(P.maxHp, P.hp + S.regen * dt);

  // face the cursor; muzzle sits forward and slightly to the right
  P.ang = Math.atan2(aim.x - P.x, aim.z - P.z);
  const fx = Math.sin(P.ang), fz = Math.cos(P.ang);
  P.mx = P.x + fx * 0.95 + fz * 0.32;
  P.mz = P.z + fz * 0.95 - fx * 0.32;
}

/** Applies damage unless invulnerable. Death is detected by the main loop (P.hp <= 0). */
export function hurt(amount: number): void {
  if (P.inv > 0 || G.state !== 'play') return;
  P.hp = Math.max(0, P.hp - amount);
  P.inv = 0.6;
  P.blink = 0.6;
  G.shake = Math.min(1.2, G.shake + 0.55);
  flashVignette();
  sfx('hurt');
}
