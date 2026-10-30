import type { FigureRecord } from '../../src/data.ts';
import type { FigureDef } from '../../src/types.ts';
import { $, TYPE_COLOR, spriteSrc } from './shared.ts';
import { drawWheel } from './match.ts';

export const DECK_SIZE = 6;
const DECK_KEY = 'duel.deck';
const RARITY: Record<string, string> = { Common: 'Común', Uncommon: 'Poco común', Rare: 'Rara', EX: 'EX', UX: 'UX' };
const RARITY_ORDER: Record<string, number> = { UX: 0, EX: 1, Rare: 2, Uncommon: 3, Common: 4 };

const CSS = `
.menu { position: fixed; inset: 0; z-index: 20; display: none; flex-direction: column; background: var(--bg); color: var(--ink);
  padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); overflow: auto; }
.menu.show { display: flex; }
.menu .wrap { width: 100%; max-width: 980px; margin: 0 auto; padding-block: 20px; display: flex; flex-direction: column; gap: 16px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.menu h1 { margin: 0; font-size: clamp(28px, 6vw, 44px); letter-spacing: .01em; text-wrap: balance; }
.menu h2 { margin: 0; font-size: 18px; }
.menu .sub { color: var(--mute); margin: 0; }
.menu .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.menu .big { font-size: 17px; padding: 12px 20px; }
.menu .primary { background: var(--blue); }
.menu .primary:hover:not(:disabled) { background: #3d7cf6; }
.menu button:disabled { opacity: .45; cursor: default; }
.deck-strip { display: flex; flex-wrap: wrap; gap: 8px; min-height: 76px; }
.slot { width: 76px; height: 76px; border-radius: 10px; border: 2px dashed #ffffff33; display: grid; place-items: center; position: relative;
  background: #0003; color: var(--mute); font: inherit; padding: 0; }
.slot.full { border-style: solid; cursor: pointer; }
.slot img { width: 64px; height: 64px; image-rendering: pixelated; object-fit: contain; }
.slot .x { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: var(--red); color: #fff;
  font-size: 13px; line-height: 20px; text-align: center; display: none; }
.slot.full:hover .x, .slot.full:focus-visible .x { display: block; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.card { display: grid; grid-template-columns: 64px 1fr; grid-template-rows: auto auto; gap: 2px 8px; align-items: center; text-align: left;
  background: #0003; border: 2px solid #ffffff1a; border-radius: 12px; padding: 8px; color: var(--ink); font: inherit; cursor: pointer; min-width: 0; }
.card:hover { border-color: #ffffff55; }
.card.sel { border-color: var(--blue); background: #2a6df422; }
.card.off { opacity: .4; cursor: default; }
.card img { grid-row: span 2; width: 64px; height: 64px; image-rendering: pixelated; object-fit: contain; }
.card b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.card .meta { color: var(--mute); font-size: 12px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.card canvas { width: 34px; height: 34px; }
.card .num { color: var(--blue); font-weight: 700; }
.tag { border-radius: 6px; padding: 0 5px; font-size: 11px; font-weight: 600; background: #ffffff1a; }
.tag.EX { background: #ffc10733; color: #ffd75e; }
.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.filters button { padding: 5px 10px; font-size: 13px; }
.filters button.on { outline: 2px solid #fff; }
`;

export interface MenuHooks {
  /** Start a new duel with this deck for the player (null: random deck). */
  play(deck: FigureDef[] | null): void;
  /** A duel is in progress and can be resumed. */
  canContinue(): boolean;
}

/** Start menu and deck picker. Returns a function that opens the start menu. */
export function setupMenus(pool: FigureDef[], records: FigureRecord[], hooks: MenuHooks): () => void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const rarity = new Map(records.map((r) => [String(r.id), r.rarity]));
  const byId = new Map(pool.map((d) => [d.id, d]));
  let deck: string[] = loadDeck().filter((id) => byId.has(id)).slice(0, DECK_SIZE);

  // ---------- start menu ----------
  const main = document.createElement('section');
  main.className = 'menu';
  main.id = 'mainMenu';
  main.setAttribute('aria-label', 'Menú de inicio');
  main.innerHTML = `<div class="wrap">
    <div><h1>Duelo de Figuras</h1><p class="sub">Versión 1.0.0 · ${pool.length} figuras · el atacante que pierde no cae: el defensor contraataca</p></div>
    <div><h2>Tu mazo</h2><p class="sub" id="mainDeckNote"></p></div>
    <div class="deck-strip" id="mainDeck"></div>
    <div class="row">
      <button type="button" class="big primary" id="menuPlay">Jugar contra la IA</button>
      <button type="button" class="big" id="menuContinue">Continuar duelo</button>
      <button type="button" class="big" id="menuDeck">Elegir mazo</button>
    </div>
  </div>`;
  document.body.appendChild(main);

  // ---------- deck picker ----------
  const picker = document.createElement('section');
  picker.className = 'menu';
  picker.id = 'deckMenu';
  picker.setAttribute('aria-label', 'Elegir mazo');
  picker.innerHTML = `<div class="wrap">
    <div class="row" style="justify-content:space-between"><h1 style="font-size:28px">Elegir mazo</h1>
      <div class="row"><button type="button" id="deckRandom">Al azar</button><button type="button" id="deckClear">Vaciar</button>
      <button type="button" id="deckBack">Volver</button><button type="button" class="primary" id="deckDone">Listo</button></div></div>
    <p class="sub" id="deckCount"></p>
    <div class="deck-strip" id="deckSlots"></div>
    <div class="filters" id="deckFilters"></div>
    <div class="cards" id="deckCards"></div>
  </div>`;
  document.body.appendChild(picker);

  const sprite = (d: FigureDef) => {
    const img = document.createElement('img');
    img.alt = d.name;
    spriteSrc(d.id).then((src) => { if (src) img.src = src; });
    return img;
  };

  const renderStrip = (el: HTMLElement, removable: boolean) => {
    el.innerHTML = '';
    for (let i = 0; i < DECK_SIZE; i++) {
      const d = byId.get(deck[i]);
      const slot = document.createElement(removable && d ? 'button' : 'div');
      slot.className = 'slot' + (d ? ' full' : '');
      if (d) {
        slot.title = d.name;
        slot.style.borderColor = '#' + (TYPE_COLOR[d.type ?? ''] ?? 0x888888).toString(16).padStart(6, '0');
        slot.appendChild(sprite(d));
        if (removable) {
          (slot as HTMLButtonElement).type = 'button';
          slot.setAttribute('aria-label', `Quitar ${d.name}`);
          const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; slot.appendChild(x);
          slot.onclick = () => { deck.splice(i, 1); changed(); };
        }
      } else slot.textContent = String(i + 1);
      el.appendChild(slot);
    }
  };

  // Cards are built once; selection only toggles classes.
  let filter = 'all';
  const cards = new Map<string, HTMLButtonElement>();
  const sorted = [...pool].sort((a, b) =>
    (RARITY_ORDER[rarity.get(a.id) ?? ''] ?? 9) - (RARITY_ORDER[rarity.get(b.id) ?? ''] ?? 9) || a.name.localeCompare(b.name));
  for (const d of sorted) {
    const r = rarity.get(d.id) ?? '';
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.rarity = r;
    card.appendChild(sprite(d));
    const name = document.createElement('b'); name.textContent = d.name; card.appendChild(name);
    const meta = document.createElement('span'); meta.className = 'meta';
    const wheel = document.createElement('canvas'); wheel.width = wheel.height = 96;
    drawWheel(wheel, d, null, 0, true);
    wheel.setAttribute('aria-hidden', 'true');
    const tag = document.createElement('span'); tag.className = `tag ${r}`; tag.textContent = RARITY[r] ?? r;
    const mp = document.createElement('span'); mp.textContent = `${d.mp} MP`;
    const num = document.createElement('span'); num.className = 'num';
    meta.append(wheel, mp, tag, num);
    card.appendChild(meta);
    card.title = d.wheel.map((s) => `${s.move.name}${s.move.damage ? ' ' + s.move.damage : ''} (${s.move.color})`).join(' · ');
    card.onclick = () => {
      const at = deck.indexOf(d.id);
      if (at >= 0) deck.splice(at, 1);
      else if (deck.length < DECK_SIZE) deck.push(d.id);
      changed();
    };
    cards.set(d.id, card);
    $('deckCards').appendChild(card);
  }

  const filters: [string, string][] = [['all', 'Todas'], ['EX', 'EX'], ['Rare', 'Raras'], ['Uncommon', 'Poco comunes'], ['Common', 'Comunes']];
  for (const [key, label] of filters) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset.key = key;
    b.onclick = () => { filter = key; changed(); };
    $('deckFilters').appendChild(b);
  }

  const changed = () => {
    saveDeck(deck);
    renderStrip($('deckSlots'), true);
    renderStrip($('mainDeck'), false);
    $('deckCount').textContent = `${deck.length}/${DECK_SIZE} figuras elegidas. Pulsa una figura para añadirla o quitarla. La ruleta pequeña muestra sus colores; con el ratón encima ves sus ataques.`;
    $<HTMLButtonElement>('deckDone').disabled = deck.length !== DECK_SIZE;
    $('mainDeckNote').textContent = deck.length === DECK_SIZE ? 'Juegas con estas 6 figuras. La IA lleva un mazo al azar.'
      : 'Mazo al azar (elige 6 figuras para jugar con las tuyas). La IA también lleva un mazo al azar.';
    for (const [id, card] of cards) {
      const at = deck.indexOf(id);
      card.classList.toggle('sel', at >= 0);
      card.classList.toggle('off', at < 0 && deck.length >= DECK_SIZE);
      card.querySelector('.num')!.textContent = at >= 0 ? `#${at + 1}` : '';
      card.hidden = filter !== 'all' && card.dataset.rarity !== filter;
    }
    for (const b of $('deckFilters').querySelectorAll('button')) b.classList.toggle('on', (b as HTMLElement).dataset.key === filter);
  };

  const show = (which: 'main' | 'deck' | null) => {
    main.classList.toggle('show', which === 'main');
    picker.classList.toggle('show', which === 'deck');
    $('menuContinue').hidden = !hooks.canContinue();
    changed();
  };

  $('menuPlay').onclick = () => { show(null); hooks.play(deck.length === DECK_SIZE ? deck.map((id) => byId.get(id)!) : null); };
  $('menuContinue').onclick = () => show(null);
  $('menuDeck').onclick = () => show('deck');
  $('deckBack').onclick = () => show('main');
  $('deckDone').onclick = () => show('main');
  $('deckClear').onclick = () => { deck = []; changed(); };
  $('deckRandom').onclick = () => {
    const ids = pool.map((d) => d.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    deck = ids.slice(0, DECK_SIZE);
    changed();
  };

  return () => show('main');
}

function loadDeck(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DECK_KEY) ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch { return []; }
}

function saveDeck(deck: string[]) {
  try { localStorage.setItem(DECK_KEY, JSON.stringify(deck)); } catch { /* storage unavailable: the deck lasts this visit */ }
}

