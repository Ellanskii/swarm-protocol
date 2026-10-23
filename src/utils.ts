export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

export const fmtTime = (t: number): string =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
