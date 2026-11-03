import type { Game } from './game.ts';
import { plateSpec, plateTargets } from './plates.ts';
import type { Figure, Move, NodeId, PlayerId } from './types.ts';
import { compareMoves } from './battle.ts';
import type { Rng } from './rng.ts';

/** Steps from every node to `goal`, ignoring figures. */
function distancesTo(game: Game, goal: NodeId): Map<NodeId, number> {
  const dist = new Map<NodeId, number>([[goal, 0]]);
  const queue = [goal];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of game.board.neighbors(cur)) {
      if (!dist.has(nb)) { dist.set(nb, dist.get(cur)! + 1); queue.push(nb); }
    }
  }
  return dist;
}

/**
 * Plays one full turn for the current player: head for the goal, then battle if next to an enemy,
 * otherwise end the turn. Deliberately simple; it only needs to be legal and mildly purposeful.
 * It also uses ability moves (Game.specials, the purple targets):
 * - Run Off first, if swapping brings that figure closer to the goal (it does not end the turn);
 * - waking a sleeping ally, if no move wins the game;
 * - Cut Off to its own goal when an enemy is within 2 steps of it;
 * - Forest Leap and Swarm as one more kind of move, scored like the others by distance to the goal.
 */
/**
 * Plates, at the start of the turn (one per turn): a battle boost on a figure that can battle now, Goal Block when an
 * enemy is near its goal, a heal for a figure with a matching condition, Clear Wait / Max Revive when useful, and now and
 * then a plate that ends the turn (type powers, held items, spheres) when it has no battle to fight.
 * Returns true if the plate ended the turn.
 */
function aiPlate(game: Game, rng: Rng): boolean {
  const me = game.current as PlayerId;
  const slots = game.plates[me];
  const use = (name: string | ((n: string) => boolean), pick?: (f: Figure) => boolean): boolean | null => {
    const matches = (n: string) => (typeof name === 'string' ? n === name : name(n));
    const i = slots.findIndex((x, idx) => !x.used && matches(x.def.name) && game.canUsePlate(me, idx));
    if (i < 0) return null;
    const spec = plateSpec(slots[i].def);
    let targets: string[] = [];
    if (spec.target !== 'none') {
      const cands = plateTargets(game, me, slots[i].def).filter((f) => !pick || pick(f));
      if (!cands.length) return null;
      targets = [cands[0].uid];
      if (spec.target === 'two-own') return null; // Pokémon Switch: not used by the AI
    }
    const before = game.current;
    game.usePlate(me, i, targets);
    return game.current !== before || game.winner !== null;
  };
  const fighters = game.figures.filter((f) => f.owner === me && game.canAttack(f) && game.adjacentEnemies(f).length);
  const boosts = ['X Attack', 'X Sp. Atk', 'Focus Band', 'Double Chance', 'X Defend', 'Bright Powder', 'Desperate Times', 'X Speed',
    'X Accuracy', 'Concentrated Fertilizer', 'Rocky Helmet', 'Power Battle', 'No Guard'];
  if (fighters.length) for (const b of boosts) { const r = use(b, (f) => fighters.includes(f)); if (r !== null) return r; }
  const toOwnGoal = game.distances(game.board.def.goals[me]);
  if (game.figures.some((o) => o.owner !== me && o.status === 'board' && (toOwnGoal.get(o.at!) ?? 99) <= 2)) {
    const r = use('Goal Block'); if (r !== null) return r;
  }
  for (const heal of ['Full Heal', 'Awakening', 'Paralyze Heal', 'Confuse Heal', 'Antidote', 'Ice Heal', 'Burn Heal']) { const r = use(heal); if (r !== null) return r; }
  for (const n of ['Clear Wait', 'Max Revive']) { const r = use(n); if (r !== null) return r; }
  if (!fighters.length && rng() < 0.25) {
    const r = use((n) => /Power$|Sphere$|Energy$/.test(n) || ['Magnet', 'Sharp Beak', 'Miracle Seed', 'Never-Melt Ice', 'Hard Stone', 'Charcoal',
      'Dragon Fang', 'Mystic Water', 'Poison Barb', 'Spell Tag', 'Odd Incense', 'Black Glasses', 'Silver Powder', 'Silk Scarf', 'Karate Belt',
      'Soft Sand', 'Twisted Spoon', 'Poison Blade'].includes(n));
    if (r !== null) return r;
  }
  return false;
}

/** The first AI (kept as the easy level): run for the goal, battle whoever is next to it. */
export function aiTurnBasic(game: Game, rng: Rng): void {
  if (aiPlate(game, rng)) return;
  const me = game.current as PlayerId;
  const goalDist = distancesTo(game, game.board.def.goals[(1 - me) as PlayerId]);
  const ownGoalDist = distancesTo(game, game.board.def.goals[me]);
  const mine = () => game.figures.filter((f) => f.owner === me);
  const gd = (n: NodeId | null) => (n ? goalDist.get(n) ?? 99 : 99);

  // Run Off: swap with an adjacent ally when that moves the figure nearer the opponent's goal.
  for (const f of mine()) {
    const s = game.specials(f).find((x) => x.kind === 'runoff' && gd(x.to) < gd(f.at));
    if (s) { game.doSpecial(s); break; }
  }

  type Choice = { score: number; run: () => void };
  let best: Choice | null = null;
  const offer = (score: number, run: () => void) => { if (!best || score < best.score) best = { score, run }; };
  for (const f of mine()) {
    for (const to of game.reachable(f)) offer(gd(to) + rng() * 0.5, () => game.move(f.uid, to));
    for (const s of game.specials(f)) {
      if (s.kind === 'forestleap') offer(gd(s.to) + rng() * 0.5, () => game.doSpecial(s));
      // Swarm ends the turn without a battle: a little worse than an equal plain move.
      if (s.kind === 'swarm') offer(gd(s.to) + 0.6 + rng() * 0.5, () => game.doSpecial(s));
    }
  }
  const threat = game.figures.some((o) => o.owner !== me && o.status === 'board' && (ownGoalDist.get(o.at!) ?? 99) <= 2);
  const special = (kind: string) => mine().flatMap((f) => game.specials(f)).find((s) => s.kind === kind);
  const winNow = best !== null && (best as Choice).score < 1;
  const cut = threat ? special('cutoff') : undefined;
  const tag = special('tag');
  if (!winNow && cut) { game.doSpecial(cut); return; } // defend the goal (ends the turn)
  if (!winNow && tag) { game.doSpecial(tag); return; } // wake an ally (ends the turn)
  if (best && game.winner === null) {
    (best as Choice).run();
    if (game.winner !== null || game.current !== me) return; // the move ended the turn (Diving Entry, Swarm…)
  }
  for (const f of mine()) {
    const foe = game.adjacentEnemies(f)[0];
    if (game.canAttack(f) && foe) { game.battle(f.uid, foe.uid); return; }
  }
  game.endTurn();
}

// ---------------------------------------------------------------------------------------------------------------------
// The smart AI (2026-11-02): looks one turn ahead, defends its goal and weighs battles by the wheels' odds.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * What the AI values. The numbers are this game's own (nothing from the original); an "amiibo"-style AI can change them
 * to get a different personality (more attacking, more defensive, more battles...).
 */
export interface AiWeights {
  /** An enemy figure that can reach our goal next turn (they would win). */
  danger: number;
  /** An enemy figure that could reach our goal in two turns. */
  danger2: number;
  /** One of ours that can reach their goal next turn (forces them to defend). */
  threat: number;
  /** Per step the nearest figure of ours is from their goal, and per step summed over all of ours on the board. */
  progress: number;
  progressAll: number;
  /** A figure of ours on the board (development). */
  onBoard: number;
  /** An enemy knocked out by surrounding it, or one of ours. */
  surround: number;
  /** Standing on our own goal when enemies are near it (or wasting a figure there when none are). */
  guardGoal: number;
  /** Value of knocking out an enemy figure in battle, and of losing one of ours. */
  koValue: number;
  /** How much the risk of being attacked counts (0 = ignore). */
  exposure: number;
  /** Random noise, so it does not always play the same. */
  noise: number;
}

export const DEFAULT_WEIGHTS: AiWeights = {
  danger: 5000, danger2: 220, threat: 380, progress: 22, progressAll: 4, onBoard: 14, surround: 650,
  guardGoal: 160, koValue: 260, exposure: 0.6, noise: 6,
};

type Occ = Map<NodeId, Figure>;

const damagingMove = (m: Move) => (m.color === 'white' || m.color === 'gold') && m.damage > 0;
const condPenalty = (f: Figure) => (f.cond === 'poison' ? 20 : f.cond === 'noxious' ? 40 : f.cond === 'burn' ? 10 : 0);
const oddsCache = new Map<string, { win: number; lose: number }>();

/**
 * Chance that `a`, battling `b`, knocks it out (win) or is knocked out (lose), from the two wheels alone
 * (abilities, plates and most conditions left out; poison and burn lower damage).
 */
export function battleOdds(game: Game, a: Figure, b: Figure): { win: number; lose: number } {
  const key = `${a.def.id}|${b.def.id}|${condPenalty(a)}|${condPenalty(b)}|${a.def.wheel.length}|${b.def.wheel.length}`;
  const hit = oddsCache.get(key);
  if (hit) return hit;
  const wa = a.def.wheel, wb = b.def.wheel;
  const ta = wa.reduce((t, x) => t + x.weight, 0) || 1, tb = wb.reduce((t, x) => t + x.weight, 0) || 1;
  let win = 0, lose = 0;
  for (const x of wa) for (const y of wb) {
    const pa = damagingMove(x.move) ? Math.max(0, x.move.damage - condPenalty(a)) : 0;
    const pb = damagingMove(y.move) ? Math.max(0, y.move.damage - condPenalty(b)) : 0;
    const c = compareMoves(x.move, y.move, pa, pb, game.rules);
    const w = (x.weight / ta) * (y.weight / tb);
    if (c > 0 && (game.rules.decisive || pa > 0)) win += w;
    if (c < 0 && (game.rules.decisive || pb > 0)) lose += w;
  }
  const out = { win, lose };
  oddsCache.set(key, out);
  return out;
}

/** Nodes a figure could reach with its MP through `occ` (awake figures block; dozing ones do not). */
function reachFrom(game: Game, f: Figure, occ: Occ, mp: number, at: NodeId | null): Set<NodeId> {
  const out = new Set<NodeId>();
  if (mp < 1) return out;
  const dist = new Map<NodeId, number>();
  const queue: NodeId[] = [];
  const blocks = (n: NodeId) => { const o = occ.get(n); return !!o && !game.dozing(o); };
  if (at === null) {
    for (const s of game.board.def.spawns[f.owner]) if (!occ.has(s)) { dist.set(s, 1); queue.push(s); }
  } else { dist.set(at, 0); queue.push(at); }
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    if (d >= mp) continue;
    for (const nb of game.board.neighbors(cur)) {
      if (dist.has(nb) || blocks(nb)) continue;
      dist.set(nb, d + 1);
      queue.push(nb);
    }
  }
  for (const n of dist.keys()) if (n !== at && !occ.has(n)) out.add(n);
  return out;
}

/** Steps from `goal` to every node through `occ` (awake figures block, except the goal itself). */
function pathDist(game: Game, goal: NodeId, occ: Occ): Map<NodeId, number> {
  const dist = new Map<NodeId, number>([[goal, 0]]);
  const queue = [goal];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of game.board.neighbors(cur)) {
      if (dist.has(nb)) continue;
      dist.set(nb, dist.get(cur)! + 1);
      const o = occ.get(nb);
      if (!o || game.dozing(o)) queue.push(nb); // can reach an occupied node but not pass through it
    }
  }
  return dist;
}

/** Can figure `o` (of the player who moves next) stand on `goal` next turn? */
function canReach(game: Game, o: Figure, occ: Occ, goal: NodeId, extraMp = 0): boolean {
  if (o.status === 'pc' || o.status === 'removed' || o.wait > 1 || game.dozing(o)) return false;
  const at = o.status === 'board' ? o.at : null;
  return reachFrom(game, o, occ, game.mp(o) + extraMp, at).has(goal);
}

export type Features = Record<keyof AiWeights, number>;
const zero = (): Features => ({ danger: 0, danger2: 0, threat: 0, progress: 0, progressAll: 0, onBoard: 0, surround: 0, guardGoal: 0, koValue: 0, exposure: 0, noise: 0 });
/** KO value used to scale exposure, so that exposure stays a linear feature. */
const EXPOSURE_KO = 260;
export const dot = (w: AiWeights, f: Features) => (Object.keys(f) as (keyof AiWeights)[]).reduce((t, k) => t + w[k] * f[k], 0);

/**
 * A position seen by `me`, as features: the score is dot(weights, features). Learning (the amiibo) changes the weights.
 */
function features(game: Game, me: PlayerId, occ: Occ, onBench: Set<string>): { f: Features; dangers: Figure[] } {
  const opp = (1 - me) as PlayerId;
  const myGoal = game.board.def.goals[me], theirGoal = game.board.def.goals[opp];
  const where = new Map<string, NodeId>();
  for (const [n, fig] of occ) where.set(fig.uid, n);
  const live = (x: Figure) => x.status !== 'pc' && x.status !== 'removed';
  const enemies = game.figures.filter((x) => x.owner === opp && live(x) && (where.has(x.uid) || x.status === 'bench'));
  const mine = game.figures.filter((x) => x.owner === me && (where.has(x.uid) || onBench.has(x.uid)));
  const f = zero();
  const dangers: Figure[] = [];
  const toMine = pathDist(game, myGoal, occ);
  const guard = occ.get(myGoal);
  const guarded = !!guard && guard.owner === me && !game.dozing(guard);
  for (const o of enemies) {
    const at = where.get(o.uid) ?? null;
    const fig = { ...o, status: at ? 'board' : 'bench', at } as Figure;
    if (canReach(game, fig, occ, myGoal)) { f.danger -= 1; dangers.push(o); continue; }
    const mp = Math.max(1, game.mp(o));
    const d = at ? toMine.get(at) ?? 99 : 1 + Math.min(...game.board.def.spawns[opp].map((x) => toMine.get(x) ?? 99));
    // With our own figure on the goal they have to battle it off first: much less pressing.
    if (d <= 2 * mp) f.danger2 -= guarded ? 0.25 : 1;
  }
  const toTheirs = pathDist(game, theirGoal, occ);
  let nearest = 99, sum = 0;
  for (const x of mine) {
    const at = where.get(x.uid) ?? null;
    if (!at) continue;
    f.onBoard += 1;
    const d = toTheirs.get(at) ?? 12;
    nearest = Math.min(nearest, d);
    sum += d;
    if (canReach(game, { ...x, at, status: 'board' } as Figure, occ, theirGoal)) f.threat += 1;
    if (at === myGoal) f.guardGoal += enemies.some((o) => { const oa = where.get(o.uid); return oa && (toMine.get(oa) ?? 99) <= 3; }) ? 1 : -1 / 3;
    for (const n of game.board.neighbors(at)) {
      const o = occ.get(n);
      if (o && o.owner === opp && !game.dozing(o)) f.exposure -= EXPOSURE_KO * battleOdds(game, o, x).win;
    }
  }
  f.progress -= nearest === 99 ? 12 : nearest;
  f.progressAll -= sum;
  for (const [n, x] of occ) {
    const nbs = game.board.neighbors(n);
    if (nbs.length && nbs.every((m) => { const o = occ.get(m); return !!o && o.owner !== x.owner && !game.dozing(o); })) f.surround += x.owner === me ? -1 : 1;
  }
  return { f, dangers };
}

/** Best battle now for the current player, with its value (or null). */
function bestBattle(game: Game, me: PlayerId, w: AiWeights, dangers: Set<string>): { a: Figure; b: Figure; value: number } | null {
  let best: { a: Figure; b: Figure; value: number } | null = null;
  const myGoal = game.board.def.goals[me];
  const toMine = game.distances(myGoal);
  for (const a of game.figures) {
    if (a.owner !== me || !game.canAttack(a)) continue;
    for (const b of game.adjacentEnemies(a)) {
      const o = battleOdds(game, a, b);
      const close = Math.max(0, 4 - (toMine.get(b.at!) ?? 9)) * 60;
      const value = o.win * (w.koValue + close + (dangers.has(b.uid) ? w.danger : 0)) - o.lose * w.koValue;
      if (!best || value > best.value) best = { a, b, value };
    }
  }
  return best;
}

/** One possible MP move (or ability move, or not moving) with the features of the position it leaves. */
export interface MoveOption { key: string; f: Features; score: number; run: () => void; ends: boolean }

/**
 * Every move the current player can make now, scored with `w`. Keys: "stay", "<uid>><node>" for MP moves,
 * "<kind>:<uid>><node>" for ability moves. Used by the AI and to learn from the player's choices (amiibo).
 */
export function moveOptions(game: Game, w: AiWeights = DEFAULT_WEIGHTS): MoveOption[] {
  const me = game.current as PlayerId;
  const theirGoal = game.board.def.goals[(1 - me) as PlayerId];
  const mine = game.figures.filter((x) => x.owner === me);
  const baseOcc = (): Occ => {
    const occ: Occ = new Map();
    for (const x of game.figures) if (x.status === 'board' && x.at) occ.set(x.at, x);
    return occ;
  };
  const benchIds = () => new Set(game.figures.filter((x) => x.owner === me && x.status === 'bench').map((x) => x.uid));
  const out: MoveOption[] = [];
  const add = (key: string, occ: Occ, bench: Set<string>, battleAfter: boolean, run: () => void, ends: boolean, extra = 0) => {
    const e = features(game, me, occ, bench);
    const f = e.f;
    if (battleAfter) {
      // The best battle we could fight from there (figures next to enemies in `occ`), as features.
      const dangers = new Set(e.dangers.map((d) => d.uid));
      let best: { v: number; win: number; lose: number; threat: boolean } | null = null;
      for (const [n, a] of occ) {
        if (a.owner !== me || a.wait > 0 || game.dozing(a)) continue;
        for (const m of game.board.neighbors(n)) {
          const b = occ.get(m);
          if (!b || b.owner === me) continue;
          const o = battleOdds(game, a, b), threat = dangers.has(b.uid);
          const v = o.win * (w.koValue + (threat ? w.danger : 0)) - o.lose * w.koValue;
          if (v > 0 && (!best || v > best.v)) best = { v, win: o.win, lose: o.lose, threat };
        }
      }
      if (best) { f.koValue += best.win - best.lose; if (best.threat) f.danger += best.win; }
    }
    out.push({ key, f, score: dot(w, f) + extra, run, ends });
  };
  add('stay', baseOcc(), benchIds(), true, () => {}, false);
  for (const x of mine) {
    for (const to of game.reachable(x)) {
      if (to === theirGoal) { out.push({ key: `${x.uid}>${to}`, f: zero(), score: 1e9, run: () => game.move(x.uid, to), ends: true }); continue; }
      const occ = baseOcc();
      if (x.at) occ.delete(x.at);
      occ.set(to, x);
      const bench = benchIds(); bench.delete(x.uid);
      add(`${x.uid}>${to}`, occ, bench, true, () => game.move(x.uid, to), false);
    }
    for (const sp of game.specials(x)) {
      if (sp.kind === 'forestleap' || sp.kind === 'swarm' || sp.kind === 'cutoff') {
        const mover = sp.kind === 'swarm' ? game.figures.find((y) => y.uid === sp.uid)! : x;
        const occ = baseOcc();
        if (mover.at) occ.delete(mover.at);
        occ.set(sp.to, mover);
        const bench = benchIds(); bench.delete(mover.uid);
        const ends = sp.kind !== 'forestleap'; // Swarm and Cut Off end the turn (no battle after)
        add(`${sp.kind}:${mover.uid}>${sp.to}`, occ, bench, !ends, () => game.doSpecial(sp), ends);
      }
      if (sp.kind === 'tag') add(`tag:${x.uid}>${sp.to}`, baseOcc(), benchIds(), false, () => game.doSpecial(sp), true, w.koValue * 0.5);
    }
  }
  return out;
}

/**
 * Plays one full turn for the current player. Every possible move (and not moving) is scored by the position it leaves:
 * can the enemy reach our goal next turn (block it, or battle the figure that can), can we reach theirs, progress,
 * surrounds, figures left where they would lose a battle. Then the best battle is fought if it is worth it.
 */
export function aiTurn(game: Game, rng: Rng, w: AiWeights = DEFAULT_WEIGHTS): void {
  if (aiPlate(game, rng)) return;
  const me = game.current as PlayerId;
  const theirGoal = game.board.def.goals[(1 - me) as PlayerId];
  // Run Off: swap with an adjacent ally when that moves the figure nearer their goal (does not end the turn).
  const gd = game.distances(theirGoal);
  for (const x of game.figures.filter((y) => y.owner === me)) {
    const s = game.specials(x).find((y) => y.kind === 'runoff' && (gd.get(y.to) ?? 99) < (gd.get(x.at!) ?? 99));
    if (s) { game.doSpecial(s); break; }
  }
  const opts = moveOptions(game, w);
  for (const o of opts) o.score += (rng() - 0.5) * w.noise;
  opts.sort((a, b) => b.score - a.score);
  opts[0].run();
  if (game.winner !== null || game.current !== me) return; // the move won or ended the turn

  const occ: Occ = new Map();
  for (const x of game.figures) if (x.status === 'board' && x.at) occ.set(x.at, x);
  const bench = new Set(game.figures.filter((x) => x.owner === me && x.status === 'bench').map((x) => x.uid));
  const dangers = new Set(features(game, me, occ, bench).dangers.map((d) => d.uid));
  const b = bestBattle(game, me, w, dangers);
  if (b && b.value > 0) { game.battle(b.a.uid, b.b.uid); return; }
  if (game.winner === null && game.current === me) game.endTurn();
}

/**
 * Styles for the ordinary AIs, so rivals do not all play alike. Each is the default weights with some traits pushed up
 * or down (factors × DEFAULT_WEIGHTS), plus its noise. INVENTED for this game (2026-11-02).
 */
export const AI_STYLES: { key: string; name: string; text: string; mul: Partial<Record<keyof AiWeights, number>>; noise: number }[] = [
  { key: 'balanced', name: 'Equilibrada', text: 'Ataca y defiende por igual.', mul: {}, noise: 6 },
  { key: 'defensive', name: 'Defensiva', text: 'Protege su portería antes que nada.', mul: { danger2: 2.2, guardGoal: 2.5, progress: 0.6, exposure: 1.6 }, noise: 8 },
  { key: 'aggressive', name: 'Agresiva', text: 'Corre hacia tu portería.', mul: { threat: 2, progress: 1.8, danger2: 0.5, guardGoal: 0.4, exposure: 0.5 }, noise: 8 },
  { key: 'hunter', name: 'Cazadora', text: 'Busca combates para noquear.', mul: { koValue: 2.2, exposure: 0.4, progress: 0.8 }, noise: 8 },
  { key: 'tactician', name: 'Táctica', text: 'Intenta rodear tus figuras.', mul: { surround: 2.5, onBoard: 2, progressAll: 1.5 }, noise: 6 },
  { key: 'rookie', name: 'Novata', text: 'Comete bastantes errores y a veces no ve venir el peligro.', mul: { danger: 0.04, danger2: 0.3, koValue: 0.5 }, noise: 250 },
];

export function styleWeights(key: string): AiWeights {
  const s = AI_STYLES.find((x) => x.key === key) ?? AI_STYLES[0];
  const w = { ...DEFAULT_WEIGHTS };
  for (const [k, m] of Object.entries(s.mul) as [keyof AiWeights, number][]) w[k] = DEFAULT_WEIGHTS[k] * m;
  w.noise = s.noise;
  return w;
}

/**
 * A rival's level (1-50), INVENTED (2026-11-03): low levels make many mistakes and often do not see a threat coming;
 * level 50 plays the weights as they are. Used so the first rivals are easy and they get harder as you climb.
 */
export function levelWeights(base: AiWeights, level: number): AiWeights {
  const t = Math.max(0, Math.min(1, (level - 1) / 49));
  return {
    ...base,
    danger: base.danger * (0.03 + 0.97 * t ** 0.8),
    danger2: base.danger2 * (0.3 + 0.7 * t),
    koValue: base.koValue * (0.5 + 0.5 * t),
    noise: Math.max(base.noise, 250 * (1 - t) ** 1.5),
  };
}
