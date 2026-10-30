import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.ts';
import { battle } from '../src/battle.ts';
import { seeded } from '../src/rng.ts';
import { defaultRules, houseRules } from '../src/rules.config.ts';
import type { BoardDef, Color, Figure, FigureDef, Move } from '../src/types.ts';

const board: BoardDef = JSON.parse(readFileSync(new URL('../data/board.json', import.meta.url), 'utf8'));
const mv = (color: Color, damage = 0, stars = 0): Move => ({ name: color, color, damage, stars });
const fig = (id: string, mp: number, move: Move = mv('white', 50)): FigureDef =>
  ({ id, name: id, mp, wheel: [{ move, weight: 1 }] });
const game = (a: FigureDef[], b: FigureDef[], rules = defaultRules) => new Game(board, [a, b], seeded(1), rules);
const put = (g: Game, uid: string, node: string) => {
  const f = g.figures.find((x) => x.uid === uid)!;
  f.status = 'board';
  f.at = node;
};
const asFigure = (def: FigureDef): Figure => ({ uid: def.id, def, owner: 0, at: null, status: 'board', wait: 0 });
const koOf = (a: Move, b: Move) =>
  battle(asFigure(fig('x', 1, a)), asFigure(fig('y', 1, b)), defaultRules, seeded(1)).ko.map((k) => k.def.id);

test('colour matchup table', () => {
  assert.deepEqual(koOf(mv('red'), mv('white', 1)), ['x']);
  assert.deepEqual(koOf(mv('white', 5), mv('white', 3)), ['y']);
  assert.deepEqual(koOf(mv('gold', 10), mv('purple', 0, 3)), ['y']);
  assert.deepEqual(koOf(mv('white', 50), mv('gold', 10)), ['y']);
  assert.deepEqual(koOf(mv('gold', 50), mv('white', 60)), ['x']);
});

test('blue dodges, purple wins apply no KO, ties do nothing', () => {
  assert.deepEqual(koOf(mv('blue'), mv('white', 9)), []);
  assert.deepEqual(koOf(mv('purple', 0, 1), mv('white', 9)), []);
  assert.deepEqual(koOf(mv('white', 4), mv('white', 4)), []);
  assert.deepEqual(koOf(mv('red'), mv('red')), []);
});

test('first player has MP-1 on the first turn only', () => {
  const g = game([fig('a', 1), fig('b', 2)], [fig('c', 1)]);
  assert.equal(g.mp(g.figures[0]), 0);
  assert.equal(g.mp(g.figures[1]), 1);
  g.move('0:1', 'B0');
  g.endTurn();
  assert.equal(g.mp(g.figures[2]), 1); // second player is not penalised
  g.move('1:0', 'T0');
  g.endTurn();
  assert.equal(g.mp(g.figures[1]), 2); // back to normal
});

test('entering from the bench costs 1 MP and needs a free entry point', () => {
  const g = game([fig('a', 3)], [fig('c', 3)]);
  g.endTurn(); // p0 passes; p1 acts with full MP
  const r = g.reachable(g.figures[1]);
  assert.ok(r.has('T0') && r.has('T6')); // 1 MP: the entry points themselves
  assert.ok(r.has('T1') && r.has('L1') && r.has('I1a')); // 2 MP: one step from T0
  assert.ok(!r.has('T3')); // goal is 3 steps from an entry: 4 MP total
  g.figures[0].wait = 0;
  put(g, '0:0', 'T6'); // block one entry
  const r2 = g.reachable(g.figures[1]);
  assert.ok(r2.has('T0') && !r2.has('T6'));
});

test('moving a figure ends its movement for the turn but not the turn', () => {
  const g = game([fig('a', 3), fig('b', 3)], [fig('c', 3)]);
  g.endTurn(); g.endTurn();
  g.move('0:0', 'B0');
  assert.throws(() => g.move('0:1', 'B6'), /unreachable/);
  assert.equal(g.current, 0);
  g.endTurn();
  assert.equal(g.current, 1);
});

test('battle needs an adjacent enemy, ends the turn, KO goes to the P.C.', () => {
  const g = game([fig('a', 2, mv('white', 90))], [fig('c', 2, mv('white', 10))]);
  put(g, '0:0', 'C3');
  put(g, '1:0', 'B4'); // C3-B4 are connected
  assert.throws(() => g.battle('0:0', '0:0'), /adjacent enemy/);
  const r = g.battle('0:0', '1:0');
  assert.deepEqual(r.ko.map((k) => k.uid), ['1:0']);
  assert.equal(g.figures[1].status, 'pc');
  assert.equal(g.pc[1].length, 1);
  assert.equal(g.current, 1);
});

test('real rules: an attacker that loses is knocked out', () => {
  const g = game([fig('a', 2, mv('white', 10))], [fig('c', 2, mv('white', 90))]);
  put(g, '0:0', 'C3');
  put(g, '1:0', 'B4');
  const r = g.battle('0:0', '1:0');
  assert.deepEqual(r.ko.map((k) => k.uid), ['0:0']);
  assert.equal(r.counter, undefined);
});

test('house rule: a losing attacker is not knocked out, the defender counter-attacks and wins', () => {
  assert.equal(houseRules.attackerLoss, 'counter');
  const g = game([fig('a', 2, mv('white', 10))], [fig('c', 2, mv('white', 90))], houseRules);
  put(g, '0:0', 'C3');
  put(g, '1:0', 'B4');
  const seen: string[] = [];
  g.onBattle = (m, o, res, info) => seen.push(`${m.uid}>${o.uid} ko=${res.ko.map((k) => k.uid)} counter=${info.counter} saved=${info.saved}`);
  const r = g.battle('0:0', '1:0');
  assert.deepEqual(r.ko, []);
  assert.deepEqual(r.counter!.ko.map((k) => k.uid), ['0:0']);
  assert.equal(g.figures[0].status, 'pc');
  assert.equal(g.figures[1].status, 'board');
  assert.deepEqual(seen, ['0:0>1:0 ko= counter=false saved=true', '1:0>0:0 ko=0:0 counter=true saved=false']);
  assert.equal(g.current, 1);
});

test('house rule: a winning attacker gets no counter-attack; a defender in Wait cannot counter', () => {
  const win = game([fig('a', 2, mv('white', 90))], [fig('c', 2, mv('white', 10))], houseRules);
  put(win, '0:0', 'C3');
  put(win, '1:0', 'B4');
  const r1 = win.battle('0:0', '1:0');
  assert.deepEqual(r1.ko.map((k) => k.uid), ['1:0']);
  assert.equal(r1.counter, undefined);

  const waiting = game([fig('a', 2, mv('white', 10))], [fig('c', 2, mv('white', 90))], houseRules);
  put(waiting, '0:0', 'C3');
  put(waiting, '1:0', 'B4');
  waiting.setWait('1:0', 2);
  const r2 = waiting.battle('0:0', '1:0');
  assert.deepEqual(r2.ko, []);
  assert.equal(r2.counter, undefined);
  assert.equal(waiting.figures[0].status, 'board');
});

test('P.C. holds two: a third KO sends the oldest back to the bench', () => {
  const g = game([], [fig('a', 1), fig('b', 1), fig('c', 1)]);
  for (const f of g.figures) g.sendToPc(f);
  assert.deepEqual(g.pc[1].map((f) => f.uid), ['1:1', '1:2']);
  assert.equal(g.figures[0].status, 'bench');
});

test('Wait blocks movement and counts down every turn of either player', () => {
  const g = game([fig('a', 2)], [fig('c', 2)]);
  g.endTurn(); // turn 2 (p1)
  g.setWait('1:0', 2);
  assert.equal(g.reachable(g.figures[1]).size, 0);
  g.endTurn(); // wait 1
  g.endTurn(); // wait 0
  assert.equal(g.figures[1].wait, 0);
  assert.ok(g.reachable(g.figures[1]).size > 0);
});

test('stepping onto the enemy goal wins', () => {
  const g = game([fig('a', 3)], [fig('c', 1)]);
  g.endTurn(); g.endTurn();
  put(g, '0:0', 'T4');
  g.move('0:0', 'T3'); // T3 is the goal of player 1
  assert.equal(g.winner, 0);
});

test('stepping onto your own goal does not win', () => {
  const g = game([fig('a', 3)], [fig('c', 1)]);
  g.endTurn(); g.endTurn();
  put(g, '0:0', 'B4');
  g.move('0:0', 'B3');
  assert.equal(g.winner, null);
});

test('no legal action loses (Wait win)', () => {
  const g = game([fig('a', 2)], [fig('c', 2)]);
  g.setWait('1:0', 5);
  g.endTurn(); // p1 to move with only a waiting bench figure
  assert.equal(g.winner, 0);
});

test('encircled figure is knocked out without battle', () => {
  const g = game([fig('a', 1)], [fig('c', 1), fig('d', 1), fig('e', 1)]);
  put(g, '0:0', 'B0');
  put(g, '1:0', 'B1');
  put(g, '1:1', 'L3');
  put(g, '1:2', 'I3a');
  g.settle();
  assert.equal(g.figures[0].status, 'pc');
});

test('turn limit ends the game with no winner', () => {
  const g = game([fig('a', 1)], [fig('c', 1)], { ...defaultRules, turnLimit: 3 });
  g.endTurn(); g.endTurn();
  assert.equal(g.winner, null);
  g.endTurn();
  assert.equal(g.winner, 'none');
});

test('cannot move opponent figures or act after the game', () => {
  const g = game([fig('a', 2)], [fig('c', 2)]);
  assert.throws(() => g.move('1:0', 'T0'), /not your figure/);
});

test('real board: 28 nodes, 34 edges, 180-degree symmetric', () => {
  assert.equal(board.nodes.length, 28);
  assert.equal(board.edges.length, 34);
  const m: Record<string, string> = { C1: 'C3', C3: 'C1', I1a: 'I3b', I3b: 'I1a', I1b: 'I3a', I3a: 'I1b', I2a: 'I2b', I2b: 'I2a' };
  const flip = (n: string) => {
    if (m[n]) return m[n];
    const r = n[0], i = Number(n.slice(1));
    if (r === 'T') return 'B' + (6 - i);
    if (r === 'B') return 'T' + (6 - i);
    if (r === 'L') return 'R' + (4 - i);
    if (r === 'R') return 'L' + (4 - i);
    return n;
  };
  const key = (x: string, y: string) => [x, y].sort().join('-');
  const edges = new Set(board.edges.map(([x, y]) => key(x, y)));
  for (const [x, y] of board.edges) assert.ok(edges.has(key(flip(x), flip(y))), `asymmetric ${x}-${y}`);
});
