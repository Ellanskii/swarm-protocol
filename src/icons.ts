// Vector icons for tech nodes and run upgrades: one file per icon in src/icons/, neon line art on a 24×24 grid.
// Tech nodes and the upgrades they unlock share ids, so one set serves the base and the level-up cards.
// The files carry a preview color; in the game `.ico` resets it, and the strokes follow the frame color.

const FILES = import.meta.glob<string>('./icons/*.svg', { query: '?raw', import: 'default', eager: true });
const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, svg]) => [path.slice('./icons/'.length, -'.svg'.length), svg.trim()]),
);

// tech nodes whose id differs from the upgrade they stand for
const ALIAS: Record<string, string> = {
  ballistics: 'dmg', armor: 'hp', servo: 'speed',
  // evolved arm weapons wear their evolution's icon
  plasma: 'evoPlasma', siege: 'evoSiege', minigun: 'evoMinigun', arclauncher: 'evoArc',
};

/** Inline SVG for a tech node or run upgrade; unknown ids get the command-center mark. */
export function icon(id: string): string {
  return (ICONS[ALIAS[id] ?? id] ?? ICONS.core).replace('<svg ', '<svg class="ico" aria-hidden="true" ');
}
