import type { FigureRecord } from '../../src/data.ts';
import type { FigureDef } from '../../src/types.ts';
import { $, TYPE_COLOR, spriteSrc } from './shared.ts';
import { drawWheel } from './match.ts';
import { WORKING, pendingReason } from '../../src/abilities.ts';
import { WIKI_CSS, renderWiki } from './wiki.ts';
import { plateSpec, type PlateDef } from '../../src/plates.ts';
import {
  BOOSTERS, CASE_SLOTS, EVOLVE_BATTLES, EVOLVE_DUELS, GEMS_LOSS, GEMS_WIN, SHOP_PRICE, evolve, evolveProgress,
  grantStarterPlates, recordBattle, recordDuel, rollPlate, buyBooster, gemsToOpenNow, loadState, openFromCase, openReady, rewardDuel,
  type BoosterKind, type GachaState,
} from '../../src/gacha.ts';
import {
  CARMONITE_MATERIAL, CARMONITE_PER_LEVEL, CHAIN_COPIES, EXCHANGE_PRICE, INGOT_COINS, ITEM_ES, LEVEL_EXP, MAX_CHAIN, MAX_LEVEL,
  MAX_LEVEL_CARMONITE, METAL_EXP, PLATE_COINS, RARS, RAR_SHORT, SELL_LV1, applyProgress, asRar, boosterItems, duelExp, freePoints,
  fuse, fusionPreview, levelOf, placePoint, progOf, sellFigure, sellIngot, useCarmonite, wallet, type FusionInput, type ItemKind,
} from '../../src/progress.ts';

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
.dm .fig .evo { font-weight: 800; font-size: 10px; color: #7fd4ff; max-width: 100%; text-align: center; }
.dm .evolist { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.dm .evorow { display: flex; align-items: center; gap: 10px; background: #0003; border-radius: 12px; padding: 6px 10px; min-width: 0; }
.dm .evorow img { width: 48px; height: 48px; image-rendering: pixelated; object-fit: contain; flex-shrink: 0; }
.dm .evorow .what { flex: 1; min-width: 0; font-weight: 800; }
.dm .evorow .what small { display: block; font-weight: 700; color: var(--dm-mute); }
.dm .evorow .arrow { font-weight: 900; color: var(--dm-yellow); }
.dm .evorow .yellow { font-size: 15px; padding: 8px 14px; border-width: 3px; }
.dm .plates { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; padding: 14px 12px 18px; }
.dm .plategrid { width: 100%; max-width: 980px; display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
.dm .plate { appearance: none; position: relative; aspect-ratio: 3 / 4; border-radius: 10px; border: 2px solid #3a4356; color: #fff; font: inherit;
  background: linear-gradient(160deg, #2a2f3c 0%, #101319 55%, #1b1f29 100%); padding: 8px 7px 16px; text-align: left; cursor: pointer;
  display: flex; flex-direction: column; justify-content: center; overflow: hidden; clip-path: polygon(12% 0, 100% 0, 100% 100%, 0 100%, 0 9%); }
.dm .plate.empty { background: #141925; border-style: dashed; cursor: default; clip-path: none; }
.dm .plate b { font: 900 14px/1.1 var(--dm-font); text-wrap: balance; }
.dm .plate .pr { position: absolute; top: 4px; right: 7px; font-weight: 900; font-size: 13px; color: #e8ecf4; }
.dm .plate .pc { position: absolute; left: 8px; right: 8px; bottom: 6px; display: flex; gap: 3px; }
.dm .plate .pc i { flex: 1; height: 4px; border-radius: 2px; background: var(--cat, #aaa); } .dm .plate .pc i.o { background: #ffffff22; }
.dm .plate .cnt { position: absolute; left: 6px; bottom: 14px; font-size: 10px; font-weight: 800; color: var(--dm-mute); }
.dm .plate.c-battle { --cat: #ff5b5b; } .dm .plate.c-battle b { color: #ff7b6b; }
.dm .plate.c-move { --cat: #c06bff; } .dm .plate.c-move b { color: #d49bff; }
.dm .plate.c-heal { --cat: #4cd964; } .dm .plate.c-heal b { color: #7fe38f; }
.dm .plate.c-spin { --cat: #3fa2ff; } .dm .plate.c-spin b { color: #7fc0ff; }
.dm .plate.c-poke { --cat: #ffd21f; } .dm .plate.c-poke b { color: #ffe066; }
.dm .plate.c-plates { --cat: #c9ced8; }
.dm .plate.sel { border-color: var(--dm-yellow); box-shadow: 0 0 14px #ffd21f88; }
.dm .plate.off { opacity: .45; }
.dm .platewrap { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 120px; }
.dm .plate.pop { animation: dm-pop .45s ease-out both; width: 120px; }
@media (max-width: 560px) { .dm .plates { grid-template-columns: repeat(3, 1fr); } }
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
.dm .gems + .gems { margin-left: 6px; }
.dm .coinI { width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff6b0, #f2b400 55%, #a87100); box-shadow: inset 0 0 0 2px #7a5200; }
.dm .matI { width: 20px; height: 20px; border-radius: 4px; background: linear-gradient(135deg, #8ff0ff, #2a8fd6); transform: rotate(45deg) scale(.8); }
.dm .rar + .lv:not(:empty), .dm .lv:not(:empty) { background: #0b3a92; color: #fff; border-radius: 6px; padding: 0 5px; font-size: 11px; font-weight: 900; }
.dm .fu-top { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px; }
.dm .fu-sel { display: flex; gap: 8px; align-items: center; font-weight: 800; flex-wrap: wrap; justify-content: center; }
.dm select { font: 800 15px var(--dm-font); background: #0c1730; color: var(--dm-ink); border: 2px solid #4a5f8c; border-radius: 10px; padding: 6px 10px; max-width: 100%; }
.dm .fu-main { display: flex; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap; }
.dm .fu-main .fig { width: 130px; }
.dm .fu-stats { font-weight: 800; text-align: center; color: #dfe7f7; }
.dm .fu-stats small { display: block; color: var(--dm-mute); }
.dm .fu-bar { width: min(320px, 100%); height: 10px; border-radius: 6px; background: #0a1226; border: 2px solid #2b5fc4; overflow: hidden; }
.dm .fu-bar i { display: block; height: 100%; background: linear-gradient(90deg, #4fd1ff, #2a74f0); }
.dm .fu-pieces, .dm .fu-mats { width: 100%; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px 14px; }
.dm .fu-piece, .dm .fu-mat { display: flex; align-items: center; gap: 8px; background: #0e1830; border-radius: 10px; padding: 6px 8px; font-weight: 800; }
.dm .fu-piece .sw { width: 16px; height: 16px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 2px #0006; }
.dm .fu-piece .nm, .dm .fu-mat .nm { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.dm .fu-piece .nm small, .dm .fu-mat .nm small { color: var(--dm-mute); margin-left: 4px; }
.dm .fu-piece .ghost, .dm .fu-mat .ghost { padding: 4px 9px; font-size: 13px; }
.dm .fu-mat b { min-width: 2ch; text-align: center; font-variant-numeric: tabular-nums; }
.dm .itemchips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.dm .itemchips span { background: #0b3a92; border: 2px solid #4f8cff; border-radius: 999px; padding: 3px 10px; font-weight: 800; font-size: 13px; animation: dm-pop .5s both; }
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
  wiki: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 9c5-2 10-2 14 1v23c-4-3-9-3-14-1z" fill="#fff" stroke="#0b3a92" stroke-width="2" stroke-linejoin="round"/><path d="M34 9c-5-2-10-2-14 1v23c4-3 9-3 14-1z" fill="#cfe2ff" stroke="#0b3a92" stroke-width="2" stroke-linejoin="round"/></svg>',
  shop: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 14h24l-2 20H10z" fill="#fff" stroke="#0b3a92" stroke-width="2" stroke-linejoin="round"/><path d="M14 14a6 6 0 0 1 12 0" fill="none" stroke="#0b3a92" stroke-width="2.5"/><circle cx="20" cy="24" r="5" fill="#e53935" stroke="#0b3a92" stroke-width="2"/><path d="M15 24h10" stroke="#0b3a92" stroke-width="2"/></svg>',
  deck: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="9" width="18" height="24" rx="3" fill="#cfe2ff" stroke="#0b3a92" stroke-width="2" transform="rotate(-10 14 21)"/><rect x="16" y="7" width="18" height="24" rx="3" fill="#fff" stroke="#0b3a92" stroke-width="2"/><circle cx="25" cy="19" r="5" fill="#e53935" stroke="#0b3a92" stroke-width="2"/><path d="M20 19h10" stroke="#0b3a92" stroke-width="2"/></svg>',
};

export interface MenuHooks {
  /** Start a new duel with this deck for the player (null: random deck). */
  play(deck: FigureDef[] | null, plates: PlateDef[]): void;
  /** A duel is in progress and can be resumed. */
  canContinue(): boolean;
}

type Screen = 'home' | 'deck' | 'pick' | 'plates' | 'shop' | 'wiki' | 'fuse';

/** Plate deck rules of the early versions (Fandom "Deck", Nintendo Life): up to 6 plates, total cost 6 or less. */
export const PLATE_SLOTS = 6;
export const PLATE_COST_MAX = 6;
const PLATE_DECK_KEY = 'duel.plateDeck';
const PLATE_CAT: Record<string, string> = { Battle: 'battle', Movement: 'move', Recovery: 'heal', Spin: 'spin', 'Pokémon': 'poke', Plates: 'plates' };

export interface Menus {
  /** Show the League (home) screen. */
  open(): void;
  /** Reward the end of a duel and count it for the deck's figures; returns a line for the end banner. */
  duelEnded(won: boolean, deckIds: string[]): string;
  /** One of the player's figures fought a battle (counts toward evolving). */
  battleFought(id: string): void;
}

/** League (home), Edit Deck, figure picker and Shop, in the style of the original app. */
export function setupMenus(pool: FigureDef[], records: FigureRecord[], hooks: MenuHooks,
  extras: FigureDef[] = [], evolves: Record<string, string[]> = {}, plates: PlateDef[] = []): Menus {
  // `pool`: figures of the game version (boosters give these); `extras`: figures only reached by evolving.
  const style = document.createElement('style');
  style.textContent = CSS + WIKI_CSS;
  document.head.appendChild(style);
  if (!document.querySelector('link[data-dm-font]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap';
    font.dataset.dmFont = '';
    document.head.appendChild(font);
  }

  const rarity = new Map(records.map((r) => [String(r.id), r.rarity]));
  const rarOf = (id: string) => asRar(rarity.get(id));
  const all = [...pool, ...extras];
  const extraIds = new Set(extras.map((d) => d.id));
  const byId = new Map(all.map((d) => [d.id, d]));
  let gacha: GachaState = loadState(read(GACHA_KEY));
  const owns = (id: string) => (gacha.owned[id] ?? 0) > 0;
  let deck: string[] = loadDeck().filter((id) => byId.has(id) && owns(id)).slice(0, DECK_SIZE);
  const pullable = pool.map((d) => ({ id: d.id, rarity: rarity.get(d.id) ?? 'Common' }));
  const saveGacha = () => write(GACHA_KEY, JSON.stringify(gacha));
  // ---------- plates ----------
  const plateById = new Map(plates.map((p) => [p.id, p]));
  const usablePlates = plates.filter((p) => plateSpec(p).status === 'ok');
  grantStarterPlates(gacha, plates);
  saveGacha();
  const ownedPlate = (id: string) => gacha.plates?.[id] ?? 0;
  const loadPlateDeck = (): string[] => {
    try { const v = JSON.parse(read(PLATE_DECK_KEY) ?? 'null'); if (Array.isArray(v)) return v.map(String); } catch { /* none */ }
    return Object.entries(gacha.plates ?? {}).flatMap(([id, n]) => Array(n).fill(id)).slice(0, PLATE_SLOTS);
  };
  let plateDeck = loadPlateDeck().filter((id) => plateById.has(id));
  const plateCost = () => plateDeck.reduce((c, id) => c + (plateById.get(id)?.cost ?? 0), 0);
  const fitPlateDeck = () => {
    const left = new Map<string, number>();
    plateDeck = plateDeck.filter((id) => { const n = (left.get(id) ?? ownedPlate(id)); left.set(id, n - 1); return n > 0; }).slice(0, PLATE_SLOTS);
    while (plateCost() > PLATE_COST_MAX) plateDeck.pop();
  };
  fitPlateDeck();
  /** A plate card in the style of the original (category colour, rarity, cost pips). */
  const plateCard = (p: PlateDef | undefined, tag: 'button' | 'div') => {
    const el = document.createElement(tag);
    el.className = 'plate' + (p ? ` c-${PLATE_CAT[p.category] ?? 'plates'}` : ' empty');
    if (tag === 'button') (el as HTMLButtonElement).type = 'button';
    if (!p) return el;
    el.innerHTML = `<span class="pr"></span><b></b><span class="pc"></span>`;
    el.querySelector('.pr')!.textContent = RARITY_BADGE[p.rarity] ?? p.rarity;
    el.querySelector('b')!.textContent = p.name;
    el.querySelector('.pc')!.innerHTML = '<i></i>'.repeat(p.cost) + '<i class="o"></i>'.repeat(Math.max(0, 3 - p.cost));
    el.title = `${p.name} (coste ${p.cost})\n${p.text}${plateSpec(p).status === 'ok' ? '' : `\nNo se puede usar aquí: ${plateSpec(p).reason}`}`;
    return el;
  };
  let screen: Screen = 'home';
  let filter = 'mine';

  const root = document.createElement('section');
  root.className = 'dm';
  root.id = 'mainMenu';
  root.setAttribute('aria-label', 'Menú');
  root.innerHTML = `
    <div class="bar"><span class="info">Versión 1.0.0 · ${pool.length} figuras</span>
      <span class="gems" title="Gemas"><i class="gem"></i><span id="dmGems">0</span></span>
      <span class="gems" title="Monedas"><i class="coinI"></i><span id="dmCoins">0</span></span>
      <span class="gems" title="Material"><i class="matI"></i><span id="dmMat">0</span></span></div>
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
      <p class="note">Contra la IA, con las ruletas, estados alterados y efectos de ataque del original. Más en la Pokédex.</p>
    </div>
    <div class="screen" id="dmDeck">
      <div class="pill">Editar mazo</div>
      <div class="panel">
        <div class="panel-head"><h2>Figuras</h2><span class="usable" id="dmUsable"></span></div>
        <div class="figs" id="dmDeckFigs"></div>
      </div>
      <p class="note" id="dmDeckNote"></p>
      <div class="row"><button type="button" class="yellow" id="menuDeck">Editar figuras</button></div>
      <div class="panel">
        <div class="panel-head"><h2>Plates</h2><span class="usable" id="dmPlateCost"></span></div>
        <div class="plates" id="dmDeckPlates"></div>
      </div>
      <div class="row"><button type="button" class="yellow" id="menuPlates">Editar plates</button></div>
      <div class="panel">
        <div class="panel-head"><h2>Mejorar figuras</h2></div>
        <p class="note" style="padding:10px 14px">Sube de nivel (hasta 5, y hasta 10 con Carmonite) y de Chain Level fusionando figuras, Rare Metals y Cubos.</p>
        <div class="row" style="padding-bottom:14px"><button type="button" class="yellow" id="menuFuse">Fusión</button></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Evolución</h2></div>
        <p class="note" style="padding:10px 14px 0">Una figura puede evolucionar tras ${EVOLVE_BATTLES} combates o ${EVOLVE_DUELS} duelos en tu mazo. Una copia se convierte en su evolución.</p>
        <div class="evolist" id="dmEvo"></div>
      </div>
    </div>
    <div class="screen" id="dmPlates">
      <div class="pill">Editar plates</div>
      <div class="panel">
        <div class="panel-head"><h2>Plates</h2><span class="usable" id="dmPlateCost2"></span></div>
        <div class="plates" id="plateSlots"></div>
      </div>
      <div class="row"><button type="button" class="ghost" id="plateClear">Vaciar</button><button type="button" class="yellow" id="plateDone">Listo</button></div>
      <p class="note">Hasta ${PLATE_SLOTS} plates con un coste total de ${PLATE_COST_MAX} como mucho. Cada una se usa una vez por duelo, al principio de tu turno. Pulsa una tuya para añadirla o quitarla; con el ratón encima ves su efecto.</p>
      <div class="plategrid" id="plateCards"></div>
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
      <div class="panel">
        <div class="panel-head"><h2>Intercambio de Material</h2><span class="usable" id="shMat"></span></div>
        <div class="fu-top">
          <label class="fu-sel">Figura <select id="shExFig"></select></label>
          <button type="button" class="yellow" id="shExBuy">Cambiar</button>
          <button type="button" class="ghost" id="shCarm">Carmonite ×1 por ${CARMONITE_MATERIAL} Material</button>
          <p class="note" id="shExNote"></p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Vender</h2><span class="usable" id="shCoins"></span></div>
        <div class="fu-mats" id="shSell"></div>
      </div>
    </div>
    <div class="screen" id="dmFuse">
      <div class="pill">Fusión</div>
      <div class="panel">
        <div class="panel-head"><h2>Figura</h2><span class="usable" id="fuLevel"></span></div>
        <div class="fu-top">
          <label class="fu-sel">Mejorar <select id="fuPick"></select></label>
          <div class="fu-main"><div id="fuFig"></div><canvas id="fuWheel" width="170" height="170" aria-hidden="true"></canvas></div>
          <div class="fu-stats" id="fuStats"></div>
          <div class="fu-bar" aria-hidden="true"><i id="fuExpBar"></i></div>
        </div>
        <div class="fu-pieces" id="fuPieces"></div>
        <div class="fu-top" style="padding-top:0">
          <label class="fu-sel" id="fuShrinkWrap">Con Carmonite, el punto sale de <select id="fuShrink"></select></label>
          <button type="button" class="ghost" id="fuCarm"></button>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Material de fusión</h2><span class="usable" id="fuCost"></span></div>
        <div class="fu-mats" id="fuMats"></div>
      </div>
      <div class="row"><button type="button" class="ghost" id="fuReset">Vaciar</button><button type="button" class="yellow" id="fuGo">Fusionar</button></div>
      <p class="note" id="fuNote"></p>
    </div>
    <div class="screen" id="dmWiki"><div class="pill">Pokédex</div><div id="dmWikiBody" style="width:100%;display:flex;justify-content:center"></div></div>
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
      <button type="button" class="tab" id="tabWiki">${ICON.wiki}Pokédex</button>
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
    badges.innerHTML = `<span class="rar ${r}" title="Rareza">${RARITY_BADGE[r] ?? r}</span><span class="lv" title="Nivel y Chain Level"></span><span class="mp" title="MP">${d.mp}</span>`;
    badges.querySelector<HTMLElement>('.lv')!.dataset.lv = d.id;
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
      + (d.ability ? `\nHabilidad ${d.ability.name}: ${d.ability.effect}${WORKING.has(d.ability.name) ? '' : ` (aún sin efecto: ${pendingReason(d.ability.name)})`}` : '')
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
  const sorted = [...all].sort((a, b) =>
    (RARITY_ORDER[rarity.get(a.id) ?? ''] ?? 9) - (RARITY_ORDER[rarity.get(b.id) ?? ''] ?? 9) || a.name.localeCompare(b.name));
  for (const d of sorted) {
    const card = figure(d, 'button');
    card.dataset.rarity = rarity.get(d.id) ?? '';
    const prog = document.createElement('span');
    prog.className = 'evo';
    card.appendChild(prog);
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
    const mine = all.filter((d) => owns(d.id)).length;
    const evolvedMine = extras.filter((d) => owns(d.id)).length;
    $('dmDeckNote').textContent = full ? 'Juegas con estas 6 figuras. La IA lleva un mazo al azar.'
      : mine >= DECK_SIZE ? 'Mientras no elijas 6 figuras juegas con 6 de las tuyas al azar. La IA siempre lleva un mazo al azar.'
      : 'Necesitas 6 figuras distintas para jugar: abre boosters en Liga o compra en la Tienda.';
    $('dmHomeDeck').textContent = full ? 'Tu mazo' : mine >= DECK_SIZE ? 'Mazo al azar con tus figuras · elígelo en Mazos'
      : `Tienes ${mine} figuras: abre tus boosters para llegar a 6`;
    $<HTMLButtonElement>('menuPlay').disabled = mine < DECK_SIZE;
    $('deckCount').textContent = `Tienes ${mine - evolvedMine} de ${pool.length} figuras${evolvedMine ? ` y ${evolvedMine} evolucionadas` : ''}. `
      + 'Pulsa una tuya para añadirla o quitarla; las oscuras aún no las tienes.';
    renderEvolutions();
    renderPlates();
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
      // Evolution-only figures appear once you have them.
      card.hidden = filter === 'mine' || extraIds.has(id) ? !have : filter !== 'all' && card.dataset.rarity !== filter;
      const p = evolveProgress(gacha, id), canEvo = have > 0 && (evolves[id] ?? []).some((t) => byId.has(t));
      card.querySelector<HTMLElement>('.evo')!.textContent = !canEvo ? '' : p.ready ? '¡Puede evolucionar!'
        : `Evoluciona: ${p.battles}/${EVOLVE_BATTLES} combates · ${p.duels}/${EVOLVE_DUELS} duelos`;
    }
    for (const b of $('deckFilters').querySelectorAll<HTMLElement>('button')) b.classList.toggle('on', b.dataset.key === filter);
    for (const el of root.querySelectorAll<HTMLElement>('[data-lv]')) {
      const id = el.dataset.lv!, p = gacha.prog?.[id], lv = levelOf(p, rarOf(id));
      el.textContent = !owns(id) || (lv === 1 && !p?.clv) ? '' : `Nv${lv}${p?.clv ? ` C${p.clv}` : ''}`;
    }
    if (screen === 'fuse') renderFuse();
    if (screen === 'shop') renderShop();
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
    $('dmPlates').classList.toggle('on', s === 'plates');
    $('dmShop').classList.toggle('on', s === 'shop');
    $('dmFuse').classList.toggle('on', s === 'fuse');
    $('tabShop').classList.toggle('on', s === 'shop');
    $('dmWiki').classList.toggle('on', s === 'wiki');
    $('tabWiki').classList.toggle('on', s === 'wiki');
    if (s === 'wiki') renderWiki($('dmWikiBody'), { pool, extras, records, evolves, owned: () => gacha.owned, plates, ownedPlates: () => gacha.plates ?? {} });
    $('tabLeague').classList.toggle('on', s === 'home');
    $('tabDeck').classList.toggle('on', s === 'deck' || s === 'pick' || s === 'plates' || s === 'fuse');
    $('menuContinue').hidden = !hooks.canContinue();
    $('tabBack').hidden = !hooks.canContinue() && history.length === 0;
    changed();
  };

  $('menuPlay').onclick = () => {
    const mine = all.filter((d) => owns(d.id));
    if (mine.length < DECK_SIZE) return;
    for (let i = mine.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mine[i], mine[j]] = [mine[j], mine[i]]; }
    history.length = 0;
    go(null);
    const chosen = deck.length === DECK_SIZE ? deck.map((id) => byId.get(id)!) : mine.slice(0, DECK_SIZE);
    hooks.play(chosen.map((d) => applyProgress(d, gacha.prog?.[d.id])), plateDeck.map((id) => plateById.get(id)!));
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
    $('dmCoins').textContent = wallet(gacha).coins.toLocaleString('es');
    $('dmMat').textContent = wallet(gacha).material.toLocaleString('es');
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
        const pl = rollPlate(gacha, platePullable, Math.random);
        const items = boosterItems(gacha, b.kind, Math.random);
        saveGacha();
        reveal(b.kind, got, pl, items);
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
      btn.onclick = () => {
        const r = openReady(gacha, pullable, Math.random);
        if (r) { const pl = rollPlate(gacha, platePullable, Math.random); const items = boosterItems(gacha, r.kind, Math.random); saveGacha(); reveal(r.kind, r.got, pl, items); }
      };
      w.appendChild(btn);
    }
    $<HTMLButtonElement>('shopBuy').disabled = gacha.gems < SHOP_PRICE;
    $('shopNote').textContent = gacha.gems < SHOP_PRICE ? `Tienes ${gacha.gems} gemas. Ganas gemas en cada duelo.` : `Tienes ${gacha.gems} gemas.`;
  };

  const renderEvolutions = () => {
    const list = $('dmEvo');
    list.innerHTML = '';
    const candidates = all.filter((d) => owns(d.id) && (evolves[d.id] ?? []).some((t) => byId.has(t)));
    if (!candidates.length) { list.innerHTML = '<p class="note">Ninguna de tus figuras tiene evolución.</p>'; return; }
    candidates.sort((a, b) => Number(evolveProgress(gacha, b.id).ready) - Number(evolveProgress(gacha, a.id).ready));
    for (const d of candidates) {
      const p = evolveProgress(gacha, d.id);
      for (const to of (evolves[d.id] ?? []).filter((t) => byId.has(t))) {
        const t = byId.get(to)!;
        const row = document.createElement('div');
        row.className = 'evorow';
        const what = document.createElement('span');
        what.className = 'what';
        what.innerHTML = `<span></span> <span class="arrow">→</span> <span></span><small></small>`;
        const parts = what.querySelectorAll('span');
        parts[0].textContent = d.name;
        parts[2].textContent = t.name;
        what.querySelector('small')!.textContent = p.ready ? 'Lista para evolucionar'
          : `${p.battles}/${EVOLVE_BATTLES} combates · ${p.duels}/${EVOLVE_DUELS} duelos en el mazo`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'yellow';
        btn.textContent = 'Evolucionar';
        btn.disabled = !p.ready;
        btn.onclick = () => {
          if (!evolve(gacha, d.id, to, evolves)) return;
          // The evolved figure takes the place of the one that evolved in the deck, if that copy was the last one.
          const at = deck.indexOf(d.id);
          if (at >= 0 && !owns(d.id)) {
            if (deck.includes(to)) deck.splice(at, 1); else deck[at] = to;
          }
          saveGacha();
          showEvolution(d, t);
        };
        row.append(sprite(d), what, sprite(t), btn);
        list.appendChild(row);
      }
    }
  };

  const showEvolution = (from: FigureDef, to: FigureDef) => {
    renderGacha();
    $('dmOpenTitle').textContent = `¡${from.name} evoluciona en ${to.name}!`;
    $('dmOpenBox').hidden = true;
    const out = $('dmOpenGot');
    out.innerHTML = '';
    const f = figure(to, 'div');
    f.classList.add(rarity.get(to.id) ?? '');
    out.appendChild(f);
    $('dmOpenOk').hidden = false;
    $('dmOpen').classList.add('show');
    $('dmOpenOk').focus();
  };

  // Boosters can also hold one of the plates that work here (PLATE_CHANCE, invented).
  const platePullable = usablePlates.map((p) => ({ id: p.id, rarity: p.rarity }));

  const plateCards = new Map<string, HTMLElement>();
  const renderPlates = () => {
    fitPlateDeck();
    write(PLATE_DECK_KEY, JSON.stringify(plateDeck));
    const left = PLATE_COST_MAX - plateCost();
    for (const id of ['dmPlateCost', 'dmPlateCost2']) $(id).textContent = `Coste restante: ${left}`;
    for (const [el, removable] of [[$('dmDeckPlates'), false], [$('plateSlots'), true]] as const) {
      el.innerHTML = '';
      for (let i = 0; i < PLATE_SLOTS; i++) {
        const p = plateById.get(plateDeck[i]);
        const card = plateCard(p, removable && p ? 'button' : 'div');
        if (removable && p) { card.setAttribute('aria-label', `Quitar ${p.name}`); card.onclick = () => { plateDeck.splice(i, 1); changed(); }; }
        el.appendChild(card);
      }
    }
    const grid = $('plateCards');
    if (!plateCards.size) {
      const sorted = [...plates].sort((a, b) => Number(plateSpec(b).status === 'ok') - Number(plateSpec(a).status === 'ok') || a.cost - b.cost || a.name.localeCompare(b.name));
      for (const p of sorted) {
        const card = plateCard(p, 'button');
        const n = document.createElement('span'); n.className = 'cnt'; card.appendChild(n);
        card.onclick = () => {
          const inDeck = plateDeck.filter((x) => x === p.id).length;
          if (inDeck < ownedPlate(p.id) && plateDeck.length < PLATE_SLOTS && plateCost() + p.cost <= PLATE_COST_MAX && plateSpec(p).status === 'ok') plateDeck.push(p.id);
          else if (inDeck) plateDeck.splice(plateDeck.lastIndexOf(p.id), 1);
          changed();
        };
        plateCards.set(p.id, card);
        grid.appendChild(card);
      }
    }
    for (const [id, card] of plateCards) {
      const have = ownedPlate(id), inDeck = plateDeck.filter((x) => x === id).length;
      card.hidden = !have;
      card.classList.toggle('sel', inDeck > 0);
      card.classList.toggle('off', plateSpec(plateById.get(id)!).status !== 'ok');
      card.querySelector<HTMLElement>('.cnt')!.textContent = `${inDeck ? `${inDeck} en mazo · ` : ''}tienes ${have}`;
    }
  };

  /** Booster opening: the box shakes, then the figures pop out one by one. */
  const reveal = (kind: BoosterKind, got: string[], plateId: string | null = null, items: string[] = []) => {
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
      if (plateId) {
        const card = plateCard(plateById.get(plateId), 'div');
        card.style.animationDelay = `${got.length * 0.35}s`;
        card.classList.add('pop');
        const n = document.createElement('span');
        n.className = 'new';
        n.textContent = ownedPlate(plateId) === 1 ? '¡Plate nueva!' : `Plate repetida (x${ownedPlate(plateId)})`;
        const wrap = document.createElement('div');
        wrap.className = 'platewrap';
        wrap.append(card, n);
        out.appendChild(wrap);
      }
      if (items.length) {
        const chips = document.createElement('div');
        chips.className = 'itemchips';
        items.forEach((t, i) => { const c = document.createElement('span'); c.textContent = t; c.style.animationDelay = `${(got.length + 1 + i) * 0.35}s`; chips.appendChild(c); });
        out.appendChild(chips);
      }
      $('dmOpenOk').hidden = false;
      $('dmOpenOk').focus();
    }, reduce ? 0 : 1500);
  };
  $('dmOpenOk').onclick = () => { $('dmOpen').classList.remove('show'); changed(); };
  $('shopBuy').onclick = () => {
    if (!buyBooster(gacha)) return;
    const r = openReady(gacha, pullable, Math.random);
    const pl = r ? rollPlate(gacha, platePullable, Math.random) : null;
    const items = r ? boosterItems(gacha, r.kind, Math.random) : [];
    saveGacha();
    if (r) reveal(r.kind, r.got, pl, items);
  };
  // Timers on the case tick while the League screen is open.
  setInterval(() => { if (root.classList.contains('show') && screen === 'home' && !$('dmOpen').classList.contains('show')) renderGacha(); }, 15_000);
  $('menuContinue').onclick = () => { history.length = 0; go(null); };
  $('menuDeck').onclick = () => go('pick');
  $('menuPlates').onclick = () => go('plates');
  $('menuFuse').onclick = () => go('fuse');
  $('plateDone').onclick = () => go('deck');
  $('plateClear').onclick = () => { plateDeck = []; changed(); };
  $('tabLeague').onclick = () => go('home');
  $('tabDeck').onclick = () => go('deck');
  $('tabShop').onclick = () => go('shop');
  $('tabWiki').onclick = () => go('wiki');
  $('tabBack').onclick = () => {
    const prev = history.pop();
    if (prev) go(prev, false);
    else if (hooks.canContinue()) go(null);
  };
  $('deckDone').onclick = () => go('deck');
  $('deckClear').onclick = () => { deck = []; changed(); };
  $('deckRandom').onclick = () => {
    const ids = all.filter((d) => owns(d.id)).map((d) => d.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    deck = ids.slice(0, DECK_SIZE);
    changed();
  };

  // ---------- levels, fusion, selling, Material Exchange (src/progress.ts) ----------
  const COLOR_HEX: Record<string, string> = { white: '#f4f4f4', gold: '#f2c200', purple: '#9b4dff', blue: '#3b82f6', red: '#e53935' };
  let fuTarget: string | null = null;
  let fuInput: FusionInput = { figures: {}, items: {} };
  const fuNote = (t: string) => { $('fuNote').textContent = t; };
  const btn = (label: string, on: () => void, disabled = false, aria?: string) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost'; b.textContent = label; b.disabled = disabled; b.onclick = on;
    if (aria) b.setAttribute('aria-label', aria);
    return b;
  };
  const stepper = (label: string, sub: string, value: number, max: number, set: (n: number) => void) => {
    const row = document.createElement('div');
    row.className = 'fu-mat';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = label;
    const sm = document.createElement('small'); sm.textContent = sub; nm.appendChild(sm);
    const v = document.createElement('b'); v.textContent = String(value);
    row.append(nm, btn('−', () => set(value - 1), value <= 0, `Quitar ${label}`), v, btn('+', () => set(value + 1), value >= max, `Añadir ${label}`),
      btn('Todo', () => set(max), value >= max, `Todo ${label}`));
    return row;
  };
  const renderFuse = () => {
    const mine = all.filter((d) => owns(d.id)).sort((a, b) => a.name.localeCompare(b.name));
    if (!fuTarget || !owns(fuTarget)) { fuTarget = mine[0]?.id ?? null; fuInput = { figures: {}, items: {} }; }
    const sel = $<HTMLSelectElement>('fuPick');
    sel.innerHTML = '';
    for (const d of mine) {
      const o = document.createElement('option');
      const p = gacha.prog?.[d.id];
      o.value = d.id; o.textContent = `${d.name} (${RAR_SHORT[rarOf(d.id)]}) · Nv ${levelOf(p, rarOf(d.id))}${p?.clv ? ` · CLv ${p.clv}` : ''}`;
      sel.appendChild(o);
    }
    if (!fuTarget) { fuNote('No tienes figuras.'); return; }
    sel.value = fuTarget;
    const base = byId.get(fuTarget)!, r = rarOf(fuTarget), p = progOf(gacha, fuTarget, base.wheel.length), lv = levelOf(p, r);
    const def = applyProgress(base, p), free = freePoints(p, r);
    $('fuFig').innerHTML = '';
    $('fuFig').appendChild(figure(def, 'div'));
    drawWheel($<HTMLCanvasElement>('fuWheel'), def, null, 0, true);
    $('fuLevel').textContent = `Nv ${lv} · CLv ${p.clv}`;
    const nextExp = lv < MAX_LEVEL ? LEVEL_EXP[r][lv] : 0, prevExp = LEVEL_EXP[r][Math.min(lv, MAX_LEVEL) - 1];
    $('fuStats').innerHTML = '';
    const line = (t: string, small = false) => { const el = document.createElement(small ? 'small' : 'div'); el.textContent = t; $('fuStats').appendChild(el); };
    line(lv < MAX_LEVEL ? `EXP ${p.exp.toLocaleString('es')} / ${nextExp.toLocaleString('es')} para el nivel ${lv + 1}` : lv < MAX_LEVEL_CARMONITE ? 'Nivel 5: sigue con Carmonite' : 'Nivel máximo');
    line(p.clv >= MAX_CHAIN ? `Chain Level ${p.clv} (máximo)` : `Chain ${p.chain} / ${CHAIN_COPIES[r]} para el Chain Level ${p.clv + 1} (copias de ${base.name} o Cubos [${RAR_SHORT[r]}])`, true);
    line(`Puntos por colocar: ${free.level} de nivel (+1 a una casilla) · ${free.carmonite} de Carmonite (+1 a una, −1 a otra mayor de 4) · ${free.chain} de Chain (+1 de daño)`, true);
    $<HTMLElement>('fuExpBar').style.width = `${lv >= MAX_LEVEL ? 100 : Math.round(100 * (p.exp - prevExp) / Math.max(1, nextExp - prevExp))}%`;
    // Carmonite: which piece gives up the point.
    const shrink = $<HTMLSelectElement>('fuShrink');
    const keep = shrink.value;
    shrink.innerHTML = '';
    def.wheel.forEach((s, i) => { if (s.weight > 4) { const o = document.createElement('option'); o.value = String(i); o.textContent = `${s.move.name} (${s.weight})`; shrink.appendChild(o); } });
    if ([...shrink.options].some((o) => o.value === keep)) shrink.value = keep;
    $('fuShrinkWrap').hidden = free.carmonite <= 0;
    const carmCost = CARMONITE_PER_LEVEL[r];
    $('fuCarm').textContent = lv < MAX_LEVEL ? `Carmonite: a partir del nivel 5 (tienes ${wallet(gacha).carmonite})`
      : lv >= MAX_LEVEL_CARMONITE ? 'Nivel 10 alcanzado' : `Subir al nivel ${lv + 1} con ${carmCost} Carmonite (tienes ${wallet(gacha).carmonite})`;
    $<HTMLButtonElement>('fuCarm').disabled = lv < MAX_LEVEL || lv >= MAX_LEVEL_CARMONITE || wallet(gacha).carmonite < carmCost;
    const pieces = $('fuPieces');
    pieces.innerHTML = '';
    def.wheel.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'fu-piece';
      const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = COLOR_HEX[s.move.color] ?? '#888';
      const nm = document.createElement('span'); nm.className = 'nm';
      const dmg = s.move.damage ? ` ${s.move.damage}` : s.move.stars ? ` ${'★'.repeat(s.move.stars)}` : '';
      nm.textContent = `${s.move.name}${dmg}`;
      const sm = document.createElement('small');
      sm.textContent = `tamaño ${s.weight}${p.size[i] ? ` (${p.size[i] > 0 ? '+' : ''}${p.size[i]})` : ''}${p.dmg[i] ? ` · daño +${p.dmg[i]}` : ''}`;
      nm.appendChild(sm);
      const useCarm = free.level <= 0 && free.carmonite > 0;
      const act = (kind: 'grow' | 'dmg' | 'undo') => () => {
        const from = kind === 'grow' && useCarm ? Number(shrink.value) : undefined;
        if (!placePoint(base, p, r, i, kind, from)) { fuNote('Eso no se puede.'); return; }
        fuNote(''); saveGacha(); changed();
      };
      const canGrow = s.move.color !== 'red' && (free.level > 0 || (free.carmonite > 0 && shrink.value !== '' && Number(shrink.value) !== i));
      const damaging = (s.move.color === 'white' || s.move.color === 'gold') && s.move.damage > 0;
      row.append(sw, nm);
      if (s.move.color !== 'red') row.appendChild(btn('+ tamaño', act('grow'), !canGrow, `Agrandar ${s.move.name}`));
      if (damaging) row.appendChild(btn('+ daño', act('dmg'), free.chain <= 0, `Más daño a ${s.move.name}`));
      row.appendChild(btn('Deshacer', act('undo'), !p.size[i] && !p.dmg[i], `Deshacer cambios en ${s.move.name}`));
      pieces.appendChild(row);
    });
    // Materials.
    const mats = $('fuMats');
    mats.innerHTML = '';
    const items = wallet(gacha).items;
    for (const k of ['metal', 'cube', 'ingot'] as ItemKind[]) for (const rr of RARS) {
      const have = items[k][rr];
      if (!have) continue;
      const v = fuInput.items[k]?.[rr] ?? 0;
      const what = k === 'metal' ? `${METAL_EXP[rr].toLocaleString('es')} EXP` : k === 'cube' ? (rr === r ? '1 punto de Chain' : 'solo para figuras ' + RAR_SHORT[rr]) : '1 EXP (mejor véndelo)';
      mats.appendChild(stepper(`${ITEM_ES[k]} [${RAR_SHORT[rr]}]`, `tienes ${have} · ${what}`, v, k === 'cube' && rr !== r ? 0 : have,
        (n) => { (fuInput.items[k] ??= {})[rr] = Math.max(0, n); changed(); }));
    }
    for (const d of mine) {
      const have = gacha.owned[d.id] - (d.id === fuTarget ? 1 : 0) - (d.id !== fuTarget && deck.includes(d.id) ? 1 : 0);
      if (have <= 0) continue;
      const v = fuInput.figures[d.id] ?? 0;
      const sub = d.id === fuTarget ? `copia · +1 Chain` : `${RAR_SHORT[rarOf(d.id)]} · Nv ${levelOf(gacha.prog?.[d.id], rarOf(d.id))}`;
      mats.appendChild(stepper(d.name, `${sub} · puedes usar ${have}`, v, have, (n) => { fuInput.figures[d.id] = Math.max(0, n); changed(); }));
    }
    if (!mats.childElementCount) mats.innerHTML = '<p class="note">Nada que fusionar: consigue copias, Rare Metals o Cubos en los boosters. Las figuras de tu mazo guardan siempre una copia.</p>';
    const pv = fusionPreview(fuTarget, r, fuInput, rarOf, gacha.prog ?? {});
    $('fuCost').textContent = `${pv.coins.toLocaleString('es')} monedas`;
    $('fuCost').classList.toggle('short', pv.coins > wallet(gacha).coins);
    $<HTMLButtonElement>('fuGo').disabled = !(pv.exp || pv.chain) || pv.coins > wallet(gacha).coins;
    $<HTMLButtonElement>('fuGo').textContent = pv.exp || pv.chain ? `Fusionar (+${pv.exp.toLocaleString('es')} EXP${pv.chain ? `, +${pv.chain} Chain` : ''})` : 'Fusionar';
  };
  $<HTMLSelectElement>('fuPick').onchange = (e) => { fuTarget = (e.target as HTMLSelectElement).value; fuInput = { figures: {}, items: {} }; fuNote(''); changed(); };
  $<HTMLSelectElement>('fuShrink').onchange = () => changed();
  $('fuReset').onclick = () => { fuInput = { figures: {}, items: {} }; fuNote(''); changed(); };
  $('fuGo').onclick = () => {
    if (!fuTarget) return;
    const d = byId.get(fuTarget)!, before = levelOf(gacha.prog?.[fuTarget], rarOf(fuTarget)), cb = gacha.prog?.[fuTarget]?.clv ?? 0;
    const err = fuse(gacha, d, rarOf(fuTarget), fuInput, rarOf);
    if (err) { fuNote(err); return; }
    deck = deck.filter((id) => owns(id));
    fuInput = { figures: {}, items: {} };
    saveGacha();
    const p = gacha.prog![fuTarget], lv = levelOf(p, rarOf(fuTarget));
    fuNote(`¡Fusión hecha!${lv > before ? ` ${d.name} sube al nivel ${lv}.` : ''}${p.clv > cb ? ` Chain Level ${p.clv}.` : ''}`);
    changed();
  };
  $('fuCarm').onclick = () => {
    if (!fuTarget) return;
    const err = useCarmonite(gacha, byId.get(fuTarget)!, rarOf(fuTarget));
    fuNote(err ?? '¡Sube de nivel con Carmonite! Coloca el punto: agranda una casilla y elige de cuál sale.');
    saveGacha(); changed();
  };

  const renderShop = () => {
    const w = wallet(gacha);
    $('shMat').textContent = `${w.material.toLocaleString('es')} Material`;
    $('shCoins').textContent = `${w.coins.toLocaleString('es')} monedas`;
    const ex = $<HTMLSelectElement>('shExFig');
    if (!ex.options.length) {
      for (const d of [...pool].sort((a, b) => (RARITY_ORDER[rarity.get(a.id) ?? ''] ?? 9) - (RARITY_ORDER[rarity.get(b.id) ?? ''] ?? 9) || a.name.localeCompare(b.name))) {
        const o = document.createElement('option');
        o.value = d.id; o.textContent = `${d.name} (${RAR_SHORT[rarOf(d.id)]}) · ${EXCHANGE_PRICE[rarOf(d.id)].toLocaleString('es')} Material`;
        ex.appendChild(o);
      }
    }
    $<HTMLButtonElement>('shExBuy').disabled = w.material < EXCHANGE_PRICE[rarOf(ex.value)];
    $<HTMLButtonElement>('shCarm').disabled = w.material < CARMONITE_MATERIAL;
    const sell = $('shSell');
    sell.innerHTML = '';
    const row = (label: string, sub: string, price: number, on: () => void) => {
      const r = document.createElement('div'); r.className = 'fu-mat';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = label;
      const sm = document.createElement('small'); sm.textContent = sub; nm.appendChild(sm);
      r.append(nm, btn(`Vender (${price.toLocaleString('es')})`, () => { on(); saveGacha(); changed(); }, false, `Vender ${label}`));
      sell.appendChild(r);
    };
    for (const rr of RARS) if (w.items.ingot[rr]) row(`Lingote [${RAR_SHORT[rr]}]`, `tienes ${w.items.ingot[rr]}`, INGOT_COINS[rr], () => sellIngot(gacha, rr));
    for (const d of all.filter((x) => (gacha.owned[x.id] ?? 0) > 1).sort((a, b) => a.name.localeCompare(b.name)))
      row(d.name, `${RAR_SHORT[rarOf(d.id)]} · tienes ${gacha.owned[d.id]} (se queda una)`, SELL_LV1[rarOf(d.id)], () => sellFigure(gacha, d.id, rarOf(d.id)));
    for (const [id, n] of Object.entries(gacha.plates ?? {})) {
      const pl = plateById.get(id), inDeck = plateDeck.filter((x) => x === id).length;
      if (!pl || n - inDeck <= 0) continue;
      const price = PLATE_COINS[asRar(pl.rarity)];
      row(`Plate ${pl.name}`, `tienes ${n}${inDeck ? `, ${inDeck} en el mazo` : ''}`, price, () => { gacha.plates![id]--; if (!gacha.plates![id]) delete gacha.plates![id]; wallet(gacha).coins += price; });
    }
    if (!sell.childElementCount) sell.innerHTML = '<p class="note">Nada que vender: los lingotes y las figuras o plates repetidas aparecen aquí.</p>';
  };
  $<HTMLSelectElement>('shExFig').onchange = () => renderShop();
  $('shExBuy').onclick = () => {
    const id = $<HTMLSelectElement>('shExFig').value, w = wallet(gacha), price = EXCHANGE_PRICE[rarOf(id)];
    if (w.material < price) return;
    w.material -= price;
    gacha.owned[id] = (gacha.owned[id] ?? 0) + 1;
    saveGacha();
    $('shExNote').textContent = `¡${byId.get(id)?.name} es tuya!`;
    changed();
  };
  $('shCarm').onclick = () => {
    const w = wallet(gacha);
    if (w.material < CARMONITE_MATERIAL) return;
    w.material -= CARMONITE_MATERIAL; w.carmonite++;
    saveGacha();
    $('shExNote').textContent = `Tienes ${w.carmonite} Carmonite.`;
    changed();
  };

  return {
    open: () => { history.length = 0; armed = -1; go('home', false); },
    battleFought: (id) => {
      gacha = loadState(read(GACHA_KEY));
      recordBattle(gacha, id);
      saveGacha();
    },
    duelEnded: (won, deckIds) => {
      gacha = loadState(read(GACHA_KEY)); // another tab may have changed it
      recordDuel(gacha, deckIds);
      const b = rewardDuel(gacha, won, Date.now(), Math.random);
      const before = new Map(deckIds.map((id) => [id, levelOf(gacha.prog?.[id], rarOf(id))]));
      const e = duelExp(gacha, deckIds.map((id) => byId.get(id)).filter((d): d is FigureDef => !!d), won, rarOf);
      const ups = deckIds.filter((id, i) => deckIds.indexOf(id) === i && levelOf(gacha.prog?.[id], rarOf(id)) > before.get(id)!);
      saveGacha();
      const g = won ? GEMS_WIN : GEMS_LOSS;
      const lvl = ups.length ? ` · ¡Sube de nivel: ${ups.map((id) => byId.get(id)?.name ?? id).join(', ')}!` : '';
      return (b ? `+${g} gemas · ${boxLabel(b.kind)} (${BOOSTERS[b.kind].hours} h) en la vitrina`
        : `+${g} gemas · la vitrina está llena: abre algún booster`) + ` · +${e} EXP a tu mazo${lvl}`;
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
