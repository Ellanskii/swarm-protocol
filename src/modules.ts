// Branch modifiers that live in the world: napalm fires, cluster bomblets, the decoy hologram, designator marks,
// and the capstones that act on their own: orbital strike and chain lightning.
import { chainLightning, damage, explode } from './combat';
import { CHAIN, DECOY, DESIGNATOR, LIMITS, NAPALM, ORBITAL } from './config';
import { sparks } from './fx';
import { forNear } from './grid';
import { G, P, S } from './state';

/** Uses the grid, so runs after buildGrid(). */
export function updateModules(dt: number): void {
  for (const b of G.bomblets) {
    if (b.t <= 0) continue;
    if ((b.t -= dt) <= 0) explode(b.x, b.z, b.r, b.dmg, true);
  }

  for (const f of G.fires) {
    if (f.life <= 0) continue;
    f.life -= dt;
    if (Math.random() < dt * 14 * f.r) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * f.r;
      sparks(f.x + Math.sin(a) * d, 0.2, f.z + Math.cos(a) * d, Math.random() < 0.5 ? 0xff6b1a : 0xffb347, 1, 1.5);
    }
    if ((f.tick -= dt) > 0) continue;
    f.tick = NAPALM.tick;
    forNear(f.x, f.z, e => {
      if (!e.dead && (e.x - f.x) ** 2 + (e.z - f.z) ** 2 < (f.r + e.r) ** 2) damage(e, f.dps * NAPALM.tick, 0, 0, false);
    });
  }

  const dc = G.decoy;
  if (dc.life > 0 && (dc.life -= dt) <= 0) explode(dc.x, dc.z, DECOY.r, DECOY.dmg * S.dmg);

  if (S.orbital && (G.orbitalT -= dt) <= 0) {
    const spot = densestSpot(ORBITAL.range, ORBITAL.r);
    G.orbitalT = spot ? ORBITAL.every : 1;
    if (spot && G.strikes.length < LIMITS.strikes) {
      G.strikes.push({ x: spot[0], z: spot[1], t: 0, dur: ORBITAL.warn, r: ORBITAL.r, dmg: ORBITAL.dmg * S.dmg, friendly: true });
    }
  }
  if (S.chain && (G.chainT -= dt) <= 0) {
    G.chainT = CHAIN.every;
    chainLightning(P.x, P.z, CHAIN.jumps, CHAIN.dmg * S.dmg, CHAIN.range);
  }

  // marks run out; the designator picks the toughest unmarked machines in range
  for (const e of G.enemies) if (e.mark > 0) e.mark -= dt;
  if (S.mark && (G.designT -= dt) <= 0) {
    G.designT = DESIGNATOR.every;
    let marked = G.enemies.filter(e => !e.dead && e.mark > 0).length;
    const r2 = DESIGNATOR.range ** 2;
    const pool = G.enemies
      .filter(e => !e.dead && e.mark <= 0 && (e.x - P.x) ** 2 + (e.z - P.z) ** 2 < r2)
      .sort((a, b) => b.hp - a.hp);
    for (const e of pool) {
      if (marked >= S.mark) break;
      e.mark = DESIGNATOR.life;
      marked++;
      sparks(e.x, 1.5, e.z, 0xff3b3b, 4, 3);
    }
  }
}

/** Machine with the most neighbours within `r`, among a sample of those in `range` of the mech. */
function densestSpot(range: number, r: number): [number, number] | null {
  const r2 = range * range;
  const cands = G.enemies.filter(e => !e.dead && (e.x - P.x) ** 2 + (e.z - P.z) ** 2 < r2);
  let best: [number, number] | null = null, bk = 0;
  for (let i = 0; i < Math.min(30, cands.length); i++) {
    const c = cands[Math.floor(Math.random() * cands.length)];
    let k = 0;
    forNear(c.x, c.z, e => { if (!e.dead && (e.x - c.x) ** 2 + (e.z - c.z) ** 2 < r * r) k++; });
    if (k > bk) { bk = k; best = [c.x, c.z]; }
  }
  return best;
}
