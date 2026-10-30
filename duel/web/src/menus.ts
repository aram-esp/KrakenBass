import type { FigureRecord } from '../../src/data.ts';
import type { FigureDef } from '../../src/types.ts';
import { $, TYPE_COLOR, spriteSrc } from './shared.ts';
import { drawWheel } from './match.ts';
import { WORKING } from '../../src/abilities.ts';
import {
  BOOSTERS, CASE_SLOTS, GEMS_LOSS, GEMS_WIN, SHOP_PRICE, buyBooster, gemsToOpenNow, loadState, openFromCase, openReady, rewardDuel,
  type BoosterKind, type GachaState,
} from '../../src/gacha.ts';

const GACHA_KEY = 'duel.gacha';

export const DECK_SIZE = 6;
const DECK_KEY = 'duel.deck';
const TYPE_ES: Record<string, string> = {
  Normal: 'Normal', Fire: 'Fuego', Water: 'Agua', Electric: 'Eléctrico', Grass: 'Planta', Ice: 'Hielo', Fighting: 'Lucha',
  Poison: 'Veneno', Ground: 'Tierra', Flying: 'Volador', Psychic: 'Psíquico', Bug: 'Bicho', Rock: 'Roca', Ghost: 'Fantasma',
  Dragon: 'Dragón', Dark: 'Siniestro', Steel: 'Acero', Fairy: 'Hada',
};
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
.dm [hidden] { display: none !important; }
.dm .bar { background: linear-gradient(180deg, #123a86, var(--dm-navy)); border-bottom: 2px solid var(--dm-edge);
  padding-block: 8px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: flex; align-items: center; gap: 12px; }
.dm .bar .info { font-weight: 800; font-size: 13px; color: var(--dm-mute); letter-spacing: .02em; }
.dm .screen { flex: 1; min-height: 0; overflow: auto; display: none; flex-direction: column; align-items: center; gap: 18px;
  padding-block: 18px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.dm .screen.on { display: flex; }
.dm .screen > * { flex-shrink: 0; } /* long lists scroll the screen instead of squashing the panels */
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
.dm .types { font-weight: 700; font-size: 11px; color: var(--dm-mute); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm .ability { font-weight: 800; font-size: 11px; color: var(--dm-yellow); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm .ability.idle { color: #8a7a3a; }
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
.dm .gems { margin-left: auto; display: flex; align-items: center; gap: 8px; background: #061028; border: 2px solid #2b5fc4;
  border-radius: 999px; padding: 3px 14px 3px 6px; font-weight: 900; font-size: 18px; font-variant-numeric: tabular-nums; }
.dm .gem { width: 22px; height: 22px; background: linear-gradient(135deg, #ff6b6b, #c2185b); clip-path: polygon(50% 0, 100% 38%, 50% 100%, 0 38%); }
.dm .case { width: 100%; max-width: 720px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.dm .box { appearance: none; border: 3px solid #ffffff55; border-radius: 14px; min-height: 104px; cursor: pointer; color: #fff; font: 800 13px/1.2 var(--dm-font);
  display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; padding: 8px 4px; position: relative;
  background: var(--box, #2a3550); box-shadow: inset 0 -10px 0 #0003, 0 4px 0 #0006; text-shadow: 0 2px 0 #0007; }
.dm .box::before { content: ""; position: absolute; top: 10px; left: 50%; width: 38px; height: 38px; transform: translateX(-50%);
  border-radius: 8px; background: #ffffff33; box-shadow: inset 0 0 0 3px #ffffff88; }
.dm .box.empty { background: #0d1424; border-style: dashed; border-color: #2c3a5c; cursor: default; color: var(--dm-mute); text-shadow: none; }
.dm .box.empty::before { display: none; }
.dm .box.ready { border-color: #fff; animation: dm-pulse 1.4s ease-in-out infinite; }
.dm .box b { font-size: 15px; }
.dm .k-white { --box: linear-gradient(180deg, #f4f6fb, #aab3c5); color: #1d2433; text-shadow: none; }
.dm .k-blue { --box: linear-gradient(180deg, #4f9bff, #1450b8); }
.dm .k-purple { --box: linear-gradient(180deg, #b26bff, #5b1fa8); }
.dm .k-gold { --box: linear-gradient(180deg, #ffe06a, #c98a00); color: #3a2a00; text-shadow: none; }
.dm .k-rainbow { --box: linear-gradient(135deg, #ff7eb6, #ffd36e, #8dff9c, #7ec8ff, #c38bff); color: #1d2433; text-shadow: none; }
.dm .k-shop, .dm .k-welcome { --box: linear-gradient(180deg, #ff6b6b, #b0173a); }
@keyframes dm-pulse { 50% { transform: translateY(-3px); box-shadow: inset 0 -10px 0 #0003, 0 7px 0 #0006, 0 0 18px #fff8; } }
.dm .shop { width: 100%; max-width: 420px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.dm .shop .box { width: 160px; min-height: 170px; cursor: default; }
.dm .shop .box::before { width: 70px; height: 70px; top: 22px; }
.dm .price { display: flex; align-items: center; gap: 8px; font-weight: 900; font-size: 20px; }
.dm .fig.locked img { filter: brightness(0) opacity(.55); }
.dm .fig.locked .name { color: #5b6886; }
.dm .fig .copies { position: absolute; bottom: 34px; right: 10px; font-weight: 900; font-size: 12px; background: #000a; border-radius: 6px; padding: 0 5px; }
.dm .open { position: fixed; inset: 0; z-index: 30; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  background: radial-gradient(circle at 50% 40%, #1b3f8a, #050b1a 70%); padding: 16px; }
.dm .open.show { display: flex; }
.dm .open .box { width: 150px; min-height: 160px; cursor: default; animation: dm-shake .5s ease-in-out 3; }
.dm .open .box::before { width: 64px; height: 64px; top: 22px; }
.dm .open .got { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.dm .open .got .fig { width: 140px; animation: dm-pop .45s ease-out both; }
.dm .open .got .fig.EX .stand, .dm .open .got .fig.Rare .stand { filter: drop-shadow(0 0 14px #ffd21f); }
.dm .open .new { font-weight: 900; color: var(--dm-yellow); font-size: 13px; }
.dm .open h2 { margin: 0; font: 900 26px/1.2 var(--dm-font); text-align: center; }
@keyframes dm-shake { 25% { transform: rotate(-6deg); } 75% { transform: rotate(6deg); } }
@keyframes dm-pop { from { transform: scale(.4); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .dm .box.ready, .dm .open .box, .dm .open .got .fig { animation: none; } }
@media (max-width: 560px) { .dm .case { grid-template-columns: repeat(2, 1fr); } }
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
  shop: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 14h24l-2 20H10z" fill="#fff" stroke="#0b3a92" stroke-width="2" stroke-linejoin="round"/><path d="M14 14a6 6 0 0 1 12 0" fill="none" stroke="#0b3a92" stroke-width="2.5"/><circle cx="20" cy="24" r="5" fill="#e53935" stroke="#0b3a92" stroke-width="2"/><path d="M15 24h10" stroke="#0b3a92" stroke-width="2"/></svg>',
  deck: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="9" width="18" height="24" rx="3" fill="#cfe2ff" stroke="#0b3a92" stroke-width="2" transform="rotate(-10 14 21)"/><rect x="16" y="7" width="18" height="24" rx="3" fill="#fff" stroke="#0b3a92" stroke-width="2"/><circle cx="25" cy="19" r="5" fill="#e53935" stroke="#0b3a92" stroke-width="2"/><path d="M20 19h10" stroke="#0b3a92" stroke-width="2"/></svg>',
};

export interface MenuHooks {
  /** Start a new duel with this deck for the player (null: random deck). */
  play(deck: FigureDef[] | null): void;
  /** A duel is in progress and can be resumed. */
  canContinue(): boolean;
}

type Screen = 'home' | 'deck' | 'pick' | 'shop';

export interface Menus {
  /** Show the League (home) screen. */
  open(): void;
  /** Reward the end of a duel; returns a line for the end banner. */
  duelEnded(won: boolean): string;
}

/** League (home), Edit Deck, figure picker and Shop, in the style of the original app. */
export function setupMenus(pool: FigureDef[], records: FigureRecord[], hooks: MenuHooks): Menus {
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
  let gacha: GachaState = loadState(read(GACHA_KEY));
  const owns = (id: string) => (gacha.owned[id] ?? 0) > 0;
  let deck: string[] = loadDeck().filter((id) => byId.has(id) && owns(id)).slice(0, DECK_SIZE);
  const pullable = pool.map((d) => ({ id: d.id, rarity: rarity.get(d.id) ?? 'Common' }));
  const saveGacha = () => write(GACHA_KEY, JSON.stringify(gacha));
  let screen: Screen = 'home';
  let filter = 'mine';

  const root = document.createElement('section');
  root.className = 'dm';
  root.id = 'mainMenu';
  root.setAttribute('aria-label', 'Menú');
  root.innerHTML = `
    <div class="bar"><span class="info">Versión 1.0.0 · ${pool.length} figuras</span>
      <span class="gems" title="Gemas"><i class="gem"></i><span id="dmGems">0</span></span></div>
    <div class="screen" id="dmHome">
      <div class="pill">Liga</div>
      <div class="hero">
        <h1>Duelo de Figuras</h1>
        <div class="figs" id="dmHomeFigs"></div>
        <p id="dmHomeDeck"></p>
        <button type="button" class="yellow big" id="menuPlay">Jugar</button>
        <button type="button" class="ghost" id="menuContinue">Continuar duelo</button>
      </div>
      <div class="row" id="dmWelcome"></div>
      <div class="case" id="dmCase"></div>
      <p class="note">Cada duelo te da gemas y, si hay hueco en la vitrina, un booster que se abre cuando pasa su tiempo (o antes con gemas).</p>
      <p class="note">Contra la IA. Regla de la casa: en cada choque gana uno y el otro va al P.C.; si empatan, se vuelve a girar.</p>
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
    <div class="screen" id="dmShop">
      <div class="pill">Tienda</div>
      <div class="shop">
        <div class="box k-shop"><b>Booster</b></div>
        <div class="price"><i class="gem"></i>${SHOP_PRICE}</div>
        <p class="note">${BOOSTERS.shop.slots.length} figuras, una de ellas poco común (UC) o mejor.</p>
        <button type="button" class="yellow" id="shopBuy">Comprar</button>
        <p class="note" id="shopNote"></p>
      </div>
    </div>
    <div class="open" id="dmOpen" role="dialog" aria-modal="true" aria-label="Abrir booster">
      <h2 id="dmOpenTitle"></h2>
      <div class="box" id="dmOpenBox"></div>
      <div class="got" id="dmOpenGot"></div>
      <button type="button" class="yellow" id="dmOpenOk" hidden>Seguir</button>
    </div>
    <nav class="tabs" aria-label="Secciones">
      <button type="button" class="tab" id="tabBack">${ICON.back}Atrás</button>
      <button type="button" class="tab" id="tabLeague">${ICON.league}Liga</button>
      <button type="button" class="tab" id="tabDeck">${ICON.deck}Mazos</button>
      <button type="button" class="tab" id="tabShop">${ICON.shop}Tienda</button>
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
    // Secondary type: the side of the base takes its colour.
    stand.style.setProperty('--base-side', hex(shade(d.type2 ? TYPE_COLOR[d.type2] ?? type : type, 0.7)));
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
    const types = document.createElement('span');
    types.className = 'types';
    types.textContent = [d.type, d.type2].filter(Boolean).map((t) => TYPE_ES[t!] ?? t).join(' / ');
    el.appendChild(types);
    if (d.ability) {
      const ab = document.createElement('span');
      ab.className = 'ability' + (WORKING.has(d.ability.name) ? '' : ' idle');
      ab.textContent = `★ ${d.ability.name}`;
      el.appendChild(ab);
    }
    el.title = `${d.name} · ${[d.type, d.type2].filter(Boolean).map((t) => TYPE_ES[t!] ?? t).join(' / ')} · ${d.mp} MP`
      + (d.ability ? `\nHabilidad ${d.ability.name}: ${d.ability.effect}${WORKING.has(d.ability.name) ? '' : ' (aún sin efecto en este juego)'}` : '')
      + '\n' + d.wheel.map((s) => `${s.move.name}${s.move.damage ? ' ' + s.move.damage : ''} (${s.move.color})`).join(' · ');
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
    const copies = document.createElement('span');
    copies.className = 'copies';
    card.appendChild(copies);
    card.onclick = () => {
      if (!owns(d.id)) return;
      const at = deck.indexOf(d.id);
      if (at >= 0) deck.splice(at, 1);
      else if (deck.length < DECK_SIZE) deck.push(d.id);
      changed();
    };
    cards.set(d.id, card);
    $('deckCards').appendChild(card);
  }

  const filters: [string, string][] = [['mine', 'Mías'], ['all', 'Todas'], ['EX', 'EX'], ['Rare', 'R'], ['Uncommon', 'UC'], ['Common', 'C']];
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
    const mine = pool.filter((d) => owns(d.id)).length;
    $('dmDeckNote').textContent = full ? 'Juegas con estas 6 figuras. La IA lleva un mazo al azar.'
      : mine >= DECK_SIZE ? 'Mientras no elijas 6 figuras juegas con 6 de las tuyas al azar. La IA siempre lleva un mazo al azar.'
      : 'Necesitas 6 figuras distintas para jugar: abre boosters en Liga o compra en la Tienda.';
    $('dmHomeDeck').textContent = full ? 'Tu mazo' : mine >= DECK_SIZE ? 'Mazo al azar con tus figuras · elígelo en Mazos'
      : `Tienes ${mine} figuras: abre tus boosters para llegar a 6`;
    $<HTMLButtonElement>('menuPlay').disabled = mine < DECK_SIZE;
    $('deckCount').textContent = `Tienes ${mine} de ${pool.length} figuras. Pulsa una tuya para añadirla o quitarla; las oscuras aún no las tienes.`;
    renderGacha();
    $<HTMLButtonElement>('deckDone').disabled = deck.length !== 0 && !full;
    for (const [id, card] of cards) {
      const at = deck.indexOf(id);
      card.classList.toggle('sel', at >= 0);
      const have = gacha.owned[id] ?? 0;
      card.classList.toggle('locked', !have);
      card.classList.toggle('off', at < 0 && (full || !have));
      card.querySelector<HTMLElement>('.copies')!.textContent = have > 1 ? `x${have}` : '';
      const order = card.querySelector<HTMLElement>('.order')!;
      order.hidden = at < 0;
      order.textContent = String(at + 1);
      card.hidden = filter === 'mine' ? !have : filter !== 'all' && card.dataset.rarity !== filter;
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
    $('dmShop').classList.toggle('on', s === 'shop');
    $('tabShop').classList.toggle('on', s === 'shop');
    $('tabLeague').classList.toggle('on', s === 'home');
    $('tabDeck').classList.toggle('on', s === 'deck' || s === 'pick');
    $('menuContinue').hidden = !hooks.canContinue();
    $('tabBack').hidden = !hooks.canContinue() && history.length === 0;
    changed();
  };

  $('menuPlay').onclick = () => {
    const mine = pool.filter((d) => owns(d.id));
    if (mine.length < DECK_SIZE) return;
    for (let i = mine.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mine[i], mine[j]] = [mine[j], mine[i]]; }
    history.length = 0;
    go(null);
    hooks.play(deck.length === DECK_SIZE ? deck.map((id) => byId.get(id)!) : mine.slice(0, DECK_SIZE));
  };

  // ---------- boosters ----------
  const boxLabel = (kind: BoosterKind) => `Booster ${BOOSTERS[kind].name}`;
  const timeLeft = (ms: number) => {
    const m = Math.ceil(ms / 60_000);
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  };
  /** Case slot armed for a gem purchase: a first tap shows the price, a second one pays. */
  let armed = -1;
  const renderGacha = () => {
    $('dmGems').textContent = String(gacha.gems);
    const now = Date.now();
    const caseEl = $('dmCase');
    caseEl.innerHTML = '';
    for (let i = 0; i < CASE_SLOTS; i++) {
      const b = gacha.case[i];
      const el = document.createElement('button');
      el.type = 'button';
      if (!b) { el.className = 'box empty'; el.disabled = true; el.textContent = 'Hueco libre'; caseEl.appendChild(el); continue; }
      const left = b.readyAt - now, ready = left <= 0, cost = gemsToOpenNow(left);
      el.className = `box k-${b.kind}` + (ready ? ' ready' : '');
      const sub = ready ? '¡Abrir!' : armed === i ? (cost <= gacha.gems ? `Abrir ya: ${cost} gemas` : `Faltan gemas (${cost})`) : timeLeft(left);
      el.innerHTML = `<b></b><span></span>`;
      el.querySelector('b')!.textContent = BOOSTERS[b.kind].name;
      el.querySelector('span')!.textContent = sub;
      el.setAttribute('aria-label', `${boxLabel(b.kind)}: ${sub}`);
      el.onclick = () => {
        const left2 = b.readyAt - Date.now();
        if (left2 > 0 && armed !== i) { armed = i; renderGacha(); return; }
        armed = -1;
        const got = openFromCase(gacha, i, Date.now(), pullable, Math.random);
        if (!got) { renderGacha(); return; }
        saveGacha();
        reveal(b.kind, got);
      };
      caseEl.appendChild(el);
    }
    const w = $('dmWelcome');
    w.innerHTML = '';
    if (gacha.ready.length) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'yellow';
      const k = gacha.ready[0].kind;
      btn.textContent = `Abrir ${k === 'welcome' ? 'booster de bienvenida' : 'booster'} (${gacha.ready.length})`;
      btn.onclick = () => { const r = openReady(gacha, pullable, Math.random); if (r) { saveGacha(); reveal(r.kind, r.got); } };
      w.appendChild(btn);
    }
    $<HTMLButtonElement>('shopBuy').disabled = gacha.gems < SHOP_PRICE;
    $('shopNote').textContent = gacha.gems < SHOP_PRICE ? `Tienes ${gacha.gems} gemas. Ganas gemas en cada duelo.` : `Tienes ${gacha.gems} gemas.`;
  };

  /** Booster opening: the box shakes, then the figures pop out one by one. */
  const reveal = (kind: BoosterKind, got: string[]) => {
    renderGacha(); // gems and case update at once, under the opening overlay
    const box = $('dmOpenBox');
    box.className = `box k-${kind}`;
    box.innerHTML = `<b>${BOOSTERS[kind].name}</b>`;
    box.hidden = false;
    $('dmOpenTitle').textContent = boxLabel(kind);
    const out = $('dmOpenGot');
    out.innerHTML = '';
    $('dmOpenOk').hidden = true;
    $('dmOpen').classList.add('show');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      box.hidden = true;
      got.forEach((id, i) => {
        const d = byId.get(id)!;
        const f = figure(d, 'div');
        f.classList.add(rarity.get(id) ?? '');
        f.style.animationDelay = `${i * 0.35}s`;
        const n = document.createElement('span');
        n.className = 'new';
        n.textContent = gacha.owned[id] === 1 ? '¡Nueva!' : `Repetida (x${gacha.owned[id]})`;
        f.appendChild(n);
        out.appendChild(f);
      });
      $('dmOpenOk').hidden = false;
      $('dmOpenOk').focus();
    }, reduce ? 0 : 1500);
  };
  $('dmOpenOk').onclick = () => { $('dmOpen').classList.remove('show'); changed(); };
  $('shopBuy').onclick = () => {
    if (!buyBooster(gacha)) return;
    const r = openReady(gacha, pullable, Math.random);
    saveGacha();
    if (r) reveal(r.kind, r.got);
  };
  // Timers on the case tick while the League screen is open.
  setInterval(() => { if (root.classList.contains('show') && screen === 'home' && !$('dmOpen').classList.contains('show')) renderGacha(); }, 15_000);
  $('menuContinue').onclick = () => { history.length = 0; go(null); };
  $('menuDeck').onclick = () => go('pick');
  $('tabLeague').onclick = () => go('home');
  $('tabDeck').onclick = () => go('deck');
  $('tabShop').onclick = () => go('shop');
  $('tabBack').onclick = () => {
    const prev = history.pop();
    if (prev) go(prev, false);
    else if (hooks.canContinue()) go(null);
  };
  $('deckDone').onclick = () => go('deck');
  $('deckClear').onclick = () => { deck = []; changed(); };
  $('deckRandom').onclick = () => {
    const ids = pool.filter((d) => owns(d.id)).map((d) => d.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    deck = ids.slice(0, DECK_SIZE);
    changed();
  };

  return {
    open: () => { history.length = 0; armed = -1; go('home', false); },
    duelEnded: (won) => {
      gacha = loadState(read(GACHA_KEY)); // another tab may have changed it
      const b = rewardDuel(gacha, won, Date.now(), Math.random);
      saveGacha();
      const g = won ? GEMS_WIN : GEMS_LOSS;
      return b ? `+${g} gemas · ${boxLabel(b.kind)} (${BOOSTERS[b.kind].hours} h) en la vitrina`
        : `+${g} gemas · la vitrina está llena: abre algún booster`;
    },
  };
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable: progress lasts this visit */ }
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
