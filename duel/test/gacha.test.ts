import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { figurePool, type FigureRecord } from '../src/data.ts';
import { seeded } from '../src/rng.ts';
import {
  BOOSTERS, CASE_SLOTS, EVOLVE_BATTLES, EVOLVE_DUELS, evolve, evolveProgress, recordBattle, recordDuel, GEMS_LOSS, GEMS_WIN, SHOP_PRICE, buyBooster, gemsToOpenNow, loadState, newState, openBooster,
  openFromCase, openReady, rewardDuel, rollRarity,
} from '../src/gacha.ts';

const records: FigureRecord[] = JSON.parse(readFileSync(new URL('../data/figures.json', import.meta.url), 'utf8'));
const rarity = new Map(records.map((r) => [String(r.id), r.rarity]));
const pool = figurePool(records).map((d) => ({ id: d.id, rarity: rarity.get(d.id)! }));

test('booster types and times follow the Fandom table', () => {
  assert.deepEqual(['white', 'blue', 'purple', 'gold', 'rainbow'].map((k) => BOOSTERS[k as 'white'].hours), [1, 3, 6, 12, 24]);
  assert.deepEqual(BOOSTERS.gold.slots, ['Rare', 'Common']);
  assert.deepEqual(BOOSTERS.rainbow.slots, ['EX', 'Common', 'Common']);
  assert.equal(SHOP_PRICE, 50);
});

test('a slot never gives less than its minimum rarity', () => {
  const have = new Set(['Common', 'Uncommon', 'Rare', 'EX']);
  const rng = seeded(5);
  for (let i = 0; i < 2000; i++) {
    assert.ok(['Rare', 'EX'].includes(rollRarity('Rare', have, rng)));
    assert.equal(rollRarity('EX', have, rng), 'EX');
    assert.notEqual(rollRarity('Uncommon', have, rng), 'Common');
  }
});

test('a new player opens the welcome boosters and owns 8 different figures, all from the pool', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = newState();
    const rng = seeded(seed);
    while (openReady(s, pool, rng));
    const ids = Object.keys(s.owned);
    assert.equal(ids.length, 8, 'welcome boosters give 8 different figures');
    assert.ok(ids.every((id) => pool.some((p) => p.id === id)));
  }
});

test('rainbow booster gives an EX from the 1.0.0 pool', () => {
  const s = newState();
  const got = openBooster(s, 'rainbow', pool, seeded(3));
  assert.equal(got.length, 3);
  assert.equal(rarity.get(got[0]), 'EX');
});

test('duel rewards: gems, a timed booster, and a case that holds at most 4', () => {
  const s = newState();
  const rng = seeded(2);
  const b = rewardDuel(s, true, 1000, rng)!;
  assert.equal(s.gems, GEMS_WIN);
  assert.equal(b.readyAt, 1000 + BOOSTERS[b.kind].hours * 3_600_000);
  for (let i = 0; i < 10; i++) rewardDuel(s, false, 1000, rng);
  assert.equal(s.case.length, CASE_SLOTS);
  assert.equal(s.gems, GEMS_WIN + 10 * GEMS_LOSS);
});

test('a case booster opens free when ready, or now for gems', () => {
  const s = newState();
  s.case.push({ kind: 'gold', readyAt: 10 * 3_600_000 });
  s.case.push({ kind: 'white', readyAt: 0 });
  assert.equal(gemsToOpenNow(10 * 3_600_000), 60);
  assert.equal(openFromCase(s, 0, 0, pool, seeded(1)), null, 'not enough gems');
  assert.equal(openFromCase(s, 1, 5, pool, seeded(1))!.length, 1);
  s.gems = 60;
  assert.equal(openFromCase(s, 0, 0, pool, seeded(1))!.length, 2);
  assert.equal(s.gems, 0);
  assert.equal(s.case.length, 0);
});

test('shop booster costs 50 gems; saved state round-trips; bad saves start fresh', () => {
  const s = newState();
  s.ready = [];
  assert.equal(buyBooster(s), false);
  s.gems = 70;
  assert.equal(buyBooster(s), true);
  assert.equal(s.gems, 20);
  assert.equal(s.ready[0].kind, 'shop');
  assert.deepEqual(loadState(JSON.stringify(s)), s);
  assert.equal(loadState('nope').ready.length, 4);
  assert.equal(loadState(null).gems, 0);
});

test('evolving: after 5 battles or 10 duels in the deck, one copy turns into its evolution', () => {
  const evo = { '64': ['900'] };
  const s = newState();
  s.owned['64'] = 2;
  assert.equal(evolve(s, '64', '900', evo), false, 'not used enough');
  for (let i = 0; i < EVOLVE_BATTLES - 1; i++) recordBattle(s, '64');
  assert.equal(evolveProgress(s, '64').ready, false);
  recordBattle(s, '64');
  assert.equal(evolveProgress(s, '64').ready, true);
  assert.equal(evolve(s, '64', '123', evo), false, 'not one of its evolutions');
  assert.equal(evolve(s, '64', '900', evo), true);
  assert.deepEqual([s.owned['64'], s.owned['900']], [1, 1]);
  assert.equal(evolveProgress(s, '64').battles, 0, 'counters start again');

  for (let i = 0; i < EVOLVE_DUELS; i++) recordDuel(s, ['64', '64', '7']);
  assert.equal(evolveProgress(s, '64').duels, EVOLVE_DUELS, 'a duel counts once per figure');
  assert.equal(evolve(s, '64', '900', evo), true);
  assert.equal(s.owned['64'], undefined);
  assert.equal(s.owned['900'], 2);
});
