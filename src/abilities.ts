// Static field aura around the mech.
import { damage } from './combat';
import { sparks } from './fx';
import { auraMesh, auraRing } from './scene';
import { G, P, S } from './state';

const AURA_TICK = 0.45;

export function updateAura(dt: number): void {
  const on = S.aura > 0 && G.deathT <= 0;
  auraMesh.visible = auraRing.visible = on;
  if (!on) return;

  const r = 2.4 + 0.5 * S.aura;
  const pulse = 1 + Math.sin(G.time * 6) * 0.03;
  auraMesh.position.set(P.x, 0.03, P.z);
  auraMesh.scale.setScalar(r * pulse);
  auraRing.position.set(P.x, 0.04, P.z);
  auraRing.scale.setScalar(r * pulse);

  G.auraT -= dt;
  if (G.auraT > 0) return;
  G.auraT = AURA_TICK;
  const dmg = (5 + 4 * S.aura) * S.dmg;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
    if (d < r + e.r) {
      damage(e, dmg, (dx / d) * 1.5 / e.r, (dz / d) * 1.5 / e.r, false);
      sparks(e.x, 0.8, e.z, 0x9bb4ff, 2, 3);
    }
  }
}
