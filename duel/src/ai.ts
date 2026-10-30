import type { Game } from './game.ts';
import { plateSpec, plateTargets } from './plates.ts';
import type { Figure, NodeId, PlayerId } from './types.ts';
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

export function aiTurn(game: Game, rng: Rng): void {
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
