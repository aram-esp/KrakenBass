import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_WEIGHTS, type Features } from '../src/ai.ts';
import { guestsWaiting, GUEST_EVERY_MS, learnFrom, levelOf, newWorker, noiseAt, personality, playHeadless, EXP_PER_LEVEL } from '../src/amiibo.ts';
import { figurePool } from '../src/data.ts';
import { seeded } from '../src/rng.ts';

const feat = (o: Partial<Features>): Features => ({ danger: 0, danger2: 0, threat: 0, progress: 0, progressAll: 0, onBoard: 0, surround: 0, guardGoal: 0, koValue: 0, exposure: 0, noise: 0, ...o });

test('the worker copies the player: a player who guards the goal makes it defensive', () => {
  const w = newWorker('52', 'Pika', [], [], 0);
  assert.equal(personality(w.weights), 'Normal');
  for (let i = 0; i < 40; i++) learnFrom(w, feat({ guardGoal: 1, danger2: 0, progress: -6 }), feat({ guardGoal: 0, danger2: -1, progress: -4 }));
  assert.ok(w.weights.guardGoal > DEFAULT_WEIGHTS.guardGoal && w.weights.danger2 > DEFAULT_WEIGHTS.danger2);
  assert.ok(w.weights.progress < DEFAULT_WEIGHTS.progress);
  assert.match(personality(w.weights), /Cauto|Realista|Imperturbable/);
  w.learn = false;
  const before = { ...w.weights };
  learnFrom(w, feat({ threat: 1 }), feat({}));
  assert.deepEqual(w.weights, before, 'learning off: no change');
});

test('levels, noise and guests', () => {
  const w = newWorker('52', 'Pika', [], [], 0);
  assert.equal(levelOf(w), 1);
  w.exp = EXP_PER_LEVEL * 100;
  assert.equal(levelOf(w), 50);
  assert.ok(noiseAt(1) > noiseAt(50));
  assert.equal(guestsWaiting(w, GUEST_EVERY_MS * 3 + 5), 3);
  assert.equal(guestsWaiting(w, GUEST_EVERY_MS * 100), 8);
});

test('a guest duel plays to the end with no screen', () => {
  const board = JSON.parse(readFileSync(new URL('../data/board.json', import.meta.url), 'utf8'));
  const pool = figurePool(JSON.parse(readFileSync(new URL('../data/figures.json', import.meta.url), 'utf8')));
  const rng = seeded(4);
  const r = playHeadless(board, pool.slice(0, 6), pool.slice(6, 12), [], [], DEFAULT_WEIGHTS, undefined, rng, seeded);
  assert.equal(typeof r, 'boolean');
});

test('AI styles differ, hotel stages get styles, the worker can be set by hand', async () => {
  const { AI_STYLES, styleWeights } = await import('../src/ai.ts');
  const { hotelStyle, HOTELS } = await import('../src/story.ts');
  const { workerWeights } = await import('../src/amiibo.ts');
  const ws = AI_STYLES.map((s) => JSON.stringify(styleWeights(s.key)));
  assert.equal(new Set(ws).size, AI_STYLES.length, 'every style has its own weights');
  assert.equal(hotelStyle(0, 0).key, 'rookie');
  assert.equal(hotelStyle(2, HOTELS[2].stages - 1).leader, true);
  const w = newWorker('52', 'Pika', [], [], 0);
  const low = workerWeights(w);
  w.exp = 1e9;
  const high = workerWeights(w);
  assert.ok(low.noise > high.noise && low.danger < high.danger, 'a low-level worker makes more mistakes');
});

test('berries: one a day, each nudges its branch; lessons from a duel are learned only when asked', async () => {
  const { giveBerry, berryWait, BERRY_EVERY_MS, learnLessons, branchScores } = await import('../src/amiibo.ts');
  const w = newWorker('52', 'Pika', [], [], 0);
  const def0 = branchScores(w.weights).find((b) => b.key === 'def')!.ratio;
  assert.equal(giveBerry(w, 'aranja', 1000), null);
  assert.ok(branchScores(w.weights).find((b) => b.key === 'def')!.ratio > def0);
  assert.match(giveBerry(w, 'zreza', 2000)!, /hoy/);
  assert.ok(berryWait(w, 2000) > 0);
  assert.equal(giveBerry(w, 'zreza', 1000 + BERRY_EVERY_MS), null);
  w.learn = false;
  const n = learnLessons(w, [{ chosen: feat({ guardGoal: 1 }), own: feat({}) }]);
  assert.equal(n, 1, 'lessons are learned even with training-learning off (the player said yes)');
  assert.equal(w.learn, false);
});
