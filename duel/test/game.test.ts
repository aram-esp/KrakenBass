import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { battle } from '../src/battle.ts';
import { seeded } from '../src/rng.ts';
import { defaultRules } from '../src/rules.config.ts';
import type { BoardDef, Color, Figure, FigureDef, Move } from '../src/types.ts';

// Toy line board: A-B-C-D-E, goals at both ends. NOT the real board.
const board: BoardDef = {
  nodes: ['A', 'B', 'C', 'D', 'E'],
  edges: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E']],
  goals: { 0: 'A', 1: 'E' },
  spawns: { 0: ['B'], 1: ['D'] },
};
const mv = (color: Color, damage = 0, stars = 0): Move => ({ name: color, color, damage, stars });
const fig = (id: string, mp: number, move: Move): FigureDef =>
  ({ id, name: id, mp, wheel: [{ move, weight: 1 }] });
const asFigure = (def: FigureDef): Figure =>
  ({ uid: def.id, def, owner: 0, at: null, status: 'board' });
const fight = (a: Move, b: Move) =>
  battle(asFigure(fig('a', 1, a)), asFigure(fig('b', 1, b)), defaultRules, seeded(1)).ko.length;

test('colour matchup table', () => {
  const koOf = (a: Move, b: Move) => {
    const x = asFigure(fig('x', 1, a)), y = asFigure(fig('y', 1, b));
    return battle(x, y, defaultRules, seeded(1)).ko.map((k) => k.def.id);
  };
  assert.deepEqual(koOf(mv('red'), mv('white', 1)), ['x']);
  assert.deepEqual(koOf(mv('white', 5), mv('white', 3)), ['y']);
  assert.deepEqual(koOf(mv('gold', 10), mv('purple', 0, 3)), ['y']); // gold beats purple, any damage > 0 KOs
  assert.deepEqual(koOf(mv('white', 50), mv('gold', 10)), ['y']);     // white vs gold: damage compared
  assert.deepEqual(koOf(mv('gold', 50), mv('white', 60)), ['x']);
});

test('blue dodges and purple wins apply no KO', () => {
  assert.equal(fight(mv('blue'), mv('white', 9)), 0);
  assert.equal(fight(mv('purple', 0, 1), mv('white', 9)), 0);
});

test('ties do nothing', () => {
  assert.equal(fight(mv('white', 4), mv('white', 4)), 0);
  assert.equal(fight(mv('red'), mv('red')), 0);
  assert.equal(fight(mv('purple', 0, 1), mv('purple', 0, 1)), 0);
});

test('battle triggers when a move ends next to an enemy', () => {
  const g = new Game(board, [[fig('a', 3, mv('white', 5))], [fig('b', 3, mv('white', 1))]], seeded(1));
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'D');
  const r = g.move('0:0', 'C'); // C is adjacent to D
  assert.equal(r!.ko[0].uid, '1:0');
  assert.equal(g.figures[1].status, 'ko');
});

test('moves cannot enter an occupied node', () => {
  const g = new Game(board, [[fig('a', 4, mv('white', 5))], [fig('b', 1, mv('white', 1))]], seeded(1));
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'D');
  assert.throws(() => g.move('0:0', 'D'), /unreachable/);
});

test('losing your last figure loses (no legal moves)', () => {
  const g = new Game(board, [[fig('a', 1, mv('white', 1))], [fig('b', 4, mv('white', 5))]], seeded(1));
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'D');
  g.move('0:0', 'A'); // own goal: no win
  assert.equal(g.winner, null);
  g.move('1:0', 'B'); // adjacent to A: battle, p1's white 5 beats white 1, p0's only figure is out
  assert.equal(g.figures[0].status, 'ko');
  assert.equal(g.winner, 1); // p0 has no legal moves
});

test('stepping onto the enemy goal wins', () => {
  const open: BoardDef = { ...board, spawns: { 0: ['B'], 1: ['A'] } };
  const g = new Game(open, [[fig('a', 3, mv('blue'))], [fig('b', 1, mv('blue'))]], seeded(1));
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'A'); // deploying is not a move: no battle, no win
  assert.equal(g.winner, null);
  g.move('0:0', 'E'); // B-C-D-E is 3 steps; E is p1's goal
  assert.equal(g.winner, 0);
});

test('encircled figure is knocked out without battle', () => {
  const g = new Game(board, [[fig('a', 1, mv('blue'))], [fig('b', 4, mv('blue'))]], seeded(1));
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'D');
  g.move('0:0', 'A'); // A's only neighbour is B
  g.move('1:0', 'B'); // enemy now holds B: A is surrounded
  assert.equal(g.figures[0].status, 'ko');
});

test('turn limit ends the game', () => {
  const g = new Game(board, [[fig('a', 1, mv('blue'))], [fig('b', 1, mv('blue'))]], seeded(1), { ...defaultRules, turnLimit: 3 });
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'D');
  g.move('0:0', 'C');
  assert.equal(g.winner, 'none');
});

test('cannot move opponent figures', () => {
  const g = new Game(board, [[fig('a', 1, mv('blue'))], [fig('b', 1, mv('blue'))]], seeded(1));
  g.deploy('0:0', 'B');
  assert.throws(() => g.move('0:0', 'C'), /not your figure/);
});

test('real board: 28 nodes, 34 edges, 180-degree symmetric', async () => {
  const { readFileSync } = await import('node:fs');
  const b = JSON.parse(readFileSync(new URL('../data/board.json', import.meta.url), 'utf8'));
  assert.equal(b.nodes.length, 28);
  assert.equal(b.edges.length, 34);
  const flip = (n: string) => {
    const m: Record<string, string> = { C1: 'C3', C3: 'C1', I1a: 'I3b', I3b: 'I1a', I1b: 'I3a', I3a: 'I1b', I2a: 'I2b', I2b: 'I2a' };
    if (m[n]) return m[n];
    const r = n[0], i = Number(n.slice(1));
    if (r === 'T') return 'B' + (6 - i);
    if (r === 'B') return 'T' + (6 - i);
    if (r === 'L') return 'R' + (4 - i);
    if (r === 'R') return 'L' + (4 - i);
    return n;
  };
  const key = (x: string, y: string) => [x, y].sort().join('-');
  const edges = new Set(b.edges.map(([x, y]: string[]) => key(x, y)));
  for (const [x, y] of b.edges) assert.ok(edges.has(key(flip(x), flip(y))), `asymmetric edge ${x}-${y}`);
});
