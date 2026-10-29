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
 */
export function aiTurn(game: Game, rng: Rng): void {
  const me = game.current as PlayerId;
  const goalDist = distancesTo(game, game.board.def.goals[(1 - me) as PlayerId]);
  const mine = game.figures.filter((f) => f.owner === me);

  let best: { uid: string; to: NodeId; score: number } | null = null;
  for (const f of mine) {
    for (const to of game.reachable(f)) {
      const score = (goalDist.get(to) ?? 99) + rng() * 0.5;
      if (!best || score < best.score) best = { uid: f.uid, to, score };
    }
  }
  if (best && !game.winner) {
    game.move(best.uid, best.to);
    if (game.winner !== null) return;
  }
  for (const f of mine) {
    const foe = game.adjacentEnemies(f)[0];
    if (f.status === 'board' && f.wait === 0 && foe) { game.battle(f.uid, foe.uid); return; }
  }
  game.endTurn();
}
