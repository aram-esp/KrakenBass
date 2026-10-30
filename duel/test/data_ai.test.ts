import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.ts';
import { aiTurn } from '../src/ai.ts';
import { figurePool, GAME_VERSION, toFigureDef, wheelKeyAt, type FigureRecord } from '../src/data.ts';
import { seeded } from '../src/rng.ts';
import type { BoardDef, FigureDef } from '../src/types.ts';

const board: BoardDef = JSON.parse(readFileSync(new URL('../data/board.json', import.meta.url), 'utf8'));
const records: FigureRecord[] = JSON.parse(readFileSync(new URL('../data/figures.json', import.meta.url), 'utf8'));
const pool: FigureDef[] = records.map((r) => toFigureDef(r));

test('every real figure converts to a usable wheel', () => {
  assert.equal(pool.length, records.length);
  for (const d of pool) {
    assert.ok(d.wheel.length > 0, d.id);
    assert.ok(d.wheel.every((s) => s.weight > 0));
    assert.ok(d.mp >= 0 && d.mp <= 3, `${d.name} mp ${d.mp}`);
  }
});

test('Pikachu keeps its known wheel: 24/12/24/8/24/4 = 96', () => {
  const pika = records.find((r) => r.title === 'Pikachu (Duel 52)')!;
  const d = toFigureDef(pika);
  assert.equal(d.wheel.reduce((s, x) => s + x.weight, 0), 96);
  assert.equal(d.mp, 2);
});

test('launch pool (game version 1.0.0): 82 figures, only 3 EX', () => {
  assert.equal(GAME_VERSION, '1.0.0');
  const launch = figurePool(records);
  assert.equal(launch.length, 82);
  const byId = new Map(records.map((r) => [String(r.id), r]));
  assert.deepEqual(launch.filter((d) => byId.get(d.id)!.rarity === 'EX').map((d) => d.name).sort(), ['Dialga', 'Palkia', 'Venusaur']);
  assert.ok(launch.every((d) => d.wheel.length > 1), 'every launch figure has a real wheel');
});

test('pre-Mega pool (game version 3.0.12): 265 figures, no Mega, no UX, period wheels', () => {
  const old = figurePool(records, '3.0.12');
  assert.equal(old.length, 265);
  const byId = new Map(records.map((r) => [String(r.id), r]));
  for (const d of old) {
    const r = byId.get(d.id)!;
    assert.notEqual(r.rarity, 'UX', d.name);
    assert.ok(!d.name.startsWith('Mega '), d.name);
    assert.ok(d.wheel.every((s) => s.weight > 0));
  }
  assert.ok(!old.some((d) => d.name.includes('Necrozma')));
  const find = (title: string) => records.find((r) => r.title === title)!;
  const charmeleon = records.find((r) => r.name === 'Charmeleon')!;
  assert.equal(wheelKeyAt(charmeleon, '3.0.12'), 'Version 1.3.2-6.2.9');
  assert.equal(wheelKeyAt(charmeleon, null), 'Version 7.0.10');
  // Lapras's Surf was 60 damage on a 36 piece until 4.0.8, later 70 and 100 on 28.
  const surf = (v: string | null) => toFigureDef(find('Lapras (Duel 102)'), v).wheel.find((x) => x.move.name === 'Surf')!;
  assert.deepEqual([surf('3.0.12').move.damage, surf('3.0.12').weight], [60, 36]);
  assert.deepEqual([surf(null).move.damage, surf(null).weight], [100, 28]);
});

test('200 AI-vs-AI duels with random real decks always terminate legally', () => {
  const rng = seeded(7);
  const pick = () => Array.from({ length: 6 }, () => pool[Math.floor(rng() * pool.length)]);
  const results = { 0: 0, 1: 0, none: 0 } as Record<string, number>;
  for (let i = 0; i < 200; i++) {
    const g = new Game(board, [pick(), pick()], seeded(i));
    let guard = 0;
    while (g.winner === null) {
      aiTurn(g, rng);
      assert.ok(++guard < 1000, 'duel did not end');
    }
    results[String(g.winner)]++;
  }
  assert.equal(results[0] + results[1] + results.none, 200);
  console.log('results', results);
});

test('an unblocked 3-MP runner that moves first reaches the goal on its third turn (AI rush)', () => {
  const runner: FigureDef = { id: 'r', name: 'runner', mp: 3, wheel: [{ move: { name: 'Miss', color: 'red', damage: 0 }, weight: 1 }] };
  const idle: FigureDef = { id: 'i', name: 'idle', mp: 1, wheel: [{ move: { name: 'Miss', color: 'red', damage: 0 }, weight: 1 }] };
  const g = new Game(board, [[idle], [runner]], seeded(1), undefined, 1);
  const rng = seeded(3);
  while (g.winner === null) {
    if (g.current === 1) aiTurn(g, rng); else g.endTurn();
  }
  assert.equal(g.winner, 1);
  assert.equal(g.turn, 5); // AI turns are 1, 3 and 5: MP 2 + 3 + 3 covers the 7 MP needed (1 to enter + 6 steps)
});
