import type { Game } from './game.ts';
import type { Figure, NodeId, PlayerId } from './types.ts';

/*
 * Plates (data/plates.json, 165, from Bulbapedia + Serebii; text and cost of each plate's first version).
 * Rules: up to 6 plates per deck with a total cost of 6 or less (Fandom "Deck", Nintendo Life review); each plate is
 * used once per duel (Fandom) at the start of your turn, before moving (pokemon.com guide). ASSUMED: one plate per turn.
 * Plates that refer to figures this game does not have, or whose text needs systems the game lacks, are listed with
 * the reason and cannot be used (PlateSpec.status 'no').
 */

export interface PlateDef { id: string; name: string; category: string; rarity: string; cost: number; text: string }

export interface PlateRecord {
  id: number; name: string; category: string | null; rarity: string;
  variants: { description: string; cost: number; since_version: string | null }[];
}

export function toPlateDef(r: PlateRecord): PlateDef {
  const v = r.variants[0];
  return { id: String(r.id), name: r.name, category: r.category ?? 'Plates', rarity: r.rarity, cost: v.cost, text: v.description.trim() };
}

/** What a plate asks you to choose. */
export type Target =
  | 'own-field' | 'own-field-bench' | 'own-bench' | 'own-pc' | 'none'
  | 'own-field-grass' | 'own-field-bench-grass' | 'two-own';

export interface PlateSpec {
  status: 'ok' | 'no';
  reason?: string;
  target: Target;
  /** Type the chosen figure must have, if any. */
  type?: string;
  endsTurn: boolean;
}

const TYPE_POWER: Record<string, string> = {
  'Iron Power': 'Steel', 'Dread Power': 'Dark', 'Flame Power': 'Fire', 'Meadow Power': 'Grass', 'Splash Power': 'Water',
  'Mind Power': 'Psychic', 'Toxic Power': 'Poison', 'Draco Power': 'Dragon', 'Clay Power': 'Ground', 'Spooky Power': 'Ghost',
  'Zap Power': 'Electric',
};
const HELD: Record<string, string> = {
  Magnet: 'Electric', 'Sharp Beak': 'Flying', 'Miracle Seed': 'Grass', 'Never-Melt Ice': 'Ice', 'Hard Stone': 'Rock',
  Charcoal: 'Fire', 'Dragon Fang': 'Dragon', 'Mystic Water': 'Water', 'Poison Barb': 'Poison', 'Spell Tag': 'Ghost',
  'Odd Incense': 'Psychic', 'Black Glasses': 'Dark', 'Silver Powder': 'Bug', 'Silk Scarf': 'Normal', 'Karate Belt': 'Fighting',
  'Soft Sand': 'Ground',
};
const HEALS: Record<string, string[]> = {
  'Full Heal': ['poison', 'noxious', 'paralysis', 'burn', 'sleep', 'frozen', 'confusion'],
  Awakening: ['sleep'], 'Paralyze Heal': ['paralysis'], 'Confuse Heal': ['confusion'], Antidote: ['poison', 'noxious'],
  'Ice Heal': ['frozen'], 'Burn Heal': ['burn'],
};
/** Turn buffs on one figure: plate name -> buff key. */
const TURN_BUFF: Record<string, [string, Target]> = {
  'X Attack': ['xattack', 'own-field-bench'], 'X Sp. Atk': ['xspatk', 'own-field-bench'], 'X Defend': ['xdefend', 'own-field-bench'],
  'Focus Band': ['focusband', 'own-field-bench'], 'Desperate Times': ['desperate', 'own-field-bench'],
  'Double Chance': ['doublechance', 'own-field-bench'], 'No Guard': ['noguard', 'own-field-bench'], 'X Speed': ['xspeed', 'own-field-bench'],
  'X Accuracy': ['xaccuracy', 'own-field-bench'], 'Power Battle': ['powerbattle', 'own-field-bench'],
  'Bright Powder': ['brightpowder', 'own-field'], Ballast: ['ballast', 'own-field'], 'Invisibility Cape': ['cape', 'own-bench'],
  'Concentrated Fertilizer': ['fertilizer', 'own-field-bench-grass'], 'Counter Attack': ['counterattack', 'own-field'],
  'Force Remove': ['forceremove', 'own-field-bench'], 'Rocky Helmet': ['rockyhelmet', 'own-field-bench'],
};
/** Duel-long effects with a clear text: name -> [key, needs a chosen figure of this type (sphere) or not]. */
const DUEL_EFFECT: Record<string, [string, string | null]> = {
  'Flame Energy': ['flameenergy', null], 'Steel Energy': ['steelenergy', null], 'Electro Energy': ['electroenergy', null],
  'Metal Sphere': ['metalsphere', 'Steel'], 'Flame Sphere': ['flamesphere', 'Fire'], 'Electro Sphere': ['electrosphere', 'Electric'],
  'Mystic Sphere': ['mysticsphere', 'Fairy'], 'Aqua Sphere': ['aquasphere', 'Water'],
  'Grass Sphere': ['grasssphere', 'Grass'], 'Poison Blade': ['poisonblade', 'Steel'], 'Twisted Spoon': ['twistedspoon', 'Psychic'],
  'Dragon Sphere': ['dragonsphere', 'Dragon'], 'Sticky Grass': ['stickygrass', 'Grass'], 'Gold Sphere': ['goldsphere', 'Ground'],
  // Air Balloon: any of your Pokémon on the field or bench, until the end of its next battle.
  'Air Balloon': ['airballoon', ''],
};
const NOT_HERE: [RegExp, string][] = [
  [/Mega Evolve/, 'la Megaevolución no está en este juego'],
  [/Primal Reversion/, 'la Regresión Primigenia no está en este juego'],
  [/Genesect|Genosect|Deoxys|Latias|Latios|Kyurem|Zekrom|Reshiram|Rotom|Shaymin|Zygarde|Rhyperior|Onix/, 'es para figuras concretas que este juego no tiene (o un efecto suyo que no está)'],
  [/Ultra Space|Z-Move|Z-Power|Z-Crystal|-ium Z/, 'usa sistemas (Ultra Space, movimientos Z) que no están en este juego'],
];

/** How a plate works here. */
export function plateSpec(p: PlateDef): PlateSpec {
  const ends = /Your turn ends|This ends your turn|turn ends/.test(p.text);
  if (TYPE_POWER[p.name]) return { status: 'ok', target: 'none', endsTurn: true };
  if (HELD[p.name]) return { status: 'ok', target: 'own-field', type: HELD[p.name], endsTurn: true };
  if (HEALS[p.name]) return { status: 'ok', target: 'own-field', endsTurn: ends };
  if (TURN_BUFF[p.name]) {
    const [, target] = TURN_BUFF[p.name];
    return { status: 'ok', target, type: target.endsWith('grass') ? 'Grass' : undefined, endsTurn: ends };
  }
  if (DUEL_EFFECT[p.name]) {
    const [, type] = DUEL_EFFECT[p.name];
    if (type === '') return { status: 'ok', target: 'own-field-bench', endsTurn: ends };
    return { status: 'ok', target: type ? 'own-field' : 'none', type: type ?? undefined, endsTurn: ends };
  }
  switch (p.name) {
    case 'Clear Wait': return { status: 'ok', target: 'own-field-bench', endsTurn: false };
    case 'Max Revive': return { status: 'ok', target: 'own-pc', endsTurn: ends };
    case 'Switcheroo': return { status: 'ok', target: 'own-bench', endsTurn: true };
    case 'Priority Recovery': return { status: 'ok', target: 'none', endsTurn: true };
    case 'Long Throw': return { status: 'ok', target: 'own-bench', endsTurn: true };
    case 'Scoop Up': return { status: 'ok', target: 'own-field', endsTurn: false };
    case 'Pokémon Switch': return { status: 'ok', target: 'two-own', endsTurn: true };
    case 'Swap Spot': return { status: 'ok', target: 'own-field', endsTurn: false };
    case 'Quick Care': return { status: 'ok', target: 'own-field', endsTurn: true };
    case 'Hurdle Jump': return { status: 'ok', target: 'own-field', endsTurn: true };
    case 'Goal Block': return { status: 'ok', target: 'own-field', endsTurn: true };
    case 'Recycle': return { status: 'ok', target: 'none', endsTurn: true };
  }
  for (const [re, why] of NOT_HERE) if (re.test(p.text) || re.test(p.name)) return { status: 'no', reason: why, target: 'none', endsTurn: false };
  return { status: 'no', reason: 'su efecto aún no está programado en este juego', target: 'none', endsTurn: false };
}

export const turnBuffKey = (name: string) => TURN_BUFF[name]?.[0];
export const typePowerType = (name: string) => TYPE_POWER[name];
export const heldType = (name: string) => HELD[name];
export const healConds = (name: string) => HEALS[name];
export const duelEffectKey = (name: string) => DUEL_EFFECT[name]?.[0];

/** Figures a plate can be used on now (for 'two-own', the candidates for the first pick). */
export function plateTargets(game: Game, p: PlayerId, plate: PlateDef): Figure[] {
  const spec = plateSpec(plate);
  const mine = game.figures.filter((f) => f.owner === p);
  const typed = (f: Figure) => !spec.type || f.def.type === spec.type || f.def.type2 === spec.type;
  const goalFree = !game.figureAt(game.board.def.goals[p]);
  const entries = (q: PlayerId) => game.board.def.spawns[q];
  switch (plate.name) {
    case 'Clear Wait': return mine.filter((f) => f.status !== 'pc' && f.wait > 0);
    case 'Max Revive': return mine.filter((f) => f.status === 'pc');
    case 'Switcheroo': return game.pc[p].length ? mine.filter((f) => f.status === 'bench') : [];
    case 'Long Throw': return game.longThrowSpots(p).length ? mine.filter((f) => f.status === 'bench' && f.wait === 0) : [];
    case 'Swap Spot': return mine.filter((f) => f.status === 'board' && game.neighbourFigures(f).some((o) => o.owner === p));
    case 'Quick Care': return game.pc[p].length < 2 ? mine.filter((f) => f.status === 'board') : [];
    case 'Hurdle Jump': return mine.filter((f) => f.status === 'board' && game.hurdleSpots(f).length > 0);
    case 'Goal Block': return goalFree ? mine.filter((f) => f.status === 'board') : [];
    case 'Counter Attack':
      if (!entries(p).every((n) => { const o = game.figureAt(n); return o && o.owner !== p; })) return [];
      break;
    case 'Force Remove':
      if (!entries((1 - p) as PlayerId).every((n) => game.figureAt(n)?.owner === p)) return [];
      break;
  }
  if (healConds(plate.name)) return mine.filter((f) => f.status === 'board' && f.cond && healConds(plate.name).includes(f.cond));
  if (spec.target === 'none') return [];
  return mine.filter((f) => {
    if (!typed(f)) return false;
    if (spec.target.startsWith('own-field-bench')) return f.status === 'board' || f.status === 'bench';
    if (spec.target === 'own-field') return f.status === 'board';
    if (spec.target === 'own-bench') return f.status === 'bench';
    if (spec.target === 'two-own') return f.status === 'board' || f.status === 'bench';
    return false;
  });
}

/** Can the plate be used now (target-less plates have their own conditions)? */
export function plateUsable(game: Game, p: PlayerId, plate: PlateDef): boolean {
  const spec = plateSpec(plate);
  if (spec.status !== 'ok') return false;
  if (spec.target !== 'none') return plateTargets(game, p, plate).length > 0;
  if (plate.name === 'Priority Recovery') return game.pc[p].length >= 2;
  if (plate.name === 'Recycle') return game.plates[0].concat(game.plates[1]).some((x) => x.used && x.def.name !== 'Recycle');
  return true;
}

/** Spots for Hurdle Jump: over a connected Pokémon to the free node right behind it. */
export function hurdle(game: Game, f: Figure): NodeId[] {
  return game.hurdleSpots(f);
}
