// Upgrade pool and the level-up screen.
import { addDrone } from './abilities';
import { sfx } from './audio';
import { mouse } from './input';
import { G, P, S, magSize } from './state';
import { $ } from './utils';
import { giveWeapon } from './weapons';

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  weapon?: boolean;
  apply(): void;
}

export const UPGRADES: Upgrade[] = [
  { id: 'dmg', name: 'Калибр', desc: '+20% урона всем оружием', max: 8, apply: () => { S.dmg *= 1.2; } },
  { id: 'rate', name: 'Облегчённый затвор', desc: '+15% к скорострельности', max: 8, apply: () => { S.rate *= 1.15; } },
  {
    id: 'mag', name: 'Длинный магазин', desc: '+35% патронов в магазине', max: 5,
    apply: () => {
      S.mag *= 1.35;
      for (const w of Object.values(G.owned)) { w.ammo = magSize(w.d); w.reloading = false; }
    },
  },
  { id: 'reload', name: 'Быстрые руки', desc: 'Перезарядка на 20% быстрее, жёлтая зона шире', max: 5, apply: () => { S.reload *= 1.2; S.arW += 0.03; } },
  { id: 'multi', name: 'Сдвоенный ствол', desc: '+1 пуля за выстрел, дробовику +2 дробины', max: 4, apply: () => { S.multi++; } },
  { id: 'pierce', name: 'Бронебойные', desc: 'Пуля прошивает ещё одного врага', max: 4, apply: () => { S.pierce++; } },
  { id: 'crit', name: 'Слабые места', desc: '+10% шанс крита, крит наносит ×2.2', max: 5, apply: () => { S.crit += 0.1; } },
  { id: 'explode', name: 'Разрывные', desc: '+12% шанс, что попадание взорвётся', max: 5, apply: () => { S.explode += 0.12; } },
  { id: 'drone', name: 'Боевой дрон', desc: 'Дрон кружит рядом и стреляет по ближайшим', max: 4, apply: addDrone },
  { id: 'aura', name: 'Статическое поле', desc: 'Бьёт током всех рядом. С каждым уровнем шире и больнее', max: 5, apply: () => { S.aura++; } },
  { id: 'speed', name: 'Сервоприводы', desc: '+10% к скорости бега', max: 5, apply: () => { S.speed *= 1.1; } },
  { id: 'hp', name: 'Бронепластины', desc: '+25 к максимуму HP и полное лечение', max: 6, apply: () => { P.maxHp += 25; P.hp = P.maxHp; } },
  { id: 'regen', name: 'Нанорегенерация', desc: '+1 HP в секунду', max: 5, apply: () => { S.regen += 1; } },
  { id: 'magnet', name: 'Магнит', desc: '+50% к радиусу сбора опыта', max: 4, apply: () => { S.magnet *= 1.5; } },
  { id: 'dash', name: 'Ускоритель', desc: 'Рывок перезаряжается на 25% быстрее', max: 3, apply: () => { S.dashMul *= 0.75; } },
  { id: 'shotgun', name: 'Дробовик', desc: 'Новое оружие, клавиша 2. Семь дробин, вблизи разносит всё', max: 1, weapon: true, apply: () => giveWeapon('shotgun') },
  { id: 'smg', name: 'Пистолет-пулемёт', desc: 'Новое оружие, клавиша 3. 13 выстрелов в секунду', max: 1, weapon: true, apply: () => giveWeapon('smg') },
];

const FALLBACK: Upgrade = { id: 'heal', name: 'Аптечка', desc: 'Полное лечение', max: Infinity, apply: () => { P.hp = P.maxHp; } };
/** New weapons show up a bit more often than stat upgrades. */
const weight = (u: Upgrade) => (u.weapon ? 1.6 : 1);

let choices: Upgrade[] = [];

function rollChoices(): Upgrade[] {
  const pool = UPGRADES.filter(u => (G.upLv[u.id] ?? 0) < u.max);
  const out: Upgrade[] = [];
  while (out.length < 3 && pool.length) {
    let r = Math.random() * pool.reduce((s, u) => s + weight(u), 0);
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { r -= weight(pool[i]); if (r <= 0) { idx = i; break; } }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out.length ? out : [FALLBACK];
}

const screen = $('levelup');
const cards = $('cards');

export function openLevelUp(): void {
  G.state = 'levelup';
  mouse.down = false;
  document.body.classList.add('menu');
  choices = rollChoices();
  cards.replaceChildren(...choices.map((u, i) => {
    const lv = G.upLv[u.id] ?? 0;
    const b = document.createElement('button');
    b.className = 'card' + (u.weapon ? ' weapon' : '');
    const tag = u.weapon ? 'НОВОЕ ОРУЖИЕ' : lv ? `УР ${lv} → ${lv + 1}` : 'НОВОЕ';
    b.innerHTML = `<small>${i + 1}</small><h3>${u.name}</h3><p>${u.desc}</p><em>${tag}</em>`;
    b.addEventListener('click', () => choose(i));
    return b;
  }));
  screen.hidden = false;
  sfx('level');
}

export function choose(i: number): void {
  const u = choices[i];
  if (!u || G.state !== 'levelup') return;
  u.apply();
  G.upLv[u.id] = (G.upLv[u.id] ?? 0) + 1;
  G.pendingLevels--;
  if (G.pendingLevels > 0) { openLevelUp(); return; }
  screen.hidden = true;
  G.state = 'play';
  document.body.classList.remove('menu');
  mouse.down = false;
}
