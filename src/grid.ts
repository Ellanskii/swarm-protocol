// Uniform spatial hash over enemies, rebuilt every frame.
// Used for enemy separation and bullet hit tests.
import { G, type Enemy } from './state';

const CELL = 3;
const grid = new Map<number, number[]>();
const key = (cx: number, cz: number) => (cx + 200) * 1000 + (cz + 200);

export function buildGrid(): void {
  grid.clear();
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const k = key(Math.floor(e.x / CELL), Math.floor(e.z / CELL));
    let a = grid.get(k);
    if (!a) { a = []; grid.set(k, a); }
    a.push(i);
  }
}

/**
 * Calls `fn` for every enemy in the 3×3 cells around (x, z).
 * Return `true` from `fn` to stop early.
 * Indices stay valid until the enemy list is compacted at the end of the frame.
 */
export function forNear(x: number, z: number, fn: (e: Enemy) => boolean | void): void {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get(key(cx + dx, cz + dz));
      if (!a) continue;
      for (let n = 0; n < a.length; n++) if (fn(G.enemies[a[n]]) === true) return;
    }
  }
}
