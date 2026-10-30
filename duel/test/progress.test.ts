import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FigureDef } from '../src/types.ts';
import { applyProgress, boosterItems, CHAIN_COPIES, freePoints, fuse, fusionPreview, levelOf, LEVEL_EXP, METAL_EXP, newProgress,
  placePoint, progOf, sellIngot, useCarmonite, figurePrice, SELL_LV1, duelExp, type ProgressState } from '../src/progress.ts';

const def: FigureDef = { id: 'a', name: 'A', mp: 2, wheel: [
  { weight: 40, move: { name: 'Tackle', color: 'white', damage: 40 } },
  { weight: 30, move: { name: 'Dodge', color: 'blue', damage: 0 } },
  { weight: 20, move: { name: 'Poison', color: 'purple', damage: 0, stars: 2 } },
  { weight: 6, move: { name: 'Miss', color: 'red', damage: 0 } },
] };
const rar = () => 'Common' as const;
const state = (): ProgressState => ({ owned: { a: 3, b: 2 }, wallet: { coins: 100000, material: 0, carmonite: 100,
  items: { metal: { Common: 4, Uncommon: 0, Rare: 0, EX: 0 }, cube: { Common: 30, Uncommon: 0, Rare: 0, EX: 0 }, ingot: { Common: 1, Uncommon: 0, Rare: 0, EX: 0 } } } });

test('levels follow experience and stop at 5; points only on non-Miss pieces', () => {
  const p = newProgress(4);
  assert.equal(levelOf(p, 'Common'), 1);
  p.exp = LEVEL_EXP.Common[4];
  assert.equal(levelOf(p, 'Common'), 5);
  assert.equal(freePoints(p, 'Common').level, 4);
  assert.equal(placePoint(def, p, 'Common', 3, 'grow'), false, 'Miss cannot grow');
  for (let k = 0; k < 4; k++) assert.ok(placePoint(def, p, 'Common', 0, 'grow'));
  assert.equal(placePoint(def, p, 'Common', 1, 'grow'), false, 'no points left');
  const d = applyProgress(def, p);
  assert.equal(d.wheel.reduce((t, s) => t + s.weight, 0), 100, '96 + 4 = 100 at level 5 (Serebii)');
  assert.ok(placePoint(def, p, 'Common', 0, 'undo'));
  assert.equal(freePoints(p, 'Common').level, 1);
});

test('fusion: metals give exp, same-figure copies and cubes give Chain Levels, coins are spent', () => {
  const s = state();
  const pv = fusionPreview('a', 'Common', { figures: {}, items: { metal: { Common: 2 } } }, rar, {});
  assert.equal(pv.exp, 2 * METAL_EXP.Common);
  assert.equal(fuse(s, def, 'Common', { figures: { a: 3 }, items: {} }, rar), 'No tienes tantas copias.', 'keeps one copy');
  assert.equal(fuse(s, def, 'Common', { figures: { a: 2, b: 2 }, items: { metal: { Common: 4 }, cube: { Common: 28 } } }, rar), null);
  const p = s.prog!.a;
  assert.equal(levelOf(p, 'Common'), 5);
  assert.equal(p.clv, 1, `${CHAIN_COPIES.Common} chain points = 1 Chain Level for a C`);
  assert.equal(s.owned.a, 1);
  assert.equal(s.owned.b, undefined);
  assert.ok(placePoint(def, p, 'Common', 0, 'dmg'));
  assert.equal(placePoint(def, p, 'Common', 1, 'dmg'), false);
  assert.equal(applyProgress(def, p).wheel[0].move.damage, 41);
  assert.ok(s.wallet!.coins < 100000);
});

test('Carmonite: level 6+ swaps one piece up and another (> 4) down', () => {
  const s = state();
  const p = progOf(s, 'a', 4);
  assert.match(useCarmonite(s, def, 'Common')!, /nivel 5/);
  p.exp = LEVEL_EXP.Common[4];
  assert.equal(useCarmonite(s, def, 'Common'), null);
  assert.equal(levelOf(p, 'Common'), 6);
  for (let k = 0; k < 4; k++) placePoint(def, p, 'Common', 0, 'grow');
  assert.equal(placePoint(def, p, 'Common', 0, 'grow'), false);
  assert.ok(placePoint(def, p, 'Common', 0, 'grow', 1));
  assert.equal(applyProgress(def, p).wheel.reduce((t, x) => t + x.weight, 0), 100);
  assert.equal(placePoint(def, p, 'Common', 0, 'grow', 1), false, 'one swap per Carmonite level');
  assert.ok(placePoint(def, p, 'Common', 0, 'undo'));
  assert.deepEqual(p.size, [4, 0, 0, 0]);
});

test('selling, duel experience and booster contents', () => {
  const s = state();
  assert.equal(sellIngot(s, 'Common'), 1800);
  assert.equal(sellIngot(s, 'Common'), 0);
  assert.equal(figurePrice('Common', undefined), SELL_LV1.Common);
  assert.equal(figurePrice('Common', { ...newProgress(4), exp: LEVEL_EXP.Common[4] }), 2320);
  duelExp(s, [def], false, rar);
  assert.equal(s.prog!.a.exp, 100);
  assert.equal(boosterItems(s, 'white', () => 0.1).length, 1);
  assert.equal(boosterItems(s, 'gold', () => 0.1).length, 2);
  assert.equal(boosterItems(s, 'welcome', () => 0.1).length, 0);
});
