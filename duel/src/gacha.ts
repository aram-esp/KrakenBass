/**
 * Figure collection and boosters, after the original game's timed boosters.
 *
 * From the Fandom archive wiki ("Booster", 2017): booster types, unlock times and guaranteed figures.
 * From Nintendo Life's review: boosters cost 50 gems in the shop. From Serebii ("League"): stored boosters can be
 * unlocked early with gems; the booster case is on the home screen.
 * Everything marked INVENTED is not in those sources and was chosen for this game (2026-10-30).
 */

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'EX';
export type BoosterKind = 'white' | 'blue' | 'purple' | 'gold' | 'rainbow' | 'shop' | 'welcome';

/** A figure slot: the lowest rarity it can be. */
type Slot = Rarity;

export const BOOSTERS: Record<BoosterKind, { name: string; hours: number; slots: Slot[] }> = {
  // Fandom: White 1 h, 1 figure; Blue 3 h, 1 figure (UC or better); Purple 6 h, 1 figure (UC or better);
  // Gold 12 h, 1 figure (R or better) + 1 figure; Rainbow 24 h, 1 figure (EX or better) + 2 figures.
  // Ingots, metals and cubes are left out: there is no fusion here.
  white: { name: 'Blanco', hours: 1, slots: ['Common'] },
  blue: { name: 'Azul', hours: 3, slots: ['Uncommon'] },
  purple: { name: 'Morado', hours: 6, slots: ['Uncommon'] },
  gold: { name: 'Dorado', hours: 12, slots: ['Rare', 'Common'] },
  rainbow: { name: 'Arcoíris', hours: 24, slots: ['EX', 'Common', 'Common'] },
  // INVENTED: what the 50-gem shop booster holds (the review gives only the price): 2 figures, one UC or better.
  shop: { name: 'Tienda', hours: 0, slots: ['Uncommon', 'Common'] },
  // INVENTED: starter boosters, so a new player has at least 6 figures.
  welcome: { name: 'Bienvenida', hours: 0, slots: ['Uncommon', 'Common'] },
};

/** INVENTED: chance of each rarity in a slot that allows it (no source gives drop rates). */
export const RARITY_WEIGHT: Record<Rarity, number> = { Common: 60, Uncommon: 28, Rare: 10, EX: 2 };
/** INVENTED: which timed booster a duel gives ("completely random" per Fandom, weights not given). */
export const TIMED_WEIGHT: Record<'white' | 'blue' | 'purple' | 'gold' | 'rainbow', number> = { white: 40, blue: 25, purple: 20, gold: 10, rainbow: 5 };
export const SHOP_PRICE = 50; // Nintendo Life: 50 gems a booster
export const CASE_SLOTS = 4; // INVENTED
export const WELCOME_BOOSTERS = 4; // INVENTED: 4 x 2 figures = 8 figures to start
export const GEMS_WIN = 20; // INVENTED
export const GEMS_LOSS = 5; // INVENTED
/** INVENTED: gems to open a timed booster now: 1 per started 10 minutes left. */
export const gemsToOpenNow = (msLeft: number) => Math.max(0, Math.ceil(msLeft / 600_000));

const ORDER: Rarity[] = ['Common', 'Uncommon', 'Rare', 'EX'];

export interface Booster { kind: BoosterKind; readyAt: number }

export interface GachaState {
  version: 1;
  /** Figure id -> copies owned. */
  owned: Record<string, number>;
  gems: number;
  /** Boosters waiting in the case (at most CASE_SLOTS). */
  case: Booster[];
  /** Unopened boosters that open at once (welcome, shop). */
  ready: Booster[];
}

export interface Pullable { id: string; rarity: string }

export function newState(): GachaState {
  return {
    version: 1,
    owned: {},
    gems: 0,
    case: [],
    ready: Array.from({ length: WELCOME_BOOSTERS }, () => ({ kind: 'welcome' as const, readyAt: 0 })),
  };
}

const pickWeighted = <K extends string>(w: Record<K, number>, rng: () => number): K => {
  const keys = Object.keys(w) as K[];
  let r = rng() * keys.reduce((s, k) => s + w[k], 0);
  for (const k of keys) { r -= w[k]; if (r < 0) return k; }
  return keys[keys.length - 1];
};

/** A rarity at least `min`, with RARITY_WEIGHT among the allowed ones and among those the pool has. */
export function rollRarity(min: Rarity, have: Set<string>, rng: () => number): Rarity {
  const allowed = ORDER.slice(ORDER.indexOf(min)).filter((r) => have.has(r));
  const pool = allowed.length ? allowed : ORDER.filter((r) => have.has(r));
  const w = Object.fromEntries(pool.map((r) => [r, RARITY_WEIGHT[r]])) as Record<Rarity, number>;
  return pickWeighted(w, rng);
}

/** Open a booster: the figure ids pulled (added to `owned`). */
export function openBooster(state: GachaState, kind: BoosterKind, pool: Pullable[], rng: () => number): string[] {
  const byRarity = new Map<string, Pullable[]>();
  for (const p of pool) byRarity.set(p.rarity, [...(byRarity.get(p.rarity) ?? []), p]);
  const have = new Set(byRarity.keys());
  const got: string[] = [];
  for (const slot of BOOSTERS[kind].slots) {
    const list = byRarity.get(rollRarity(slot, have, rng))!;
    let f = list[Math.floor(rng() * list.length)];
    // Welcome boosters avoid repeats so a new player has enough different figures for a deck.
    for (let tries = 0; kind === 'welcome' && state.owned[f.id] && tries < 30; tries++) f = list[Math.floor(rng() * list.length)];
    state.owned[f.id] = (state.owned[f.id] ?? 0) + 1;
    got.push(f.id);
  }
  return got;
}

/** End of a duel: gems, and a random timed booster in the case if there is room. Returns the booster or null. */
export function rewardDuel(state: GachaState, won: boolean, now: number, rng: () => number): Booster | null {
  state.gems += won ? GEMS_WIN : GEMS_LOSS;
  if (state.case.length >= CASE_SLOTS) return null;
  const kind = pickWeighted(TIMED_WEIGHT, rng);
  const b = { kind, readyAt: now + BOOSTERS[kind].hours * 3_600_000 };
  state.case.push(b);
  return b;
}

/** Open the case booster at `index`: free when its time is up, otherwise for gems. Null if not affordable. */
export function openFromCase(state: GachaState, index: number, now: number, pool: Pullable[], rng: () => number): string[] | null {
  const b = state.case[index];
  if (!b) return null;
  const cost = gemsToOpenNow(b.readyAt - now);
  if (cost > state.gems) return null;
  state.gems -= cost;
  state.case.splice(index, 1);
  return openBooster(state, b.kind, pool, rng);
}

/** Buy a shop booster: it goes to `ready`. False if not enough gems. */
export function buyBooster(state: GachaState): boolean {
  if (state.gems < SHOP_PRICE) return false;
  state.gems -= SHOP_PRICE;
  state.ready.push({ kind: 'shop', readyAt: 0 });
  return true;
}

/** Open the first ready booster (welcome or shop). */
export function openReady(state: GachaState, pool: Pullable[], rng: () => number): { kind: BoosterKind; got: string[] } | null {
  const b = state.ready.shift();
  if (!b) return null;
  return { kind: b.kind, got: openBooster(state, b.kind, pool, rng) };
}

/** Parse a saved state, or a new one if it is missing or not ours. */
export function loadState(json: string | null): GachaState {
  try {
    const s = JSON.parse(json ?? '');
    if (s && s.version === 1 && typeof s.gems === 'number' && s.owned && Array.isArray(s.case) && Array.isArray(s.ready)) return s;
  } catch { /* fall through */ }
  return newState();
}
