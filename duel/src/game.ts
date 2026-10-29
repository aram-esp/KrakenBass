import { Board } from './board.ts';
import { battle, type BattleResult } from './battle.ts';
import type { BoardDef, Figure, FigureDef, NodeId, PlayerId } from './types.ts';
import type { Rng } from './rng.ts';
import { defaultRules, type RulesConfig } from './rules.config.ts';

export type Winner = PlayerId | 'none';

export class Game {
  readonly board: Board;
  readonly figures: Figure[] = [];
  turn = 1;
  current: PlayerId = 0;
  winner: Winner | null = null;

  private rng: Rng;
  private rules: RulesConfig;

  constructor(
    boardDef: BoardDef,
    decks: [FigureDef[], FigureDef[]],
    rng: Rng,
    rules: RulesConfig = defaultRules,
  ) {
    this.rng = rng;
    this.rules = rules;
    this.board = new Board(boardDef);
    for (const p of [0, 1] as PlayerId[]) {
      decks[p].forEach((def, i) =>
        this.figures.push({ uid: `${p}:${i}`, def, owner: p, at: null, status: 'bench' }));
    }
  }

  figureAt(n: NodeId): Figure | undefined {
    return this.figures.find((f) => f.status === 'board' && f.at === n);
  }

  /** Put a bench figure on one of the player's spawn nodes. */
  deploy(uid: string, node: NodeId): void {
    const f = this.mine(uid);
    if (f.status !== 'bench') throw new Error('figure is not on the bench');
    if (!this.board.def.spawns[f.owner].includes(node)) throw new Error('not a spawn node');
    if (this.figureAt(node)) throw new Error('node occupied');
    f.status = 'board';
    f.at = node;
    this.endTurn();
  }

  /** Nodes reachable within the figure's MP; stepping onto an enemy ends the path there. */
  reachable(f: Figure): Map<NodeId, number> {
    const dist = new Map<NodeId, number>([[f.at!, 0]]);
    const queue: NodeId[] = [f.at!];
    while (queue.length) {
      const cur = queue.shift()!;
      const d = dist.get(cur)!;
      if (d >= f.def.mp) continue;
      const occ = cur === f.at ? undefined : this.figureAt(cur);
      if (occ) continue; // an occupied node blocks further travel
      for (const nb of this.board.neighbors(cur)) {
        if (dist.has(nb)) continue;
        const other = this.figureAt(nb);
        if (other && other.owner === f.owner) continue;
        dist.set(nb, d + 1);
        queue.push(nb);
      }
    }
    dist.delete(f.at!);
    return dist;
  }

  move(uid: string, to: NodeId): BattleResult | null {
    const f = this.mine(uid);
    if (f.status !== 'board') throw new Error('figure is not on the board');
    if (!this.reachable(f).has(to)) throw new Error('unreachable node');

    const target = this.figureAt(to);
    let result: BattleResult | null = null;
    if (target) {
      result = battle(f, target, this.rules, this.rng);
      for (const k of result.ko) this.knockOut(k);
    }
    if (f.status === 'board') f.at = to;

    this.checkWin(f);
    if (this.winner === null) {
      this.checkEncirclement();
      this.endTurn();
    }
    return result;
  }

  legalMoveCount(p: PlayerId): number {
    let n = 0;
    for (const f of this.figures) {
      if (f.owner !== p) continue;
      if (f.status === 'board') n += this.reachable(f).size;
      if (f.status === 'bench') {
        n += this.board.def.spawns[p].filter((s) => !this.figureAt(s)).length;
      }
    }
    return n;
  }

  private mine(uid: string): Figure {
    if (this.winner !== null) throw new Error('game is over');
    const f = this.figures.find((x) => x.uid === uid);
    if (!f) throw new Error('unknown figure');
    if (f.owner !== this.current) throw new Error('not your figure');
    return f;
  }

  private knockOut(f: Figure): void {
    f.status = 'ko';
    f.at = null;
  }

  private checkWin(mover: Figure): void {
    if (mover.status === 'board' && mover.at === this.board.def.goals[(1 - mover.owner) as PlayerId]) {
      this.winner = mover.owner;
    }
  }

  /** A figure with every adjacent node held by enemies is knocked out without battle. */
  private checkEncirclement(): void {
    for (const f of this.figures) {
      if (f.status !== 'board') continue;
      const nbs = this.board.neighbors(f.at!);
      if (nbs.length && nbs.every((n) => this.figureAt(n)?.owner === 1 - f.owner)) this.knockOut(f);
    }
  }

  private endTurn(): void {
    this.current = (1 - this.current) as PlayerId;
    this.turn += 1;
    if (this.turn > this.rules.turnLimit) {
      this.winner = 'none'; // 'both-lose' and 'draw' are indistinguishable until scoring exists
      return;
    }
    if (this.legalMoveCount(this.current) === 0) this.winner = (1 - this.current) as PlayerId;
  }
}
