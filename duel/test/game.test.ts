import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { seeded } from '../src/rng.ts';
import { defaultRules } from '../src/rules.config.ts';
import type { BoardDef, FigureDef, Move } from '../src/types.ts';

// Toy line board: A-B-C-D-E, goals at both ends. NOT the real 26-point map.
const board: BoardDef = {
  nodes: ['A', 'B', 'C', 'D', 'E'],
  edges: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E']],
  goals: { 0: 'A', 1: 'E' },
  spawns: { 0: ['B'], 1: ['D'] },
};
const hit = (damage: number): Move => ({ name: `hit${damage}`, color: 'white', damage });
const fig = (id: string, mp: number, damage: number): FigureDef =>
  ({ id, name: id, mp, wheel: [{ move: hit(damage), weight: 1 }] });

test('equal damage knocks out both under the placeholder tie rule', () => {
  const g = new Game(board, [[fig('a', 3, 1)], [fig('b', 3, 1)]], seeded(1));
  g.deploy('0:0', 'B'); // p0
  g.deploy('1:0', 'D'); // p1
  g.move('0:0', 'C');   // p0
  g.move('1:0', 'C');   // p1 attacks C, tie -> both KO under default rules
  assert.equal(g.figures.every((f) => f.status === 'ko'), true);
});

test('higher damage wins the battle', () => {
  const g = new Game(board, [[fig('a', 3, 5)], [fig('b', 3, 1)]], seeded(1));
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'D');
  const r = g.move('0:0', 'C');
  assert.equal(r, null); // C is empty
  const r2 = g.move('1:0', 'C'); // weaker attacker loses
  assert.equal(r2!.ko[0].uid, '1:0');
  assert.equal(g.figureAt('C')?.uid, '0:0');
});

test('encircled figure is knocked out and no legal moves loses', () => {
  const g = new Game(board, [[fig('a', 4, 5)], [fig('b', 1, 1)]], seeded(1));
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'D');
  g.move('0:0', 'C');
  g.move('1:0', 'E');
  g.move('0:0', 'D'); // E is a dead end: its only neighbour D is now enemy-held
  assert.equal(g.figures[1].status, 'ko');
  assert.equal(g.winner, 0);
});

test('reaching the enemy goal wins', () => {
  const g = new Game(board, [[fig('a', 1, 1)], [fig('b', 4, 5)]], seeded(1));
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'D');
  g.move('0:0', 'A'); // p0 steps onto its own goal: no win
  assert.equal(g.winner, null);
  g.move('1:0', 'A'); // p1 travels D-C-B-A, beats p0's figure and lands on p0's goal
  assert.equal(g.winner, 1);
});

test('turn limit ends the game', () => {
  const g = new Game(board, [[fig('a', 1, 1)], [fig('b', 1, 1)]], seeded(1), { ...defaultRules, turnLimit: 3 });
  g.deploy('0:0', 'B');
  g.deploy('1:0', 'D');
  assert.equal(g.winner, null);
  g.move('0:0', 'C');
  assert.equal(g.winner, 'none');
});

test('cannot move opponent figures', () => {
  const g = new Game(board, [[fig('a', 1, 1)], [fig('b', 1, 1)]], seeded(1));
  g.deploy('0:0', 'B');
  assert.throws(() => g.move('0:0', 'C'), /not your figure/);
});
