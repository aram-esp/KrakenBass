import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { challengeEs, challengeMet, HOTELS, hotelDeck, leagueOf, newStats, parseReward, ratingChange, type TrainingStage } from '../src/story.ts';
import { seeded } from '../src/rng.ts';

const stages: TrainingStage[] = JSON.parse(readFileSync(new URL('../data/training.json', import.meta.url), 'utf8'));

test('every Training Center challenge is understood and translated', () => {
  const texts = new Set(stages.flatMap((s) => s.challenges));
  assert.ok(texts.size >= 15);
  for (const t of texts) {
    assert.notEqual(challengeMet(t, newStats(), true), null, t);
    assert.notEqual(challengeEs(t), t, t);
  }
});

test('challenges follow the duel stats', () => {
  const s = newStats();
  assert.equal(challengeMet("Don't initiate any battles.", s, true), true);
  s.battlesStarted = 1;
  assert.equal(challengeMet("Don't initiate any battles.", s, true), false);
  s.plates.push('X Attack');
  assert.equal(challengeMet('Use X Attack.', s, false), true);
  assert.equal(challengeMet('Use Double Chance.', s, false), false);
  s.koInBattle = 2;
  assert.equal(challengeMet('Knock out 3 opposing Figures in battle.', s, true), false);
  assert.equal(challengeMet('Knock out 2 opposing Figures in battle.', s, true), true);
  s.winByGoal = true; s.turns = 21;
  assert.equal(challengeMet("Move a Pokémon onto the opponent's goal point in 20 or fewer turns.", s, true), false);
});

test('rewards, hotels, leagues', () => {
  assert.deepEqual(parseReward('Gems × 10'), { gems: 10, names: [] });
  assert.deepEqual(parseReward('Eevee (57), Ingot [R]'), { gems: 0, names: ['Eevee', 'Ingot [R]'] });
  const pool = ['Common', 'Uncommon', 'Rare', 'EX'].flatMap((r, i) => Array.from({ length: 5 }, (_, k) => ({ id: `${i}-${k}`, r })));
  const rar = (id: string) => pool.find((p) => p.id === id)!.r;
  const a = hotelDeck(0, 0, pool, rar, seeded), b = hotelDeck(0, 0, pool, rar, seeded);
  assert.deepEqual(a, b, 'same deck every time');
  const score = (d: { id: string }[]) => d.reduce((t, x) => t + Number(x.id[0]), 0);
  assert.ok(score(hotelDeck(5, HOTELS[5].stages - 1, pool, rar, seeded)) > score(a), 'the last leader is tougher');
  assert.equal(leagueOf(1000), 'Beginner');
  assert.equal(leagueOf(1300), 'Trainer');
  assert.equal(leagueOf(3200), 'Legend');
  assert.ok(ratingChange(1000, true) > 0 && ratingChange(1000, false) < 0);
});

test('offline ranking: rivals near your points, the others play too, AI levels grow with points', async () => {
  const { newLadder, pickRival, driftLadder, aiLevelFor, hotelLevel, LADDER_SIZE } = await import('../src/story.ts');
  const ladder = newLadder(seeded(3));
  assert.equal(ladder.length, LADDER_SIZE);
  assert.equal(new Set(ladder.map((t) => t.name)).size, LADDER_SIZE);
  assert.ok(ladder.filter((t) => t.rating < 1300).length > ladder.length / 3, 'most start low');
  const i = pickRival(ladder, 1000, seeded(1));
  const closer = ladder.filter((t) => Math.abs(t.rating - 1000) < Math.abs(ladder[i].rating - 1000)).length;
  assert.ok(closer < 6);
  const total = ladder.reduce((t, x) => t + x.rating, 0);
  driftLadder(ladder, seeded(2), 50);
  assert.ok(Math.abs(ladder.reduce((t, x) => t + x.rating, 0) - total) < 60, 'points move between trainers');
  assert.ok(aiLevelFor(1000) <= 4 && aiLevelFor(3000) === 50);
  assert.ok(hotelLevel(0, 0) === 1 && hotelLevel(5, 29) >= 45);
});
