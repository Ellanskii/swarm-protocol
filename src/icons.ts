// Vector icons for tech nodes and run upgrades: neon line art on a 24×24 grid, drawn in currentColor.
// Tech nodes and the upgrades they unlock share ids, so one table serves the base and the level-up cards.

const MECH = '<path d="M8 6h8v7H8z"/><path d="M10 13l-2 8M14 13l2 8M6 21h4M14 21h4"/>';
const EXPLOSION = 'M12 2L13.7 7.8L19.1 4.9L16.2 10.3L22 12L16.2 13.7L19.1 19.1L13.7 16.2L12 22L10.3 16.2L4.9 19.1L7.8 13.7L2 12L7.8 10.3L4.9 4.9L10.3 7.8z';
const GEAR = 'M18.7 10.1L21.4 10.3L21.4 13.7L18.7 13.9L18.1 15.4L19.8 17.4L17.4 19.8L15.4 18.1L13.9 18.7L13.7 21.4L10.3 21.4L10.1 18.7L8.6 18.1L6.6 19.8L4.2 17.4L5.9 15.4L5.3 13.9L2.6 13.7L2.6 10.3L5.3 10.1L5.9 8.6L4.2 6.6L6.6 4.2L8.6 5.9L10.1 5.3L10.3 2.6L13.7 2.6L13.9 5.3L15.4 5.9L17.4 4.2L19.8 6.6L18.1 8.6z';
const BOLT = 'M13 2L5 13h6l-1 9 8-11h-6z';

const ICONS: Record<string, string> = {
  core: '<path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><path d="M12 8l4 4-4 4-4-4z"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  heal: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',

  // ballistics
  dmg: '<path d="M9 20V10l3-6 3 6v10z"/><path d="M7 20h10M9 14h6"/>',
  rate: '<path d="M11 19v-8l3-6 3 6v8z"/><path d="M2 9h6M3 13h5M2 17h6"/>',
  mag: '<path d="M8 3h8v6l2 12h-7L8 9z"/><path d="M8 7h8M10 3V1.5M14 3V1.5"/>',
  belts: '<path d="M4 17v-6l2-4 2 4v6zM10 17v-6l2-4 2 4v6zM16 17v-6l2-4 2 4v6z"/><path d="M2 17h20v3H2z"/>',
  reload: '<path d="M19 12a7 7 0 1 1-2-4.9"/><path d="M19 3v5h-5"/>',
  autoload: '<path d="M19 12a7 7 0 1 1-2-4.9"/><path d="M19 3v5h-5"/><path d="M11 16v-4l1-2 1 2v4z"/>',
  multi: '<path d="M3 6h13v4H3zM3 14h13v4H3z"/><path d="M18 8h3M18 16h3"/>',
  pierce: '<path d="M2 12h19M17 8l4 4-4 4"/><path d="M8 4v5M8 15v5M13 4v5M13 15v5"/>',
  pen: '<path d="M3 12h11"/><path d="M14 9l5 3-5 3z"/><path d="M3 9l3 3-3 3"/><path d="M21 4v16"/>',
  reactive: '<path d="M5 10h14v11H5z"/><path d="M5 15.5h14M12 10v11"/><path d="M12 2v4M6 3l2 3.5M18 3l-2 3.5"/>',
  ram: '<path d="M2 7h10l6 5-6 5H2z"/><path d="M21 5l-1.5 3M22 12h-2M21 19l-1.5-3"/>',
  mg: '<path d="M2 9h5v6H2z"/><path d="M7 10h10v4H7z"/><path d="M10 10v4M13 10v4M17 12h5"/><path d="M4 15v4"/>',
  cannon: '<path d="M2 9h4v6H2z"/><path d="M6 10h11v4H6z"/><path d="M17 8h4v8h-4z"/>',
  shotgun: '<path d="M2 10h9v4H2z"/><path d="M14 12l7-5M14 12h7M14 12l7 5"/>',
  railgun: '<path d="M2 7h15M2 17h15"/><path d="M8 7v10M12 7v10"/><path d="M4 12h18"/>',
  flak: '<path d="M4 21h11l-2-4H6z"/><path d="M8 17l6-10M11 17l6-10"/><circle cx="19" cy="4" r="2"/>',
  arsenal: '<path d="M3 8h14a5 5 0 0 1-5 5v3h3v4H6v-4h3v-3H8a5 5 0 0 1-5-5z"/><path d="M19 2v3M21 4h-3"/>',
  bastion: `${MECH}<path d="M3 6h5v7H3zM16 6h5v7h-5z"/>`,

  // rockets
  warheads: '<circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10" stroke-dasharray="3 3"/>',
  rockets: '<path d="M12 2c3 3 3 8 2 12h-4c-1-4-1-9 2-12z"/><path d="M10 13l-3 3v4l3-2M14 13l3 3v4l-3-2M12 17v5"/>',
  launcher: '<path d="M2 9h14v6H2z"/><path d="M16 10.5h3l3 1.5-3 1.5h-3"/><path d="M6 15v4"/>',
  jump: '<path d="M12 2l5 6h-3v6h-4V8H7z"/><path d="M9 17l-1 4M12 17v5M15 17l1 4"/>',
  explode: `<path d="${EXPLOSION}"/>`,
  cluster: '<circle cx="12" cy="7" r="4"/><circle cx="5" cy="17" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="17" r="2"/><path d="M8.5 10L6 14M12 11v6M15.5 10l2.5 4"/>',
  napalm: '<path d="M12 20c-3.5 0-6-2.5-6-6 0-3 2-5 3-8 1 2 2 3 3 3 0-3 1-5 3-7 0 4 3 6 3 11 0 4-2.5 7-6 7z"/><path d="M2 22h20"/>',
  mortar: '<path d="M4 21l6-9 3 2-6 9"/><path d="M2 22h10"/><path d="M12 8c3-6 8-6 10 0" stroke-dasharray="2 2"/>',
  orbital: '<path d="M9 2h6v5H9zM2 3h5v3H2zM17 3h5v3h-5z"/><path d="M12 7v14" stroke-dasharray="2 2"/><path d="M7 21h10"/>',
  artillery: `${MECH}<path d="M5 9V2h3v7M16 9V2h3v7"/>`,

  // energy
  reactor: '<circle cx="12" cy="12" r="1.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
  laser: '<path d="M2 8h5v8H2z"/><path d="M7 12h15"/><path d="M10 9v6M14 10v4M18 11v2"/>',
  cooling: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>',
  radiators: '<path d="M4 9h16v12H4z"/><path d="M8 9v12M12 9v12M16 9v12"/><path d="M8 6c1-1 0-2 1-3M12 6c1-1 0-2 1-3M16 6c1-1 0-2 1-3"/>',
  aura: '<path d="M8 21h8M10 21v-3h4v3"/><path d="M8 18h8M9 15h6M9 12h6"/><circle cx="12" cy="6" r="3"/><path d="M4 3l2 2M20 3l-2 2M2 8h3M22 8h-3"/>',
  capacitors: '<path d="M2 12h7M15 12h7M9 5v14M15 5v14"/><path d="M4 5v4M2 7h4"/>',
  overload: `<path d="${BOLT}"/><path d="M3 5l2 1M21 5l-2 1M2 17l2-1M22 17l-2-1"/>`,
  chain: '<path d="M11 2L8 9h4l-3 6"/><path d="M9 15l-5 3M9 15l3 6M12 9l7-2M19 7l-2 4"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/><circle cx="12" cy="21" r="1.5" fill="currentColor"/><circle cx="17" cy="11" r="1.5" fill="currentColor"/>',
  eshield: '<path d="M3 19a9 9 0 0 1 18 0"/><path d="M6.5 19a5.5 5.5 0 0 1 11 0" stroke-dasharray="2 2"/><path d="M10 15h4v4h-4z"/><path d="M2 21h20"/>',
  phase: '<path d="M3 6l6 6-6 6" stroke-dasharray="2 2"/><path d="M9 6l6 6-6 6" stroke-dasharray="4 2"/><path d="M15 6l6 6-6 6"/>',
  scout: '<path d="M10 5h6v6h-6z"/><path d="M12 11l-2 10M14 11l3 10"/><path d="M2 7h5M3 11h4M2 15h5"/>',

  // robotics
  sensors: '<path d="M12 12l6-6"/><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7a5 5 0 1 0 5 5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  crit: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  drone: '<path d="M9 9h6v6H9z"/><path d="M9 9L6.5 6.5M15 9l2.5-2.5M9 15l-2.5 2.5M15 15l2.5 2.5"/><circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/>',
  mines: '<path d="M2 19h20"/><path d="M6 19a6 6 0 0 1 12 0"/><path d="M12 10V6M8 11L6 8M16 11l2-3"/>',
  regen: '<path d="M12 8v8M8 12h8"/><path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M18 2v4h-4"/>',
  repair: '<path d="M15 3a5 5 0 0 0-4.6 7L3 17.4V21h3.6l7.4-7.4A5 5 0 0 0 21 9l-3 3-3-3 3-3a5 5 0 0 0-3-3z"/>',
  designator: '<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><path d="M12 8l4 4-4 4-4-4z"/>',
  carrier: '<path d="M3 21V10l9-6 9 6v11z"/><path d="M7 21v-6h10v6"/><path d="M9 10l3-2 3 2-3 1z"/>',
  swarm: '<path d="M3 3l7 3-7 3 2-3zM13 9l7 3-7 3 2-3zM3 15l7 3-7 3 2-3z"/>',
  decoy: '<path d="M7 3h10v10H7z" stroke-dasharray="2 2"/><path d="M10 7h1M13 7h1"/><path d="M12 13v4M7 21l5-4 5 4z"/>',

  // hull
  hp: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 9v6M9 12h6"/>',
  magnet: '<path d="M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0z"/><path d="M5 7h4M15 7h4"/>',
  salvage: `<path d="${GEAR}"/><circle cx="12" cy="12" r="3"/>`,
  speed: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  dash: '<path d="M13 5l7 7-7 7"/><path d="M3 8h8M5 12h12M3 16h8"/>',

  // evolutions
  evoPlasma: '<path d="M2 10h8v4H2z"/><circle cx="15" cy="6" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="15" cy="18" r="2"/><path d="M10 12h2"/>',
  evoSiege: '<path d="M2 10h3v4H2zM5 11h7v2H5z"/><path d="M17 7L18.1 10.1L21.3 9.5L19.2 12L21.3 14.5L18.1 13.9L17 17L15.9 13.9L12.7 14.5L14.8 12L12.7 9.5L15.9 10.1z"/>',
  evoMinigun: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="7" r="1.6"/><circle cx="16.3" cy="9.5" r="1.6"/><circle cx="16.3" cy="14.5" r="1.6"/><circle cx="12" cy="17" r="1.6"/><circle cx="7.7" cy="14.5" r="1.6"/><circle cx="7.7" cy="9.5" r="1.6"/>',
  evoArc: '<path d="M2 13h11v6H2z"/><path d="M13 14.5h3l2 1.5-2 1.5h-3"/><path d="M17 2l-4 5h4l-3 4"/>',
  evoSwarm: '<path d="M6 3c2 2 2 5 1 8H5c-1-3-1-6 1-8zM12 7c2 2 2 5 1 8h-2c-1-3-1-6 1-8zM18 3c2 2 2 5 1 8h-2c-1-3-1-6 1-8z"/><path d="M6 13v3M12 17v4M18 13v3"/>',
  evoBeams: '<path d="M9 3h6v4H9z"/><path d="M9 5H5M15 5h4"/><path d="M12 7v15M8 9l-4 13M16 9l4 13"/>',
};

// tech nodes whose id differs from the upgrade they stand for
const ALIAS: Record<string, string> = { ballistics: 'dmg', armor: 'hp', servo: 'speed' };

/** Inline SVG for a tech node or run upgrade; unknown ids get the command-center mark. */
export function icon(id: string): string {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[ALIAS[id] ?? id] ?? ICONS.core}</svg>`;
}
