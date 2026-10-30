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

const decisiveRules = { ...defaultRules, decisive: true };

test('decisive option: the loser always falls, even to a blue or purple win', () => {
  assert.equal(houseRules.decisive, false, 'the web game plays the wheels as in the original');
  const lose = game([fig('a', 2, mv('white', 10))], [fig('c', 2, mv('white', 90))], decisiveRules);
  put(lose, '0:0', 'C3');
  put(lose, '1:0', 'B4');
  assert.deepEqual(lose.battle('0:0', '1:0').ko.map((k) => k.uid), ['0:0']);

  const dodge = game([fig('a', 2, mv('white', 90))], [fig('c', 2, mv('blue'))], decisiveRules);
  put(dodge, '0:0', 'C3');
  put(dodge, '1:0', 'B4');
  const r = dodge.battle('0:0', '1:0');
  assert.equal(r.winner, 'other');
  assert.deepEqual(r.ko.map((k) => k.uid), ['0:0']);

  const purple = game([fig('a', 2, mv('purple', 0, 2))], [fig('c', 2, mv('white', 90))], decisiveRules);
  put(purple, '0:0', 'C3');
  put(purple, '1:0', 'B4');
  assert.deepEqual(purple.battle('0:0', '1:0').ko.map((k) => k.uid), ['1:0']);
});

test('decisive option: a tie is spun again until someone wins', () => {
  const tieOr90: FigureDef = { id: 'a', name: 'a', mp: 2, wheel: [{ move: mv('white', 50), weight: 1 }, { move: mv('white', 90), weight: 1 }] };
  const g = game([tieOr90], [fig('c', 2, mv('white', 50))], decisiveRules);
  put(g, '0:0', 'C3');
  put(g, '1:0', 'B4');
  const ties: boolean[] = [];
  g.onBattle = (_m, _o, _r, info) => ties.push(info.tie);
  const r = g.battle('0:0', '1:0');
  assert.equal(r.winner, 'mover');
  assert.deepEqual(r.ko.map((k) => k.uid), ['1:0']);
  assert.equal(ties[ties.length - 1], false);
  assert.ok(ties.slice(0, -1).every(Boolean));
});

const withAbility = (d: FigureDef, name: string): FigureDef => ({ ...d, ability: { name, effect: '' } });

test('abilities: Spicy Scent +20 on your turn, Gleam Eyes -10 next to it, Plus/Minus +30', () => {
  const spicy = game([withAbility(fig('a', 2, mv('white', 40)), 'Spicy Scent')], [fig('c', 2, mv('white', 50))], houseRules);
  put(spicy, '0:0', 'C3');
  put(spicy, '1:0', 'B4');
  const r1 = spicy.battle('0:0', '1:0');
  assert.equal(r1.moverPower, 60);
  assert.equal(r1.winner, 'mover');

  const gleam = game([fig('a', 2, mv('white', 55))], [withAbility(fig('c', 2, mv('white', 50)), 'Gleam Eyes')], houseRules);
  put(gleam, '0:0', 'C3');
  put(gleam, '1:0', 'B4');
  const r2 = gleam.battle('0:0', '1:0');
  assert.equal(r2.moverPower, 45);
  assert.equal(r2.winner, 'other');

  const plus = game([{ ...withAbility(fig('p', 2, mv('white', 30)), 'Plus'), name: 'Plusle' }, { ...fig('m', 2), name: 'Minun' }],
    [fig('c', 2, mv('white', 50))], houseRules);
  put(plus, '0:0', 'C3');
  put(plus, '0:1', 'I3a'); // next to C3
  put(plus, '1:0', 'B4');
  assert.equal(plus.battle('0:0', '1:0').moverPower, 60);
});

test('abilities: Battle Armor and Migraine force one respin; Bide cannot battle; Distortion blocks bench entry', () => {
  const armor = game([fig('a', 2, mv('white', 90))], [withAbility(fig('c', 2, mv('white', 10)), 'Battle Armor')], houseRules);
  put(armor, '0:0', 'C3');
  put(armor, '1:0', 'B4');
  const r = armor.battle('0:0', '1:0');
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /Battle Armor/);

  const migraine = game([fig('a', 2, mv('purple', 0, 2))], [withAbility(fig('c', 2, mv('white', 30)), 'Migraine')], houseRules);
  put(migraine, '0:0', 'C3');
  put(migraine, '1:0', 'B4');
  assert.match(migraine.battle('0:0', '1:0').notes[0], /Migraine/);

  const bide = game([fig('a', 2)], [withAbility(fig('c', 2), 'Bide')], houseRules);
  put(bide, '0:0', 'C3');
  put(bide, '1:0', 'B4');
  assert.deepEqual(bide.adjacentEnemies(bide.figures[0]), []);
  assert.throws(() => bide.battle('0:0', '1:0'), /adjacent enemy/);

  const dist = game([withAbility(fig('d', 2), 'Time Distortion'), fig('b', 2)], [fig('c', 1)], houseRules);
  assert.equal(dist.reachable(dist.figures[0]).size, 0, 'blocked while another figure is on the bench');
  put(dist, '0:1', 'C3');
  assert.ok(dist.reachable(dist.figures[0]).size > 0, 'free once the bench is empty');
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

// ---- original wheels, special conditions, attack effects, abilities (2026-10-30) ----
const eff = (color: Color, effect: string, damage = 0, stars = 1, name = 'X'): Move => ({ name, color, damage, stars, effect });
const duel = (a: FigureDef[], b: FigureDef[]) => {
  const g = game(a, b, houseRules);
  put(g, '0:0', 'C3');
  put(g, '1:0', 'B4');
  return g;
};

test('original wheels: a purple win poisons and knocks nobody out; poison is -20 damage', () => {
  const g = duel([fig('a', 2, eff('purple', 'The battle opponent becomes poisoned.'))], [fig('c', 2, mv('white', 50))]);
  const r = g.battle('0:0', '1:0');
  assert.equal(r.winner, 'mover');
  assert.deepEqual(r.ko, []);
  assert.equal(g.figures[1].cond, 'poison');
  const g2 = duel([fig('a', 2, mv('white', 40))], [fig('c', 2, mv('white', 50))]);
  g2.figures[1].cond = 'poison';
  assert.equal(g2.battle('0:0', '1:0').otherPower, 30);
});

test('a * attack applies its effect even when it loses; Defense Curl-style * attacks survive weak hits', () => {
  const g = duel([fig('a', 2, mv('white', 90))], [fig('c', 2, eff('white', '* If this Pokémon is knocked out, the battle opponent becomes paralyzed.', 20, 0, 'Nuzzle*'))]);
  const r = g.battle('0:0', '1:0');
  assert.deepEqual(r.ko.map((k) => k.uid), ['1:0']);
  assert.equal(g.figures[0].cond, 'paralysis');
  const curl = duel([fig('a', 2, mv('white', 40))], [fig('c', 2, eff('white', "* If the battle opponent's Attack is 50 or below, this Pokémon cannot be knocked out.", 10, 0, 'Defense Curl*'))]);
  assert.deepEqual(curl.battle('0:0', '1:0').ko, []);
});

test('blue dodges and ties do nothing; plain Wait makes the figure skip its next turn', () => {
  // Player 1 also has a bench figure, so a Wait on its only field figure does not lose the game (Wait win).
  const g = duel([fig('a', 2, mv('white', 90))], [fig('c', 2, eff('blue', 'This Pokémon gains Wait.', 0, 0, 'Protect')), fig('d', 2)]);
  const r = g.battle('0:0', '1:0');
  assert.equal(r.winner, 'other');
  assert.deepEqual(r.ko, []);
  assert.equal(g.current, 1);
  assert.equal(g.reachable(g.figures[1]).size, 0, 'Protect: it cannot move on its next turn');
  g.endTurn();
  g.endTurn();
  assert.ok(g.reachable(g.figures[1]).size > 0, 'free again on the turn after');
});

test('asleep figures cannot move or attack, do not block the way and wake up when attacked; frozen ones always miss', () => {
  const g = duel([fig('a', 2, mv('white', 90)), fig('b', 2)], [fig('c', 2, mv('white', 10))]);
  g.figures[0].cond = 'sleep';
  assert.equal(g.canAttack(g.figures[0]), false);
  assert.equal(g.reachable(g.figures[0]).size, 0);
  g.figures[0].cond = null;
  g.figures[2].cond = 'frozen';
  const r = g.battle('0:0', '1:0');
  assert.equal(r.otherMove.color, 'red');
  const wake = duel([fig('a', 2, mv('blue'))], [fig('c', 2, mv('white', 10))]);
  wake.figures[1].cond = 'sleep';
  wake.battle('0:0', '1:0');
  assert.equal(wake.figures[1].cond, null);
});

test('immunities: Immunity blocks poison, Own Tempo blocks confusion', () => {
  const g = duel([fig('a', 2, eff('purple', 'The battle opponent becomes poisoned.'))], [withAbility(fig('c', 2, mv('white', 50)), 'Immunity')]);
  g.battle('0:0', '1:0');
  assert.equal(g.figures[1].cond ?? null, null);
});

test('Run Away and Sand Veil avoid the battle', () => {
  const run = duel([fig('a', 2, mv('white', 90))], [withAbility(fig('c', 2), 'Run Away')]);
  const r = run.battle('0:0', '1:0');
  assert.equal(r.winner, null);
  assert.equal(run.figures[1].status, 'bench');
  assert.ok(run.figures[1].wait > 0);
  const veil = duel([fig('a', 2, mv('white', 90))], [withAbility(fig('c', 2), 'Sand Veil')]);
  veil.battle('0:0', '1:0');
  assert.equal(veil.figures[1].status, 'board');
  assert.notEqual(veil.figures[1].at, 'B4');
});

test('special moves: Cut Off to your goal, Run Off swap, tagging wakes an ally', () => {
  const cut = duel([withAbility(fig('s', 2), 'Cut Off')], [fig('c', 2)]);
  const s1 = cut.specials(cut.figures[0]).find((x) => x.kind === 'cutoff')!;
  assert.equal(s1.to, board.goals[0]);
  cut.doSpecial(s1);
  assert.equal(cut.figures[0].at, board.goals[0]);
  assert.equal(cut.current, 1, 'Cut Off ends the turn');

  const off = game([withAbility(fig('a', 2), 'Run Off'), fig('b', 2)], [fig('c', 2)], houseRules);
  put(off, '0:0', 'C3');
  put(off, '0:1', 'I3a');
  const s2 = off.specials(off.figures[0]).find((x) => x.kind === 'runoff')!;
  off.doSpecial(s2);
  assert.deepEqual([off.figures[0].at, off.figures[1].at], ['I3a', 'C3']);
  assert.equal(off.current, 0, 'Run Off does not end the turn');

  const tag = game([fig('a', 2), fig('b', 2)], [fig('c', 2)], houseRules);
  put(tag, '0:0', 'C3');
  put(tag, '0:1', 'I3a');
  tag.figures[1].cond = 'sleep';
  tag.doSpecial(tag.specials(tag.figures[0]).find((x) => x.kind === 'tag')!);
  assert.equal(tag.figures[1].cond, null);
});

test('MP: markers from attacks and Mud Coating', () => {
  const g = duel([fig('a', 2, eff('purple', 'Attaches an {{mp}} -1 marker to the battle opponent.'))], [fig('c', 2, mv('white', 50))]);
  g.battle('0:0', '1:0');
  assert.equal(g.mp(g.figures[1]), 1);
  const water = (id: string) => ({ ...fig(id, 2), type: 'Water' });
  const mud = game([{ ...fig('g', 1), type: 'Ground' }, withAbility(water('m'), 'Mud Coating'), water('w1'), water('w2')], [fig('c', 2)], houseRules);
  mud.endTurn(); mud.endTurn();
  for (const [uid, n] of [['0:0', 'C3'], ['0:1', 'I3a'], ['0:2', 'I2a'], ['0:3', 'I2b']] as const) put(mud, uid, n);
  assert.equal(mud.mp(mud.figures[0]), 2);
});

// ---- plates (2026-10-30) ----
import { plateSpec, plateUsable, toPlateDef, type PlateRecord } from '../src/plates.ts';
const plateRecords: PlateRecord[] = JSON.parse(readFileSync(new URL('../data/plates.json', import.meta.url), 'utf8'));
const plate = (name: string) => toPlateDef(plateRecords.find((p) => p.name === name)!);

test('plates: data and specs (165 plates, X Attack cost 1, Mega stones unusable here)', () => {
  assert.equal(plateRecords.length, 165);
  assert.equal(plate('X Attack').cost, 1);
  assert.equal(plateSpec(plate('X Attack')).status, 'ok');
  assert.equal(plateSpec(plate('Charizardite X')).status, 'no');
});

test('plates: X Attack +30 this turn, one plate per turn, before moving, each once per duel', () => {
  const g = new Game(board, [[fig('a', 2, mv('white', 40))], [fig('c', 2, mv('white', 60))]], seeded(1), houseRules, 0, [[plate('X Attack'), plate('X Defend')], []]);
  put(g, '0:0', 'C3');
  put(g, '1:0', 'B4');
  g.usePlate(0, 0, ['0:0']);
  assert.equal(g.canUsePlate(0, 1), false, 'only one plate per turn');
  const r = g.battle('0:0', '1:0');
  assert.equal(r.moverPower, 70);
  assert.equal(r.winner, 'mover');
  assert.equal(g.plates[0][0].used, true);
});

test('plates: Focus Band keeps a figure, Goal Block defends the goal, Recycle restores used plates', () => {
  const g = new Game(board, [[fig('a', 2, mv('white', 10)), fig('b', 2)], [fig('c', 2, mv('white', 90))]], seeded(1), houseRules, 0,
    [[plate('Focus Band'), plate('Goal Block'), plate('Recycle')], []]);
  put(g, '0:0', 'C3');
  put(g, '0:1', 'I3a');
  put(g, '1:0', 'B4');
  g.usePlate(0, 0, ['0:0']);
  assert.deepEqual(g.battle('0:0', '1:0').ko, [], 'Focus Band');
  g.endTurn();
  g.usePlate(0, 1, ['0:1']);
  assert.equal(g.figures[1].at, board.goals[0]);
  assert.equal(g.current, 1, 'Goal Block ends the turn');
  g.endTurn();
  assert.equal(plateUsable(g, 0, plate('Recycle')), true);
  g.usePlate(0, 2);
  assert.equal(g.plates[0][0].used, false);
});

test('plates: Rocky Helmet takes the winner down too; Hurdle Jump jumps over a figure', () => {
  const g = new Game(board, [[fig('a', 2, mv('white', 10))], [fig('c', 2, mv('white', 90)), fig('d', 2)]], seeded(1), houseRules, 0, [[plate('Rocky Helmet')], []]);
  put(g, '0:0', 'C3');
  put(g, '1:0', 'B4');
  g.usePlate(0, 0, ['0:0']);
  assert.equal(g.battle('0:0', '1:0').ko.length, 2);
  const h = new Game(board, [[fig('a', 2), fig('b', 2)], [fig('c', 2)]], seeded(1), houseRules, 0, [[plate('Hurdle Jump')], []]);
  put(h, '0:0', 'C3');
  put(h, '0:1', 'I3a');
  h.usePlate(0, 0, ['0:0']);
  assert.notEqual(h.figures[0].at, 'C3');
  assert.equal(h.distances('C3').get(h.figures[0].at!), 2);
});
