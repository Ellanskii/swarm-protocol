// Dev editor (P in dev builds): machines freeze in place, and a panel tunes the current map's floor colors live.
// The mech stays fully playable, so a frozen crowd can be walked around and shot at.
import { MAPS, type Palette } from './config';
import { showBanner } from './fx';
import { applyPalette } from './scene';
import { G } from './state';

type ColorKey = 'ground' | 'gridMajor' | 'gridMinor';
type WidthKey = 'gridMajorW' | 'gridMinorW' | 'gridMajorGlow' | 'gridMinorGlow' | 'gridCoreW';
const FIELDS: [ColorKey, string][] = [['ground', 'Пол'], ['gridMajor', 'Толстые линии'], ['gridMinor', 'Тонкие линии']];
/** Neon grid sizes in texture pixels: key, label, default (as in drawNeonGrid() in scene.ts), max. */
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
  + '<label>Блики под снарядами<input type="checkbox" data-key="floorGlint"></label>'
  + WIDTHS.map(([k, label, , max]) => `<label class="w">${label} <span></span><input type="range" min="0" max="${max}" step="0.5" data-key="${k}"></label>`).join('')
  + '<code></code><button type="button">Скопировать</button>';
document.body.append(panel);

const inputs = [...panel.querySelectorAll<HTMLInputElement>('input[type=color]')];
const glint = panel.querySelector<HTMLInputElement>('input[type=checkbox]')!;
const sliders = [...panel.querySelectorAll<HTMLInputElement>('input[type=range]')];
const width = (k: WidthKey): number => palette()[k] ?? WIDTHS.find(w => w[0] === k)![2];
const code = panel.querySelector('code')!;
const copyBtn = panel.querySelector('button')!;

/** The palette fields as they would be written in config.ts. */
const snippet = (): string => [
  ...FIELDS.map(([k]) => `${k}: 0x${palette()[k].toString(16).padStart(6, '0')}`),
  ...(palette().neon ? [...WIDTHS.map(([k]) => `${k}: ${width(k)}`), `floorGlint: ${palette().floorGlint !== false}`] : []),
].join(', ');

function fill(): void {
  for (const i of inputs) i.value = hex(palette()[i.dataset.key as ColorKey]);
  glint.checked = palette().floorGlint !== false;
  glint.disabled = !palette().neon;
  // widths only exist for the neon grid; plain line geometry is always 1 px
  for (const r of sliders) {
    r.value = String(width(r.dataset.key as WidthKey));
    r.disabled = !palette().neon;
    r.previousElementSibling!.textContent = palette().neon ? r.value : '—';
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

glint.addEventListener('change', () => {
  palette().floorGlint = glint.checked;
  code.textContent = snippet();
  glint.blur();
});

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
