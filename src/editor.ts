// Dev editor (P in dev builds): machines freeze in place, and a panel tunes the current map's floor colors live.
// The mech stays fully playable, so a frozen crowd can be walked around and shot at.
import { MAPS, type Palette } from './config';
import { showBanner } from './fx';
import { applyPalette } from './scene';
import { G } from './state';

type ColorKey = 'ground' | 'gridMajor' | 'gridMinor';
type FlagKey = 'floorGlint' | 'shotHalo' | 'modelRim';
type WidthKey = 'gridMajorW' | 'gridMinorW' | 'gridMajorGlow' | 'gridMinorGlow' | 'gridCoreW';
const FIELDS: [ColorKey, string][] = [['ground', 'Пол'], ['gridMajor', 'Толстые линии'], ['gridMinor', 'Тонкие линии']];
/** Neon grid sizes in texture pixels: key, label, default (as in drawNeonGrid() in scene.ts), max. */
/** On/off effects; on when the palette leaves them out. */
const FLAGS: [FlagKey, string][] = [['floorGlint', 'Блики под снарядами'], ['shotHalo', 'Ореолы снарядов'], ['modelRim', 'Контуры моделей']];
const WIDTHS: [WidthKey, string, number, number][] = [
  ['gridMajorW', 'Толщина толстых', 8, 24],
  ['gridMinorW', 'Толщина тонких', 2, 24],
  ['gridMajorGlow', 'Ореол толстых', 18, 48],
  ['gridMinorGlow', 'Ореол тонких', 6, 48],
  ['gridCoreW', 'Белая середина', 1.5, 12],
];

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const palette = (): Palette => MAPS[G.map].palette;

const panel = document.createElement('div');
panel.id = 'editor';
panel.hidden = true;
panel.innerHTML = `<b>РЕДАКТОР</b>${FIELDS.map(([k, label]) => `<label>${label}<input type="color" data-key="${k}"></label>`).join('')}`
  + FLAGS.map(([k, label]) => `<label>${label}<input type="checkbox" data-key="${k}"></label>`).join('')
  + WIDTHS.map(([k, label, , max]) => `<label class="w">${label} <span></span><input type="range" min="0" max="${max}" step="0.5" data-key="${k}"></label>`).join('')
  + '<code></code><button type="button">Скопировать</button>';
document.body.append(panel);

const inputs = [...panel.querySelectorAll<HTMLInputElement>('input[type=color]')];
const flags = [...panel.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
const sliders = [...panel.querySelectorAll<HTMLInputElement>('input[type=range]')];
const width = (k: WidthKey): number => palette()[k] ?? WIDTHS.find(w => w[0] === k)![2];
const code = panel.querySelector('code')!;
const copyBtn = panel.querySelector('button')!;

/** The palette fields as they would be written in config.ts. */
const snippet = (): string => [
  ...FIELDS.map(([k]) => `${k}: 0x${palette()[k].toString(16).padStart(6, '0')}`),
  ...WIDTHS.map(([k]) => `${k}: ${width(k)}`),
  ...FLAGS.map(([k]) => `${k}: ${palette()[k] !== false}`),
].join(', ');

function fill(): void {
  for (const i of inputs) i.value = hex(palette()[i.dataset.key as ColorKey]);
  for (const f of flags) f.checked = palette()[f.dataset.key as FlagKey] !== false;
  for (const r of sliders) {
    r.value = String(width(r.dataset.key as WidthKey));
    r.previousElementSibling!.textContent = r.value;
  }
  code.textContent = snippet();
}

for (const i of inputs) {
  i.addEventListener('input', () => {
    palette()[i.dataset.key as ColorKey] = parseInt(i.value.slice(1), 16);
    applyPalette(palette());
    code.textContent = snippet();
  });
  // a focused picker would catch Space (dash) and reopen itself
  i.addEventListener('change', () => i.blur());
}

for (const f of flags) {
  f.addEventListener('change', () => {
    palette()[f.dataset.key as FlagKey] = f.checked;
    code.textContent = snippet();
    f.blur();
  });
}

for (const r of sliders) {
  r.addEventListener('input', () => {
    palette()[r.dataset.key as WidthKey] = +r.value;
    r.previousElementSibling!.textContent = r.value;
    applyPalette(palette());
    code.textContent = snippet();
  });
  // a focused slider would eat the arrow keys and Space
  r.addEventListener('change', () => r.blur());
}

copyBtn.addEventListener('click', () => {
  navigator.clipboard?.writeText(snippet()).then(() => showBanner('СКОПИРОВАНО', 'blue', 0.6), () => {});
  copyBtn.blur();
});

// clicks on the panel must not reach the game: the input layer listens on window and would fire the guns
for (const ev of ['mousedown', 'pointerdown', 'contextmenu'] as const) panel.addEventListener(ev, e => e.stopPropagation());

/** Toggles the freeze and the panel. */
export function toggleEditor(): boolean {
  G.editor = !G.editor;
  panel.hidden = !G.editor;
  if (G.editor) fill();
  showBanner(G.editor ? 'РЕДАКТОР ВКЛ' : 'РЕДАКТОР ВЫКЛ', 'gold', 0.8);
  return G.editor;
}

/** While frozen the run clock goes on, so the boss and wave timers are pushed back instead. */
export function holdTimers(dt: number): void {
  G.nextBoss += dt;
  G.nextBurst += dt;
}
