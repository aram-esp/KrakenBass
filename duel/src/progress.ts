/**
 * Figure progression of the original: levels, Chain Level, fusion, coins, enhancements and Material.
 *
 * Sourced (2026-10-30, files under research/raw):
 * - Serebii "Mechanics": levels 1-5, each level gives a point to resize one wheel piece (96 -> 100 at level 5); experience
 *   even when you lose; fusion spends coins, the side figures are lost and the main figure gets all their experience;
 *   Chain Level (fusing the same figure): EX 1, R 3, UC 9, C 30 copies per level, also with Cubes; each Chain Level
 *   adds 1 damage to a move (40 -> 41).
 * - Bulbapedia "Enhancement (Duel)": Rare Metal exp C 500, UC 1,000, R 4,500, EX 10,500; Cubes give Chain Points to
 *   figures of the same rarity; Ingots sell for C 1,800, UC 3,500, R 15,000, EX 35,000 coins (before 7.0.14) and give
 *   1 exp in fusion; Rare Metals and Cubes sell for 1 coin; Carmonite (level 5 -> 10): each level grows one piece by 1 and
 *   shrinks another piece bigger than 4 by 1; C 10, UC 20, R 50, EX 100 Carmonite per level; sells for 50 coins.
 * - Bulbapedia "Shop (Duel)": figure sale prices (before 7.0.14) at level 1 C 232, UC 417, R 1,670, EX 3,712, level 5
 *   ten times that, level 10 C 10,575 and R 76,127; plates 93 / 167 / 670 / 1,488.
 * - Bulbapedia "Time Booster": White = figure + Ingot; Blue, Purple, Gold, Rainbow also Cube or Rare Metal.
 * - Fandom "Items"/"Figures": coins come from selling and quests; Material comes from buying boosters and is spent in the
 *   Material Exchange (Dialga, EX, 4,000 Material).
 * Everything marked INVENTED is not in those sources.
 */
import type { FigureDef, Segment } from './types.ts';

export type Rar = 'Common' | 'Uncommon' | 'Rare' | 'EX';
export const RARS: Rar[] = ['Common', 'Uncommon', 'Rare', 'EX'];

export const METAL_EXP: Record<Rar, number> = { Common: 500, Uncommon: 1000, Rare: 4500, EX: 10500 };
export const INGOT_COINS: Record<Rar, number> = { Common: 1800, Uncommon: 3500, Rare: 15000, EX: 35000 };
export const CHAIN_COPIES: Record<Rar, number> = { Common: 30, Uncommon: 9, Rare: 3, EX: 1 };
export const CARMONITE_PER_LEVEL: Record<Rar, number> = { Common: 10, Uncommon: 20, Rare: 50, EX: 100 };
export const SELL_LV1: Record<Rar, number> = { Common: 232, Uncommon: 417, Rare: 1670, EX: 3712 };
/** Level-10 sale price: C and R sourced; UC and EX INVENTED with C's ratio (10,575 / 2,320). */
export const SELL_LV10: Record<Rar, number> = { Common: 10575, Uncommon: Math.round(4176 * 10575 / 2320), Rare: 76127, EX: Math.round(37120 * 10575 / 2320) };
/** Plate sale prices; that the four values go C, UC, R, EX is ASSUMED from the table order. */
export const PLATE_COINS: Record<Rar, number> = { Common: 93, Uncommon: 167, Rare: 670, EX: 1488 };
export const CARMONITE_COINS = 50;
export const MAX_LEVEL = 5;
export const MAX_LEVEL_CARMONITE = 10;

/** INVENTED: total experience to reach level 2..5 (no source gives the curve): 4 Rare Metals of the figure's rarity to level 5. */
export const LEVEL_EXP: Record<Rar, number[]> = Object.fromEntries(RARS.map((r) => [r, [0, 1, 2, 3, 4].map((k) => k * METAL_EXP[r])])) as Record<Rar, number[]>;
/** INVENTED: experience a figure gives as fusion material on top of its own experience. */
export const FIGURE_BASE_EXP: Record<Rar, number> = { Common: 100, Uncommon: 200, Rare: 900, EX: 2100 };
/** INVENTED: experience each figure of your deck gets after a duel (Serebii: you also get some when you lose). */
export const DUEL_EXP = { win: 300, loss: 100 };
/** INVENTED: coins a fusion costs per point of experience or chain gained. */
export const FUSION_COINS_PER_EXP = 0.5;
export const FUSION_COINS_PER_CHAIN = 100;
/** INVENTED: highest Chain Level (no source gives one). */
export const MAX_CHAIN = 10;
/** INVENTED: Material a shop booster gives (Fandom: Material comes from buying boosters; amount unknown). */
export const SHOP_MATERIAL = 100;
/** Material Exchange prices: EX 4,000 from Fandom's Dialga; the rest INVENTED. */
export const EXCHANGE_PRICE: Record<Rar, number> = { Common: 300, Uncommon: 700, Rare: 1800, EX: 4000 };
/** INVENTED: Carmonite in the Material Exchange (the sources only say how much it sells for). */
export const CARMONITE_MATERIAL = 20;

export interface FigProgress {
  exp: number;
  /** Chain points toward the next Chain Level, and the Chain Level reached. */
  chain: number;
  clv: number;
  /** Levels above 5 bought with Carmonite. */
  carm: number;
  /** Per wheel piece: size change and damage change chosen by the player. */
  size: number[];
  dmg: number[];
}

export type ItemKind = 'metal' | 'cube' | 'ingot';
export interface Wallet {
  coins: number;
  material: number;
  carmonite: number;
  items: Record<ItemKind, Record<Rar, number>>;
}

export const emptyItems = (): Record<ItemKind, Record<Rar, number>> => ({
  metal: { Common: 0, Uncommon: 0, Rare: 0, EX: 0 },
  cube: { Common: 0, Uncommon: 0, Rare: 0, EX: 0 },
  ingot: { Common: 0, Uncommon: 0, Rare: 0, EX: 0 },
});
export const newWallet = (): Wallet => ({ coins: 0, material: 0, carmonite: 0, items: emptyItems() });
export const newProgress = (n: number): FigProgress => ({ exp: 0, chain: 0, clv: 0, carm: 0, size: Array(n).fill(0), dmg: Array(n).fill(0) });

export const asRar = (r: string | undefined): Rar => (RARS as string[]).includes(r ?? '') ? r as Rar : 'Common';

/** Level from experience (1..5) plus Carmonite levels. */
export function levelOf(p: FigProgress | undefined, r: Rar): number {
  if (!p) return 1;
  const t = LEVEL_EXP[r];
  let lv = 1;
  while (lv < MAX_LEVEL && p.exp >= t[lv]) lv++;
  return lv + (lv === MAX_LEVEL ? p.carm : 0);
}

/** Experience still needed for the next level (0 at level 5 and above). */
export function expToNext(p: FigProgress | undefined, r: Rar): number {
  const lv = levelOf(p, r);
  return lv >= MAX_LEVEL ? 0 : LEVEL_EXP[r][lv] - (p?.exp ?? 0);
}

const isMiss = (s: Segment) => s.move.color === 'red';
const damaging = (s: Segment) => (s.move.color === 'white' || s.move.color === 'gold') && s.move.damage > 0;

/** Points the player can still place: level points (+1 a piece), Carmonite swaps, Chain damage points. */
export function freePoints(p: FigProgress | undefined, r: Rar) {
  const lv = levelOf(p, r);
  const grown = (p?.size ?? []).reduce((s, v) => s + Math.max(0, v), 0);
  const shrunk = (p?.size ?? []).reduce((s, v) => s + Math.max(0, -v), 0);
  const dmg = (p?.dmg ?? []).reduce((s, v) => s + v, 0);
  // Every shrink pairs with a grow (Carmonite); the rest of the grows use level points.
  return { level: Math.min(lv, MAX_LEVEL) - 1 - (grown - shrunk), carmonite: (p?.carm ?? 0) - shrunk, chain: (p?.clv ?? 0) - dmg };
}

/**
 * Change the wheel: `kind` 'grow' (+1 size, a level point; or with `from`, a Carmonite swap that shrinks `from` by 1),
 * 'dmg' (+1 damage, a Chain point) or 'undo' (take back the last change on that piece). False if not allowed.
 * ASSUMED: level points go on any piece but Miss; points can be moved again later (no source on either).
 */
export function placePoint(def: FigureDef, p: FigProgress, r: Rar, i: number, kind: 'grow' | 'dmg' | 'undo', from?: number): boolean {
  const s = def.wheel[i];
  if (!s) return false;
  const f = freePoints(p, r);
  if (kind === 'grow') {
    if (isMiss(s)) return false;
    if (from === undefined) { if (f.level <= 0) return false; p.size[i]++; return true; }
    const o = def.wheel[from];
    if (!o || from === i || f.carmonite <= 0 || o.weight + p.size[from] <= 4) return false;
    p.size[i]++; p.size[from]--; return true;
  }
  if (kind === 'dmg') {
    if (!damaging(s) || f.chain <= 0) return false;
    p.dmg[i]++; return true;
  }
  if (p.dmg[i] > 0) { p.dmg[i]--; return true; }
  const shrunk = () => p.size.reduce((t, v) => t + Math.max(0, -v), 0);
  if (p.size[i] > 0) {
    p.size[i]--;
    // Carmonite swaps are undone first: the shrink comes back too.
    if (shrunk() > 0) { const j = p.size.findIndex((v) => v < 0); p.size[j]++; }
    return true;
  }
  if (p.size[i] < 0) {
    p.size[i]++;
    // Undoing a shrink undoes its paired grow when the level points are all used.
    if (freePoints(p, r).level < 0) { const j = p.size.findIndex((v, k) => v > 0 && k !== i); if (j >= 0) p.size[j]--; }
    return true;
  }
  return false;
}

/** The figure with the player's levels and Chain Level applied. */
export function applyProgress(def: FigureDef, p: FigProgress | undefined): FigureDef {
  if (!p) return def;
  return {
    ...def,
    wheel: def.wheel.map((s, i) => ({
      weight: Math.max(0, s.weight + (p.size[i] ?? 0)),
      move: p.dmg[i] ? { ...s.move, damage: s.move.damage + p.dmg[i] } : s.move,
    })),
  };
}

/** Experience a figure gives when used as fusion material (INVENTED base plus its own experience, per Serebii). */
export const materialExp = (r: Rar, p: FigProgress | undefined) => FIGURE_BASE_EXP[r] + (p?.exp ?? 0);

export interface FusionInput {
  /** Copies of other figures used up: id -> count. */
  figures: Record<string, number>;
  items: Partial<Record<ItemKind, Partial<Record<Rar, number>>>>;
}

/** What a fusion would give and cost. Copies of the same figure and Cubes of its rarity give Chain points. */
export function fusionPreview(target: string, r: Rar, input: FusionInput, rarityOf: (id: string) => Rar,
  prog: Record<string, FigProgress>) {
  let exp = 0, chain = 0;
  for (const [id, n] of Object.entries(input.figures)) {
    if (!n) continue;
    exp += n * materialExp(rarityOf(id), id === target ? undefined : prog[id]);
    if (id === target) chain += n;
  }
  for (const rr of RARS) {
    exp += (input.items.metal?.[rr] ?? 0) * METAL_EXP[rr];
    exp += input.items.ingot?.[rr] ?? 0;
    if (rr === r) chain += input.items.cube?.[rr] ?? 0; // Cubes only work on figures of their rarity
  }
  const coins = Math.ceil(exp * FUSION_COINS_PER_EXP + chain * FUSION_COINS_PER_CHAIN);
  return { exp, chain, coins };
}

export interface ProgressState {
  owned: Record<string, number>;
  prog?: Record<string, FigProgress>;
  wallet?: Wallet;
}

export const wallet = (s: ProgressState): Wallet => (s.wallet ??= newWallet());
export const progOf = (s: ProgressState, id: string, n: number): FigProgress => {
  s.prog ??= {};
  const p = (s.prog[id] ??= newProgress(n));
  while (p.size.length < n) { p.size.push(0); p.dmg.push(0); }
  return p;
};

/**
 * Fuse: spend coins and materials, give experience (capped at level 5's total) and Chain points to `target`.
 * Copies of the target used up must leave at least one. Returns an error text or null.
 * ASSUMED: all copies of a figure share one level (the original kept a level per copy).
 */
export function fuse(s: ProgressState, target: FigureDef, r: Rar, input: FusionInput, rarityOf: (id: string) => Rar): string | null {
  const w = wallet(s);
  for (const [id, n] of Object.entries(input.figures)) {
    const have = s.owned[id] ?? 0;
    if (n < 0 || n > have - (id === target.id ? 1 : 0)) return 'No tienes tantas copias.';
  }
  for (const k of ['metal', 'cube', 'ingot'] as ItemKind[]) for (const rr of RARS) if ((input.items[k]?.[rr] ?? 0) > w.items[k][rr]) return 'No tienes tantos objetos.';
  const pv = fusionPreview(target.id, r, input, rarityOf, s.prog ?? {});
  if (!pv.exp && !pv.chain) return 'Elige algo para fusionar.';
  if (pv.coins > w.coins) return `Faltan monedas (${pv.coins}).`;
  const p = progOf(s, target.id, target.wheel.length);
  if (pv.chain && p.clv >= MAX_CHAIN) return 'Chain Level al máximo.';
  w.coins -= pv.coins;
  for (const [id, n] of Object.entries(input.figures)) {
    if (!n) continue;
    s.owned[id] -= n;
    if (s.owned[id] <= 0) { delete s.owned[id]; if (id !== target.id && s.prog) delete s.prog[id]; }
  }
  for (const k of ['metal', 'cube', 'ingot'] as ItemKind[]) for (const rr of RARS) w.items[k][rr] -= input.items[k]?.[rr] ?? 0;
  p.exp = Math.min(LEVEL_EXP[r][MAX_LEVEL - 1], p.exp + pv.exp);
  p.chain += pv.chain;
  while (p.chain >= CHAIN_COPIES[r] && p.clv < MAX_CHAIN) { p.chain -= CHAIN_COPIES[r]; p.clv++; }
  if (p.clv >= MAX_CHAIN) p.chain = 0;
  return null;
}

/** Level up past 5 with Carmonite. */
export function useCarmonite(s: ProgressState, def: FigureDef, r: Rar): string | null {
  const w = wallet(s), p = progOf(s, def.id, def.wheel.length);
  if (levelOf(p, r) < MAX_LEVEL) return 'Tiene que estar a nivel 5.';
  if (levelOf(p, r) >= MAX_LEVEL_CARMONITE) return 'Ya está a nivel 10.';
  if (w.carmonite < CARMONITE_PER_LEVEL[r]) return `Necesitas ${CARMONITE_PER_LEVEL[r]} Carmonite.`;
  w.carmonite -= CARMONITE_PER_LEVEL[r];
  p.carm++;
  return null;
}

/** Sale price of a figure copy: sourced at levels 1, 5 and 10; linear between them by experience (INVENTED). */
export function figurePrice(r: Rar, p: FigProgress | undefined): number {
  const lv = levelOf(p, r);
  if (lv >= MAX_LEVEL) return Math.round(SELL_LV1[r] * 10 + (SELL_LV10[r] - SELL_LV1[r] * 10) * (lv - MAX_LEVEL) / 5);
  const k = (p?.exp ?? 0) / LEVEL_EXP[r][MAX_LEVEL - 1];
  return Math.round(SELL_LV1[r] + (SELL_LV1[r] * 9) * k);
}

/** Sell one copy of a figure (never the last one: decks need it; a UI choice). */
export function sellFigure(s: ProgressState, id: string, r: Rar): number {
  if ((s.owned[id] ?? 0) < 2) return 0;
  // Extra copies are sold at level 1 (ASSUMED: the shared level stays with the copy you keep).
  const c = SELL_LV1[r];
  s.owned[id]--;
  wallet(s).coins += c;
  return c;
}

export function sellIngot(s: ProgressState, r: Rar): number {
  const w = wallet(s);
  if (!w.items.ingot[r]) return 0;
  w.items.ingot[r]--;
  w.coins += INGOT_COINS[r];
  return INGOT_COINS[r];
}

/** Experience for each figure of the deck after a duel (capped at level 5's total). */
export function duelExp(s: ProgressState, deck: FigureDef[], won: boolean, rarityOf: (id: string) => Rar): number {
  const e = won ? DUEL_EXP.win : DUEL_EXP.loss;
  for (const d of new Set(deck)) {
    const p = progOf(s, d.id, d.wheel.length), r = rarityOf(d.id);
    p.exp = Math.min(LEVEL_EXP[r][MAX_LEVEL - 1], p.exp + e);
  }
  return e;
}

/** INVENTED: rarity of a booster's enhancement (same weights as figures). */
const ITEM_WEIGHT: Record<Rar, number> = { Common: 60, Uncommon: 28, Rare: 10, EX: 2 };
const rollRar = (rng: () => number): Rar => {
  let x = rng() * 100;
  for (const r of RARS) { x -= ITEM_WEIGHT[r]; if (x < 0) return r; }
  return 'Common';
};

/**
 * Enhancements in a booster (Bulbapedia "Time Booster"): an Ingot in every timed booster, and a Cube or Rare Metal
 * from Blue up. Shop boosters (INVENTED: same as Blue) also give Material (Fandom). Welcome boosters give nothing.
 */
export function boosterItems(s: ProgressState, kind: string, rng: () => number): string[] {
  if (kind === 'welcome') return [];
  const w = wallet(s), out: string[] = [];
  const add = (k: ItemKind, r: Rar) => { w.items[k][r]++; out.push(`${ITEM_ES[k]} [${RAR_SHORT[r]}]`); };
  add('ingot', rollRar(rng));
  if (kind !== 'white') add(rng() < 0.5 ? 'cube' : 'metal', rollRar(rng));
  if (kind === 'shop') { w.material += SHOP_MATERIAL; out.push(`Material ×${SHOP_MATERIAL}`); }
  return out;
}

export const ITEM_ES: Record<ItemKind, string> = { metal: 'Rare Metal', cube: 'Cubo', ingot: 'Lingote' };
export const RAR_SHORT: Record<Rar, string> = { Common: 'C', Uncommon: 'UC', Rare: 'R', EX: 'EX' };
