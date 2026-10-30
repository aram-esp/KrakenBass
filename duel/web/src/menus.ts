import type { FigureRecord } from '../../src/data.ts';
import type { FigureDef } from '../../src/types.ts';
import { $, TYPE_COLOR, spriteSrc } from './shared.ts';
import { drawWheel } from './match.ts';

export const DECK_SIZE = 6;
const DECK_KEY = 'duel.deck';
/** Badge text and order, as on the original figure bases (C, UC, R, EX). */
const RARITY_BADGE: Record<string, string> = { Common: 'C', Uncommon: 'UC', Rare: 'R', EX: 'EX', UX: 'UX' };
const RARITY_ORDER: Record<string, number> = { UX: 0, EX: 1, Rare: 2, Uncommon: 3, Common: 4 };

/*
 * Layout modelled on screenshots of the original app (Fandom archive wiki, 2017): a dark blue status bar on top,
 * a black pill title, big yellow buttons, a row of blue tabs at the bottom, and a dark "Figures" panel with the six
 * figures standing on bases with rarity and MP badges. All drawn here; no art from the game is used.
 */
const CSS = `
.dm { --dm-navy: #07142e; --dm-blue: #1557c9; --dm-blue-2: #0b3a92; --dm-edge: #3f8cff; --dm-yellow: #ffd21f; --dm-yellow-2: #f2b300;
  --dm-yellow-ink: #3a2a00; --dm-panel: #0a0d14; --dm-panel-2: #151a26; --dm-ink: #ffffff; --dm-mute: #9fb3d9;
  --dm-font: "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif;
  position: fixed; inset: 0; z-index: 20; display: none; flex-direction: column; color: var(--dm-ink); font-family: var(--dm-font);
  background: linear-gradient(180deg, #0d1a33 0%, #0a1222 100%);
  padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
.dm.show { display: flex; }
.dm .bar { background: linear-gradient(180deg, #123a86, var(--dm-navy)); border-bottom: 2px solid var(--dm-edge);
  padding-block: 8px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: flex; align-items: center; gap: 12px; }
.dm .bar .info { font-weight: 800; font-size: 13px; color: var(--dm-mute); letter-spacing: .02em; }
.dm .screen { flex: 1; min-height: 0; overflow: auto; display: none; flex-direction: column; align-items: center; gap: 18px;
  padding-block: 18px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.dm .screen.on { display: flex; }
.dm .pill { background: #000; border: 3px solid #23314f; border-radius: 999px; padding: 6px 34px; font-weight: 900; font-size: clamp(20px, 4.5vw, 28px);
  box-shadow: 0 0 0 3px #000, 0 2px 0 4px #0d2a63; text-align: center; }
.dm .yellow { appearance: none; border: 4px solid #fff2a8; border-radius: 14px; cursor: pointer; color: var(--dm-yellow-ink);
  background: linear-gradient(180deg, #ffe55a 0%, var(--dm-yellow) 45%, var(--dm-yellow-2) 100%); font: 900 22px/1 var(--dm-font);
  padding: 16px 28px; box-shadow: 0 3px 0 #a87b00, 0 6px 14px #0008; }
.dm .yellow:hover:not(:disabled) { filter: brightness(1.06); }
.dm .yellow:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #a87b00, 0 3px 8px #0008; }
.dm .yellow:disabled { filter: grayscale(.8) brightness(.7); cursor: default; }
.dm .yellow.big { font-size: clamp(30px, 7vw, 44px); padding: 20px 64px; border-radius: 18px; }
.dm .ghost { appearance: none; border: 2px solid #4a5f8c; border-radius: 10px; background: #0c1730; color: var(--dm-ink); cursor: pointer;
  font: 800 15px/1 var(--dm-font); padding: 10px 16px; }
.dm .ghost:hover { border-color: var(--dm-edge); }
.dm button:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.dm .hero { flex: 1; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 14px;
  border-radius: 18px; padding: 28px 16px; min-height: 280px;
  background: radial-gradient(60% 18% at 22% 18%, #ffffffcc 0 40%, transparent 70%),
              radial-gradient(45% 12% at 78% 30%, #ffffffaa 0 40%, transparent 70%),
              linear-gradient(180deg, #5fb4ff 0%, #8fd0ff 52%, #e9f7ff 53%, #1e8be0 54%, #0f6cc4 75%, #0a4f99 100%); }
.dm .hero .figs { width: 100%; max-width: 720px; grid-template-columns: repeat(6, 1fr); padding: 0; margin-top: auto; }
.dm .hero .name { color: #fff; text-shadow: 0 2px 0 #0b3a92; }
@media (max-width: 560px) { .dm .hero .figs { grid-template-columns: repeat(3, 1fr); } }
.dm .hero h1 { margin: 0 0 auto; font-weight: 900; font-size: clamp(30px, 7vw, 52px); text-align: center; text-wrap: balance;
  text-shadow: 0 3px 0 #0b3a92, 0 6px 14px #0006; }
.dm .hero p { margin: 0; font-weight: 800; color: #e6f0ff; text-align: center; text-shadow: 0 2px 0 #0b3a92; }
.dm .panel { width: 100%; max-width: 760px; background: var(--dm-panel); border: 3px solid #1d2433; border-radius: 18px; overflow: hidden;
  box-shadow: 0 0 0 3px #000; }
.dm .panel-head { display: flex; justify-content: space-between; align-items: stretch; background: var(--dm-panel-2); }
.dm .panel-head h2 { margin: 0; padding: 10px 18px; font: 900 22px/1.2 var(--dm-font); color: #c9d2e3; }
.dm .usable { align-self: flex-end; background: #e9f1ff; color: #0b3a92; font-weight: 900; padding: 6px 18px 6px 26px;
  clip-path: polygon(14px 0, 100% 0, 100% 100%, 0 100%); }
.dm .usable.short { background: #ffe0e0; color: #9b1c1c; }
.dm .figs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 8px; padding: 18px 10px 22px; }
.dm .fig { appearance: none; background: none; border: 0; color: inherit; font: inherit; padding: 0; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 2px; position: relative; min-width: 0; }
.dm .fig.empty { cursor: default; }
.dm .stand { position: relative; width: 100%; max-width: 132px; aspect-ratio: 1 / 1; display: grid; place-items: end center; }
.dm .stand::before { content: ""; position: absolute; left: 8%; right: 8%; bottom: 6%; height: 26%; border-radius: 50%;
  background: radial-gradient(ellipse at 50% 35%, var(--base-top, #6fae4a) 0 55%, var(--base-side, #3d5f2a) 56% 100%);
  box-shadow: 0 6px 0 #4a3420, 0 10px 10px #0008; }
.dm .fig.empty .stand::before { background: #1a2130; box-shadow: inset 0 0 0 2px #2c3650; }
.dm .stand img { position: relative; width: 82%; height: 82%; object-fit: contain; object-position: bottom; image-rendering: pixelated;
  margin-bottom: 14%; filter: drop-shadow(0 2px 0 #0006); }
.dm .badges { display: flex; gap: 4px; align-items: center; margin-top: -6px; position: relative; }
.dm .rar, .dm .mp { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; font-size: 13px;
  border: 2px solid #fff; box-shadow: 0 2px 0 #0007; }
.dm .rar { color: #3a2a00; background: radial-gradient(circle at 35% 30%, #fff 0 10%, var(--rar) 45%); }
.dm .rar.Common { --rar: #c98a4b; } .dm .rar.Uncommon { --rar: #c7cfda; } .dm .rar.Rare { --rar: #f2c230; }
.dm .rar.EX { --rar: #9fe7ff; background: conic-gradient(#ff9de2, #9fe7ff, #c6ff9d, #fff59d, #ff9de2); }
.dm .mp { background: radial-gradient(circle at 35% 30%, #6fb2ff, #1557c9 60%); color: #fff; font-size: 15px; }
.dm .name { font-weight: 800; font-size: 13px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dfe7f5; }
.dm .fig .order { position: absolute; top: 2px; left: 6px; background: var(--dm-blue); border: 2px solid #fff; border-radius: 999px;
  font-weight: 900; font-size: 12px; padding: 0 7px; }
.dm .fig.sel .stand::after { content: ""; position: absolute; inset: 6% 4% 0; border-radius: 16px; box-shadow: 0 0 0 3px var(--dm-yellow), 0 0 18px #ffd21f88; }
.dm .fig.off { opacity: .35; cursor: default; }
.dm .fig .wheel { position: absolute; top: 2px; right: 6px; width: 30px; height: 30px; }
.dm .row { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
.dm .note { margin: 0; color: var(--dm-mute); font-weight: 700; text-align: center; max-width: 60ch; }
.dm .filters { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.dm .filters .ghost.on { background: var(--dm-blue); border-color: #fff; }
.dm .collection { width: 100%; max-width: 980px; display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 12px 6px; }
.dm .tabs { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; background: linear-gradient(180deg, #1f6be0, #0b3a92);
  border-top: 3px solid var(--dm-edge); padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); }
.dm .tab { appearance: none; border: 0; border-right: 2px solid #0a2e75; background: none; color: #fff; cursor: pointer; padding: 8px 4px 10px;
  display: flex; flex-direction: column; align-items: center; gap: 4px; font: 900 15px/1 var(--dm-font); text-shadow: 0 2px 0 #062460; }
.dm .tab:last-child { border-right: 0; }
.dm .tab svg { width: 34px; height: 34px; filter: drop-shadow(0 2px 0 #062460); }
.dm .tab.on { background: linear-gradient(180deg, #3f8cff, #1557c9); }
.dm .tab:hover:not(.on) { background: #ffffff14; }
`;

const ICON = {
  back: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M18 8 4 20l14 12v-7c9 0 14 3 18 9-1-10-6-17-18-18z" fill="#fff" stroke="#0b3a92" stroke-width="2" stroke-linejoin="round"/></svg>',
  league: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 6h18v6a9 9 0 0 1-18 0zM6 8h5v4a5 5 0 0 1-5-4zM29 8h5a5 5 0 0 1-5 4zM17 21h6v6h4v5H13v-5h4z" fill="#ffd21f" stroke="#7a5600" stroke-width="2" stroke-linejoin="round"/></svg>',
  deck: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="9" width="18" height="24" rx="3" fill="#cfe2ff" stroke="#0b3a92" stroke-width="2" transform="rotate(-10 14 21)"/><rect x="16" y="7" width="18" height="24" rx="3" fill="#fff" stroke="#0b3a92" stroke-width="2"/><circle cx="25" cy="19" r="5" fill="#e53935" stroke="#0b3a92" stroke-width="2"/><path d="M20 19h10" stroke="#0b3a92" stroke-width="2"/></svg>',
};

export interface MenuHooks {
  /** Start a new duel with this deck for the player (null: random deck). */
  play(deck: FigureDef[] | null): void;
  /** A duel is in progress and can be resumed. */
  canContinue(): boolean;
}

type Screen = 'home' | 'deck' | 'pick';

/** League (home), Edit Deck and figure picker, in the style of the original app. Returns a function that opens home. */
export function setupMenus(pool: FigureDef[], records: FigureRecord[], hooks: MenuHooks): () => void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  if (!document.querySelector('link[data-dm-font]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap';
    font.dataset.dmFont = '';
    document.head.appendChild(font);
  }

  const rarity = new Map(records.map((r) => [String(r.id), r.rarity]));
  const byId = new Map(pool.map((d) => [d.id, d]));
  let deck: string[] = loadDeck().filter((id) => byId.has(id)).slice(0, DECK_SIZE);
  let screen: Screen = 'home';
  let filter = 'all';

  const root = document.createElement('section');
  root.className = 'dm';
  root.id = 'mainMenu';
  root.setAttribute('aria-label', 'Menú');
  root.innerHTML = `
    <div class="bar"><span class="info">Versión 1.0.0 · ${pool.length} figuras</span></div>
    <div class="screen" id="dmHome">
      <div class="pill">Liga</div>
      <div class="hero">
        <h1>Duelo de Figuras</h1>
        <div class="figs" id="dmHomeFigs"></div>
        <p id="dmHomeDeck"></p>
        <button type="button" class="yellow big" id="menuPlay">Jugar</button>
        <button type="button" class="ghost" id="menuContinue">Continuar duelo</button>
      </div>
      <p class="note">Contra la IA. Regla de la casa: el atacante que pierde no cae y el defensor contraataca; si saca fallo, cae.</p>
    </div>
    <div class="screen" id="dmDeck">
      <div class="pill">Editar mazo</div>
      <div class="panel">
        <div class="panel-head"><h2>Figuras</h2><span class="usable" id="dmUsable"></span></div>
        <div class="figs" id="dmDeckFigs"></div>
      </div>
      <p class="note" id="dmDeckNote"></p>
      <div class="row"><button type="button" class="yellow" id="menuDeck">Editar figuras</button></div>
    </div>
    <div class="screen" id="dmPick">
      <div class="pill">Editar figuras</div>
      <div class="panel">
        <div class="panel-head"><h2>Mazo</h2><span class="usable" id="dmUsable2"></span></div>
        <div class="figs" id="deckSlots"></div>
      </div>
      <div class="row"><button type="button" class="ghost" id="deckRandom">Al azar</button><button type="button" class="ghost" id="deckClear">Vaciar</button>
        <button type="button" class="yellow" id="deckDone">Listo</button></div>
      <p class="note" id="deckCount"></p>
      <div class="filters" id="deckFilters"></div>
      <div class="collection" id="deckCards"></div>
    </div>
    <nav class="tabs" aria-label="Secciones">
      <button type="button" class="tab" id="tabBack">${ICON.back}Atrás</button>
      <button type="button" class="tab" id="tabLeague">${ICON.league}Liga</button>
      <button type="button" class="tab" id="tabDeck">${ICON.deck}Mazos</button>
    </nav>`;
  document.body.appendChild(root);

  const sprite = (d: FigureDef) => {
    const img = document.createElement('img');
    img.alt = '';
    spriteSrc(d.id).then((src) => { if (src) img.src = src; });
    return img;
  };

  /** A figure on its base with rarity and MP badges, like the original deck screen. */
  const figure = (d: FigureDef | undefined, tag: 'button' | 'div') => {
    const el = document.createElement(tag);
    el.className = 'fig' + (d ? '' : ' empty');
    if (tag === 'button') (el as HTMLButtonElement).type = 'button';
    const stand = document.createElement('div');
    stand.className = 'stand';
    el.appendChild(stand);
    if (!d) return el;
    const type = TYPE_COLOR[d.type ?? ''] ?? 0x6fae4a;
    stand.style.setProperty('--base-top', hex(type));
    stand.style.setProperty('--base-side', hex(shade(type, 0.55)));
    stand.appendChild(sprite(d));
    const badges = document.createElement('div');
    badges.className = 'badges';
    const r = rarity.get(d.id) ?? '';
    badges.innerHTML = `<span class="rar ${r}" title="Rareza">${RARITY_BADGE[r] ?? r}</span><span class="mp" title="MP">${d.mp}</span>`;
    el.appendChild(badges);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = d.name;
    el.appendChild(name);
    el.title = `${d.name} · ${d.mp} MP · ` + d.wheel.map((s) => `${s.move.name}${s.move.damage ? ' ' + s.move.damage : ''} (${s.move.color})`).join(' · ');
    return el;
  };

  const renderDeck = (el: HTMLElement, removable: boolean) => {
    el.innerHTML = '';
    for (let i = 0; i < DECK_SIZE; i++) {
      const d = byId.get(deck[i]);
      const f = figure(d, removable && d ? 'button' : 'div');
      if (removable && d) {
        f.setAttribute('aria-label', `Quitar ${d.name}`);
        f.onclick = () => { deck.splice(i, 1); changed(); };
      }
      el.appendChild(f);
    }
  };

  // Collection: built once, selection only toggles classes.
  const cards = new Map<string, HTMLElement>();
  const sorted = [...pool].sort((a, b) =>
    (RARITY_ORDER[rarity.get(a.id) ?? ''] ?? 9) - (RARITY_ORDER[rarity.get(b.id) ?? ''] ?? 9) || a.name.localeCompare(b.name));
  for (const d of sorted) {
    const card = figure(d, 'button');
    card.dataset.rarity = rarity.get(d.id) ?? '';
    const wheel = document.createElement('canvas');
    wheel.className = 'wheel';
    wheel.width = wheel.height = 96;
    wheel.setAttribute('aria-hidden', 'true');
    drawWheel(wheel, d, null, 0, true);
    const order = document.createElement('span');
    order.className = 'order';
    order.hidden = true;
    card.append(wheel, order);
    card.onclick = () => {
      const at = deck.indexOf(d.id);
      if (at >= 0) deck.splice(at, 1);
      else if (deck.length < DECK_SIZE) deck.push(d.id);
      changed();
    };
    cards.set(d.id, card);
    $('deckCards').appendChild(card);
  }

  const filters: [string, string][] = [['all', 'Todas'], ['EX', 'EX'], ['Rare', 'R'], ['Uncommon', 'UC'], ['Common', 'C']];
  for (const [key, label] of filters) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost'; b.textContent = label; b.dataset.key = key;
    b.onclick = () => { filter = key; changed(); };
    $('deckFilters').appendChild(b);
  }

  const changed = () => {
    saveDeck(deck);
    const full = deck.length === DECK_SIZE;
    renderDeck($('dmDeckFigs'), false);
    if (full) renderDeck($('dmHomeFigs'), false); else $('dmHomeFigs').innerHTML = '';
    renderDeck($('deckSlots'), true);
    for (const id of ['dmUsable', 'dmUsable2']) {
      $(id).textContent = `Usables ${deck.length}/${DECK_SIZE}`;
      $(id).classList.toggle('short', !full);
    }
    $('dmDeckNote').textContent = full ? 'Juegas con estas 6 figuras. La IA lleva un mazo al azar.'
      : 'Mientras no elijas 6 figuras juegas con un mazo al azar. La IA siempre lleva un mazo al azar.';
    $('dmHomeDeck').textContent = full ? 'Tu mazo' : 'Mazo al azar · elígelo en Mazos';
    $('deckCount').textContent = `Pulsa una figura para añadirla o quitarla. La ruleta pequeña muestra sus colores; con el ratón encima ves sus ataques.`;
    $<HTMLButtonElement>('deckDone').disabled = deck.length !== 0 && !full;
    for (const [id, card] of cards) {
      const at = deck.indexOf(id);
      card.classList.toggle('sel', at >= 0);
      card.classList.toggle('off', at < 0 && full);
      const order = card.querySelector<HTMLElement>('.order')!;
      order.hidden = at < 0;
      order.textContent = String(at + 1);
      card.hidden = filter !== 'all' && card.dataset.rarity !== filter;
    }
    for (const b of $('deckFilters').querySelectorAll<HTMLElement>('button')) b.classList.toggle('on', b.dataset.key === filter);
  };

  const history: Screen[] = [];
  const go = (s: Screen | null, remember = true) => {
    if (s === null) { root.classList.remove('show'); return; }
    if (remember && root.classList.contains('show') && s !== screen) history.push(screen);
    screen = s;
    root.classList.add('show');
    $('dmHome').classList.toggle('on', s === 'home');
    $('dmDeck').classList.toggle('on', s === 'deck');
    $('dmPick').classList.toggle('on', s === 'pick');
    $('tabLeague').classList.toggle('on', s === 'home');
    $('tabDeck').classList.toggle('on', s === 'deck' || s === 'pick');
    $('menuContinue').hidden = !hooks.canContinue();
    $('tabBack').hidden = !hooks.canContinue() && history.length === 0;
    changed();
  };

  $('menuPlay').onclick = () => { history.length = 0; go(null); hooks.play(deck.length === DECK_SIZE ? deck.map((id) => byId.get(id)!) : null); };
  $('menuContinue').onclick = () => { history.length = 0; go(null); };
  $('menuDeck').onclick = () => go('pick');
  $('tabLeague').onclick = () => go('home');
  $('tabDeck').onclick = () => go('deck');
  $('tabBack').onclick = () => {
    const prev = history.pop();
    if (prev) go(prev, false);
    else if (hooks.canContinue()) go(null);
  };
  $('deckDone').onclick = () => go('deck');
  $('deckClear').onclick = () => { deck = []; changed(); };
  $('deckRandom').onclick = () => {
    const ids = pool.map((d) => d.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    deck = ids.slice(0, DECK_SIZE);
    changed();
  };

  return () => { history.length = 0; go('home', false); };
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const shade = (n: number, k: number) =>
  (Math.round(((n >> 16) & 255) * k) << 16) | (Math.round(((n >> 8) & 255) * k) << 8) | Math.round((n & 255) * k);

function loadDeck(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DECK_KEY) ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch { return []; }
}

function saveDeck(deck: string[]) {
  try { localStorage.setItem(DECK_KEY, JSON.stringify(deck)); } catch { /* storage unavailable: the deck lasts this visit */ }
}
