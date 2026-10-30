import type { Game } from './game.ts';
import type { NodeId, PlayerId } from './types.ts';
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
export function aiTurn(game: Game, rng: Rng): void {
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
