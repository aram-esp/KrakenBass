import { Board } from './board.ts';
import { battle, type BattleResult } from './battle.ts';
import type { BoardDef, Figure, FigureDef, NodeId, PlayerId } from './types.ts';
import type { Rng } from './rng.ts';
import { defaultRules, type RulesConfig } from './rules.config.ts';

export type Winner = PlayerId | 'none';

/**
 * One duel. A turn is: optionally move one figure (a bench figure enters through a free
 * entry point for 1 MP), then optionally battle an adjacent enemy (which ends the turn),
 * or call endTurn(). Plates, abilities, special conditions and Mega/Z-Moves are not modelled yet.
 */
export class Game {
  readonly board: Board;
  readonly figures: Figure[] = [];
  readonly pc: Record<PlayerId, Figure[]> = { 0: [], 1: [] };
  turn = 1;
  current: PlayerId;
  winner: Winner | null = null;
  /**
   * Called after every battle, e.g. so a UI can show the wheels. `counter`: this is the defender's counter-attack;
   * `saved`: the mover lost but was not knocked out because a counter-attack follows (rules.attackerLoss 'counter').
   */
  onBattle?: (mover: Figure, other: Figure, result: BattleResult, info: { counter: boolean; saved: boolean }) => void;
  /** Called just before a battle changes anything, e.g. so a UI can draw the board as it stands. */
  onBeforeBattle?: () => void;
  private moved = false;
  private firstPlayer: PlayerId;
  private rng: Rng;
  private rules: RulesConfig;

  constructor(
    boardDef: BoardDef,
    decks: [FigureDef[], FigureDef[]],
    rng: Rng,
    rules: RulesConfig = defaultRules,
    first: PlayerId = 0,
  ) {
    this.board = new Board(boardDef);
    this.rng = rng;
    this.rules = rules;
    this.firstPlayer = first;
    this.current = first;
    for (const p of [0, 1] as PlayerId[]) {
      decks[p].forEach((def, i) =>
        this.figures.push({ uid: `${p}:${i}`, def, owner: p, at: null, status: 'bench', wait: 0 }));
    }
  }

  figureAt(n: NodeId): Figure | undefined {
    return this.figures.find((f) => f.status === 'board' && f.at === n);
  }

  /** MP available to this figure right now. */
  mp(f: Figure): number {
    const penalty = f.owner === this.firstPlayer && this.turn === 1 ? this.rules.firstTurnMpPenalty : 0;
    return Math.max(0, f.def.mp - penalty);
  }

  /** Destinations for this figure's MP move. Occupied nodes block; bench figures pay 1 MP to enter. */
  reachable(f: Figure): Set<NodeId> {
    const out = new Set<NodeId>();
    const mp = this.mp(f);
    if (f.wait > 0 || mp < 1 || this.moved) return out;
    const dist = new Map<NodeId, number>();
    const queue: NodeId[] = [];
    if (f.status === 'bench') {
      for (const s of this.board.def.spawns[f.owner]) {
        if (!this.figureAt(s)) { dist.set(s, 1); queue.push(s); }
      }
    } else if (f.status === 'board') {
      dist.set(f.at!, 0);
      queue.push(f.at!);
    } else {
      return out;
    }
    while (queue.length) {
      const cur = queue.shift()!;
      const d = dist.get(cur)!;
      if (d >= mp) continue;
      for (const nb of this.board.neighbors(cur)) {
        if (dist.has(nb) || this.figureAt(nb)) continue;
        dist.set(nb, d + 1);
        queue.push(nb);
      }
    }
    for (const n of dist.keys()) if (n !== f.at) out.add(n);
    return out;
  }

  adjacentEnemies(f: Figure): Figure[] {
    if (f.status !== 'board') return [];
    return this.board.neighbors(f.at!)
      .map((n) => this.figureAt(n))
      .filter((o): o is Figure => !!o && o.owner !== f.owner);
  }

  move(uid: string, to: NodeId): void {
    const f = this.mine(uid);
    if (!this.reachable(f).has(to)) throw new Error('unreachable node');
    f.status = 'board';
    f.at = to;
    this.moved = true;
    if (to === this.board.def.goals[(1 - f.owner) as PlayerId]) {
      this.winner = f.owner;
      return;
    }
    this.settle();
  }

  /** Battle an adjacent enemy. Allowed before or after moving; ends the turn. */
  /** Battle an adjacent enemy. With rules.attackerLoss 'counter', `counter` holds the defender's counter-attack. */
  battle(uid: string, targetUid: string): BattleResult & { counter?: BattleResult } {
    const f = this.mine(uid);
    if (f.status !== 'board' || f.wait > 0) throw new Error('figure cannot attack');
    const target = this.adjacentEnemies(f).find((e) => e.uid === targetUid);
    if (!target) throw new Error('target is not an adjacent enemy');
    this.onBeforeBattle?.();
    const first = battle(f, target, this.rules, this.rng);
    const saved = this.rules.attackerLoss === 'counter' && first.ko.includes(f);
    const result: BattleResult & { counter?: BattleResult } = { ...first, ko: first.ko.filter((k) => !saved || k !== f) };
    for (const k of result.ko) this.sendToPc(k);
    this.onBattle?.(f, target, result, { counter: false, saved });
    if (saved && target.wait === 0) {
      // The defender spins against the attacker; only the attacker can fall in a counter-attack.
      const c = battle(target, f, this.rules, this.rng);
      result.counter = { ...c, ko: c.ko.filter((k) => k === f) };
      for (const k of result.counter.ko) this.sendToPc(k);
      this.onBattle?.(target, f, result.counter, { counter: true, saved: false });
    }
    this.settle();
    this.endTurn();
    return result;
  }

  endTurn(): void {
    if (this.winner !== null) throw new Error('game is over');
    for (const f of this.figures) if (f.wait > 0) f.wait -= 1;
    this.current = (1 - this.current) as PlayerId;
    this.turn += 1;
    this.moved = false;
    if (this.turn > this.rules.turnLimit) { this.winner = 'none'; return; }
    if (this.legalActionCount(this.current) === 0) this.winner = (1 - this.current) as PlayerId;
  }

  setWait(uid: string, turns: number): void {
    const f = this.figures.find((x) => x.uid === uid);
    if (!f) throw new Error('unknown figure');
    f.wait = turns;
  }

  /** Send a figure to its owner's P.C.; a full P.C. pushes its oldest figure back to the bench. */
  sendToPc(f: Figure): void {
    f.status = 'pc';
    f.at = null;
    this.pc[f.owner].push(f);
    while (this.pc[f.owner].length > this.rules.pcSize) {
      const back = this.pc[f.owner].shift()!;
      back.status = 'bench';
    }
  }

  /** A figure with every adjacent spot held by enemies is knocked out without battle. */
  settle(): void {
    for (const f of this.figures) {
      if (f.status !== 'board') continue;
      const nbs = this.board.neighbors(f.at!);
      if (nbs.length && nbs.every((n) => this.figureAt(n)?.owner === 1 - f.owner)) this.sendToPc(f);
    }
  }

  legalActionCount(p: PlayerId): number {
    const wasMoved = this.moved;
    this.moved = false;
    let n = 0;
    for (const f of this.figures) {
      if (f.owner !== p) continue;
      n += this.reachable(f).size;
      if (f.status === 'board' && f.wait === 0) n += this.adjacentEnemies(f).length;
    }
    this.moved = wasMoved;
    return n;
  }

  private mine(uid: string): Figure {
    if (this.winner !== null) throw new Error('game is over');
    const f = this.figures.find((x) => x.uid === uid);
    if (!f) throw new Error('unknown figure');
    if (f.owner !== this.current) throw new Error('not your figure');
    return f;
  }
}
