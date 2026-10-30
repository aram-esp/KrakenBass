import type { BattleHooks, BattleResult } from './battle.ts';
import { compareMoves, spinIndex } from './battle.ts';
import type { Game } from './game.ts';
import type { Rng } from './rng.ts';
import type { Condition, Figure, Move, NodeId } from './types.ts';

/*
 * Attack effects and special conditions in battle, as in the original (texts in data/figures.json; rules from Serebii
 * "Gameplay Mechanics" and Bulbapedia "Special Condition (TFG)" / "Wait (TFG)" in research/raw/wait.json).
 * - A purple win applies its effect; a white/gold win with damage knocks out; blue wins dodge; ties do nothing.
 * - Attacks whose name ends in * apply their effect whatever the outcome; effects go first for the attacker.
 * - Choices the original left to a player ("may", "the opponent chooses the point") are made automatically.
 * Effects not listed in UNSUPPORTED are handled below; the ones in it are shown but do nothing (reason given).
 */

export const MISS: Move = { name: 'Miss', color: 'red', damage: 0 };
const damaging = (m: Move) => (m.color === 'white' || m.color === 'gold') && m.damage > 0;
export const isStar = (m: Move) => m.name.trim().endsWith('*') || (m.effect ?? '').trim().startsWith('*');
const text = (m: Move) => (m.effect ?? '').replace(/\{\{mp\}\}/g, 'MP').replace(/<!--.*?-->/g, '').replace(/^\*\s*/, '').trim();

export const CONDITION_ES: Record<Condition, string> = {
  poison: 'envenenado', noxious: 'gravemente envenenado', paralysis: 'paralizado', burn: 'quemado',
  sleep: 'dormido', frozen: 'congelado', confusion: 'confuso',
};

/** Effects shown but not applied, with the reason. */
export const UNSUPPORTED: [RegExp, string][] = [
  [/opposing player cannot use plates|cannot use plates/, 'no hay plates en este juego'],
  [/Cracked marker/, 'ninguna fuente dice qué hace el marcador Cracked'],
  [/must respin for that turn/, 'el texto de Taunt es ambiguo (Taunt ya es morado)'],
  [/spin twice\. If the battle opponent spins the same/, 'el texto de Torment no dice qué hace el giro doble de quien lo usa'],
];

export interface Spun { move: Move; index: number; add: number; mul: number; notes: string[] }

/** One figure's spin, with conditions, wheel-shifting abilities and "spin again" attacks. */
export function spinFigure(game: Game, f: Figure, opp: Figure, rng: Rng, hooks: BattleHooks): Spun {
  const notes: string[] = [];
  const wheel = f.def.wheel;
  if (f.cond === 'frozen') return { move: MISS, index: -1, add: 0, mul: 1, notes: [`${f.def.name} está congelado: falla`] };
  let index = spinIndex(f, rng);
  const shift = hooks.spinShift?.(f, opp) ?? 0;
  if (f.cond === 'confusion') { index = (index - 1 + wheel.length) % wheel.length; notes.push(`${f.def.name} está confuso: la ruleta se mueve una casilla`); }
  if (shift) { index = (index + shift + wheel.length) % wheel.length; notes.push(`Spinning Pattern mueve la ruleta de ${f.def.name}`); }
  let move = wheel[index].move;
  // Paralysis / burn: the attack with the smallest total wheel size becomes a Miss (Bulbapedia).
  if (f.cond === 'paralysis' || f.cond === 'burn') {
    const size = new Map<string, number>();
    for (const s of wheel) if (s.move.color !== 'red') size.set(s.move.name, (size.get(s.move.name) ?? 0) + s.weight);
    const min = Math.min(...size.values());
    const smallest = [...size.keys()].filter((n) => size.get(n) === min);
    if (smallest[Math.floor(rng() * smallest.length)] === move.name) {
      notes.push(`${f.def.name} está ${CONDITION_ES[f.cond]}: ${move.name} falla`);
      move = MISS;
    }
  }
  let add = 0, mul = 1;
  const t = text(move);
  let m: RegExpMatchArray | null;
  // Sticky Grass (plate on the opponent): "Spin-again effects are treated as single spins only."
  const sticky = game.spheres.get(opp.uid) === 'stickygrass';
  if (sticky && /^Spin again/.test(t)) notes.push(`Sticky Grass: ${move.name} gira una sola vez`);
  else if ((m = t.match(/^Spin again until (.+?) does not land/))) {
    let n = 1;
    while (n < 20 && wheel[spinIndex(f, rng)].move.name === move.name) n++;
    mul = n;
    if (n > 1) notes.push(`${move.name} sale ${n} veces: daño ×${n}`);
  } else if ((m = t.match(/^Spin again - if (.+?) is spun, it deals (\+(\d+)|×2) damage/))) {
    if (wheel[spinIndex(f, rng)].move.name === move.name) {
      if (m[3]) add = Number(m[3]); else mul = 2;
      notes.push(`${move.name} vuelve a salir: ${m[2]} de daño`);
    }
  } else if ((m = t.match(/^Spin again until an Attack other than (.+?) is spun\. Damage Attacks deal (\+(\d+)|×(\d+)) damage/))) {
    const first = move.name;
    let tries = 0;
    do { index = spinIndex(f, rng); move = wheel[index].move; } while (move.name === first && ++tries < 20);
    if (damaging(move)) { if (m[3]) add = Number(m[3]); else mul = Number(m[4]); }
    notes.push(`${first}: gira otra vez y sale ${move.name}${damaging(move) ? ` (${m[2]})` : ''}`);
  }
  // X Accuracy (plate): "If the Attack for that Pokémon is a miss that turn, it will shift to the adjacent Attack."
  if (move.color === 'red' && index >= 0 && game.hasBuff(f, 'xaccuracy')) {
    index = (index + 1) % wheel.length;
    move = wheel[index].move;
    notes.push(`X Accuracy: ${f.def.name} pasa a ${move.name}`);
  }
  move = hooks.transform?.(f, move, opp) ?? move;
  // X Speed (plate): the chosen White Attack is a Gold Attack this turn.
  if (move.color === 'white' && game.xspeed.get(f.uid) === move.name) move = { ...move, color: 'gold' };
  return { move, index, add, mul, notes };
}

/** Damage of a spun attack after "spin again" bonuses, attack effects, abilities and conditions. */
export function spunPower(game: Game, hooks: BattleHooks, f: Figure, s: Spun, opp: Figure): number {
  if (!damaging(s.move)) return 0;
  let dmg = (s.move.damage + s.add) * s.mul;
  const t = text(s.move);
  // "Deals +50 damage if the battle opponent is a Dragon Pokémon."
  const vs = t.match(/^Deals \+(\d+) damage if the battle opponent is a (\w+) Pokémon/);
  if (vs && (opp.def.type === vs[2] || opp.def.type2 === vs[2])) dmg += Number(vs[1]);
  // Round: "Damage is multiplied by the number of your own Pokémon on the field that also have Round."
  if (/also have (\w+)\.?$/.test(t)) {
    const name = s.move.name;
    dmg *= Math.max(1, game.figures.filter((o) => o.owner === f.owner && o.status === 'board' && o.def.wheel.some((w) => w.move.name === name)).length);
  }
  // Synthesis on the opponent: your Grass Pokémon deal +20 to it.
  if ((f.def.type === 'Grass' || f.def.type2 === 'Grass') && opp.synthesisBy?.includes(f.owner)) dmg += 20;
  // Belly Drum: your Pokémon that have Belly Drum deal +50 while a Pokémon of yours with a Final Song marker is on the field.
  if (f.def.wheel.some((w) => w.move.name === 'Belly Drum') && game.figures.some((o) => o.owner === f.owner && o.status === 'board' && o.finalSong !== undefined)) dmg += 50;
  dmg = hooks.power(f, { ...s.move, damage: dmg });
  if (f.cond === 'poison') dmg -= 20;
  if (f.cond === 'noxious') dmg -= 40;
  if (f.cond === 'burn') dmg -= 10;
  return Math.max(0, dmg);
}

/** A loser's * attack that keeps it on the field: "If the battle opponent's Attack is N damage or below / less / below N". */
function survives(own: Move, oppPower: number): boolean {
  if (!isStar(own)) return false;
  const t = text(own);
  let m = t.match(/Attack is (\d+)(?: damage)? or (?:below|less), this Pokémon (?:cannot|is not)/) ?? t.match(/spins an Attack of (\d+) damage or less, this Pokémon is not knocked out/);
  if (m) return oppPower <= Number(m[1]);
  m = t.match(/Attack is below (\d+) damage, this Pokémon cannot be knocked out/);
  return !!m && oppPower < Number(m[1]);
}

/** Resolve one battle between `mover` (the attacker) and `other` with the original rules and all effects. */
export function resolveBattle(game: Game, mover: Figure, other: Figure, rng: Rng, hooks: BattleHooks, decisive: boolean): BattleResult {
  let a = spinFigure(game, mover, other, rng, hooks);
  let b = spinFigure(game, other, mover, rng, hooks);
  const notes = [...a.notes, ...b.notes];
  // X Sp. Atk (+2 stars), Concentrated Fertilizer (+1 star) and Twisted Spoon (+1 star while on the field) from plates.
  const stars = (f: Figure) => (game.hasBuff(f, 'xspatk') ? 2 : 0) + (game.hasBuff(f, 'fertilizer') ? 1 : 0) + (game.spheres.get(f.uid) === 'twistedspoon' ? 1 : 0);
  // Sticky Grass: "the battle opponents of that Pokémon cannot respin."
  const canRespin = (f: Figure, opp: Figure) => game.spheres.get(opp.uid) !== 'stickygrass';
  const outcome = () => compareMoves(a.move, b.move, spunPower(game, hooks, mover, a, other), spunPower(game, hooks, other, b, mover), game.rules, stars(mover), stars(other));
  let c = outcome();
  // Power Battle (plate): "if this Pokémon or its opponent spins a Purple Attack in battle, they must both spin again once."
  if ((game.hasBuff(mover, 'powerbattle') || game.hasBuff(other, 'powerbattle')) && (a.move.color === 'purple' || b.move.color === 'purple')) {
    notes.push('Power Battle: los dos vuelven a girar');
    a = spinFigure(game, mover, other, rng, hooks); b = spinFigure(game, other, mover, rng, hooks);
    notes.push(...a.notes, ...b.notes);
    c = outcome();
  }
  // A losing side with a respin ability makes the opponent spin again (the defender is asked first).
  if (c > 0 && canRespin(mover, other)) {
    const ab = hooks.forceRespin(other, b.move, a.move);
    if (ab) { notes.push(`${other.def.name} usa ${ab}: ${mover.def.name} vuelve a girar`); a = spinFigure(game, mover, other, rng, hooks); notes.push(...a.notes); c = outcome(); }
  }
  if (c < 0 && canRespin(other, mover)) {
    const ab = hooks.forceRespin(mover, a.move, b.move);
    if (ab) { notes.push(`${mover.def.name} usa ${ab}: ${other.def.name} vuelve a girar`); b = spinFigure(game, other, mover, rng, hooks); notes.push(...b.notes); c = outcome(); }
  }
  // Plates that allow one respin this turn, used when losing: Double Chance (your spin), No Guard (your Blue spin),
  // Bright Powder (the opponent's spin).
  for (const [self, opp, sign] of [[mover, other, 1], [other, mover, -1]] as const) {
    if (c * sign >= 0) continue;
    const mine = self === mover ? a : b;
    if ((game.hasBuff(self, 'doublechance') || (game.hasBuff(self, 'noguard') && mine.move.color === 'blue')) && canRespin(self, opp)) {
      notes.push(`${game.hasBuff(self, 'doublechance') ? 'Double Chance' : 'No Guard'}: ${self.def.name} vuelve a girar`);
      const again = spinFigure(game, self, opp, rng, hooks);
      if (self === mover) a = again; else b = again;
      notes.push(...again.notes);
      c = outcome();
    } else if (game.hasBuff(self, 'brightpowder') && canRespin(opp, self)) {
      notes.push(`Bright Powder: ${opp.def.name} vuelve a girar`);
      const again = spinFigure(game, opp, self, rng, hooks);
      if (opp === mover) a = again; else b = again;
      notes.push(...again.notes);
      c = outcome();
    }
  }
  const pa = spunPower(game, hooks, mover, a, other), pb = spunPower(game, hooks, other, b, mover);
  const winner = c > 0 ? 'mover' : c < 0 ? 'other' : null;
  const ko = new Set<Figure>();
  const knock = (loser: Figure, loserMove: Move, winPower: number) => {
    if (survives(loserMove, winPower)) { notes.push(`${loser.def.name} resiste gracias a ${loserMove.name}`); return; }
    // Focus Band: cannot be knocked out this turn. X Defend: not knocked out by 10-100 damage.
    if (game.hasBuff(loser, 'focusband') || (game.hasBuff(loser, 'xdefend') && winPower >= 10 && winPower <= 100)) {
      notes.push(`${loser.def.name} resiste gracias a ${game.hasBuff(loser, 'focusband') ? 'Focus Band' : 'X Defend'}`);
      return;
    }
    ko.add(loser);
  };
  if (winner === 'mover' && (decisive || (damaging(a.move) && pa > 0))) knock(other, b.move, pa);
  if (winner === 'other' && (decisive || (damaging(b.move) && pb > 0))) knock(mover, a.move, pb);
  // Counter*: "If the battle opponent's Attack is 20 or more, the opponent is knocked out instead of this Pokémon."
  for (const [self, own, opp, oppPower] of [[mover, a.move, other, pb], [other, b.move, mover, pa]] as const) {
    const m = isStar(own) ? text(own).match(/Attack is (\d+) or more, the opponent is knocked out instead/) : null;
    if (m && ko.has(self) && oppPower >= Number(m[1])) { ko.delete(self); ko.add(opp); notes.push(`${own.name}: ${opp.def.name} cae en su lugar`); }
  }
  // Rocky Helmet (plate): "If that Pokémon is knocked out by Attack damage on this turn, its battle opponent is also knocked out."
  for (const [self, opp] of [[mover, other], [other, mover]] as const) {
    if (ko.has(self) && game.hasBuff(self, 'rockyhelmet') && !ko.has(opp)) { ko.add(opp); notes.push(`Rocky Helmet: ${opp.def.name} también cae`); }
  }
  // Spacial Rend*: "If the battle is a tie, the opponent is knocked out."
  for (const [own, opp] of [[a.move, other], [b.move, mover]] as const) {
    if (winner === null && isStar(own) && /If the battle is a tie, the opponent is knocked out/.test(text(own))) { ko.add(opp); notes.push(`${own.name}: empate, ${opp.def.name} cae`); }
  }
  const result: BattleResult = { moverMove: a.move, otherMove: b.move, moverPower: pa, otherPower: pb, winner, ko: [...ko], notes };
  // Effects: attacker first. A side's effect applies when its attack won, or always for * attacks.
  const ctx: EffectCtx = { game, rng, result, ko, notes };
  for (const [self, own, opp, won] of [[mover, a.move, other, winner === 'mover'], [other, b.move, mover, winner === 'other']] as const) {
    if (own.effect && (won || isStar(own) || own.color === 'blue' && winner !== null)) applyEffect(ctx, self, own, opp, won);
  }
  // Poison Blade (plate): the White Attacks of that Steel-type Pokémon gain "The battle opponent becomes poisoned."
  for (const [self, own, opp, won] of [[mover, a.move, other, winner === 'mover'], [other, b.move, mover, winner === 'other']] as const) {
    if (won && own.color === 'white' && game.spheres.get(self.uid) === 'poisonblade' && !ko.has(opp) && game.setCondition(opp, 'poison')) notes.push(`Poison Blade: ${opp.def.name} queda envenenado`);
  }
  // Mirror Coat (purple): "The battle opponent is knocked out if they spin purple."
  for (const [own, opp, oppMove] of [[a.move, other, b.move], [b.move, mover, a.move]] as const) {
    if (/is knocked out if they spin purple/.test(text(own)) && oppMove.color === 'purple') { ko.add(opp); notes.push(`${own.name}: ${opp.def.name} sacó morado y cae`); }
  }
  result.ko = [...ko];
  return result;
}

interface EffectCtx { game: Game; rng: Rng; result: BattleResult; ko: Set<Figure>; notes: string[] }

/** Apply the effect text of `own` (spun by `self` against `opp`). */
function applyEffect(ctx: EffectCtx, self: Figure, own: Move, opp: Figure, won: boolean): void {
  const { game, rng, ko, notes } = ctx;
  const t = text(own);
  if (!t) return;
  for (const [re, why] of UNSUPPORTED) if (re.test(t)) { notes.push(`${own.name}: efecto sin aplicar (${why})`); return; }
  const say = (s: string) => notes.push(`${own.name}: ${s}`);
  const cond = (f: Figure, c: Condition) => { if (!ko.has(f) && f.status === 'board' && game.setCondition(f, c)) say(`${f.def.name} queda ${CONDITION_ES[c]}`); };
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const word: Record<string, Condition> = {
    poisoned: 'poison', noxious: 'noxious', paralyzed: 'paralysis', burned: 'burn', confused: 'confusion', frozen: 'frozen', asleep: 'sleep',
  };
  const condsIn = (s: string) => [...s.matchAll(/(poisoned|noxious|paralyzed|burned|confused|frozen|asleep)/g)].map((x) => word[x[1]]);
  const oppOut = ko.has(opp), selfOut = ko.has(self);
  const wait = (f: Figure, n?: number) => { if (!ko.has(f) && f.status !== 'pc') { game.gainWait(f, n); say(`${f.def.name} queda en Wait`); } };
  let m: RegExpMatchArray | null;

  // --- * effects that depend on the outcome ---
  if ((m = t.match(/^If this Pokémon is knocked out, the battle opponent (becomes|gains an MP [−-](\d+) marker)(.*)$/))) {
    if (!selfOut) return;
    if (m[2]) { game.addMpMarker(opp, -Number(m[2])); say(`${opp.def.name} recibe un marcador MP −${m[2]}`); return; }
    const cs = condsIn(m[3]); if (cs.length) cond(opp, pick(cs));
    return;
  }
  if ((m = t.match(/^If the battle opponent is knocked out, this Pokémon (claims its previous spot|moves one step back|moves to a spot 2 steps away)/))) {
    if (!oppOut) return;
    const from = opp.at ?? null;
    if (m[1] === 'claims its previous spot' && from) game.relocate(self, from); else game.stepAway(self, opp.at ?? self.at!, m[1].includes('2') ? 2 : 1);
    if (/gains Wait/.test(t)) wait(self);
    say(`${self.def.name} se mueve`);
    return;
  }
  if ((m = t.match(/^If this Pokémon is not knocked out, you may switch this Pokémon with 1 of your Benched Pokémon/))) {
    if (!selfOut && game.swapWithBench(self)) say(`${self.def.name} cambia con una figura del banquillo`);
    return;
  }
  if (/^Benches your battle opponent \(except when opponent has Fainted\)/.test(t)) {
    if (game.hasBuff(opp, 'ballast') || game.grassSphereHolds(opp)) { say(`${opp.def.name} no se mueve (${game.hasBuff(opp, 'ballast') ? 'Ballast' : 'Grass Sphere'})`); return; }
    if (!oppOut && opp.status === 'board') { game.toBench(opp); wait(opp); say(`${opp.def.name} vuelve al banquillo`); }
    return;
  }
  if (/This Pokémon is knocked out if the opponent's Attack deals more than half/.test(t)) {
    const own2 = ctx.result.moverMove === own ? ctx.result.moverPower : ctx.result.otherPower;
    const opp2 = ctx.result.moverMove === own ? ctx.result.otherPower : ctx.result.moverPower;
    if (opp2 > own2 / 2) { ko.add(self); say(`${self.def.name} cae por el retroceso`); }
    return;
  }
  if (/Attack is (\d+)|Attack of (\d+) damage or less|Attack is below (\d+)|instead of this Pokémon|If the battle is a tie/.test(t)) return; // handled in resolveBattle
  if (/^All opposing Pokémon on the field spin\. Those that spin a Miss are knocked out/.test(t)) {
    for (const o of game.figures.filter((x) => x.owner !== self.owner && x.status === 'board' && !ko.has(x))) {
      if (o.def.wheel[spinIndex(o, rng)].move.color === 'red') { ko.add(o); say(`${o.def.name} saca fallo y cae`); }
    }
    return;
  }

  // --- conditions ---
  if ((m = t.match(/^The battle opponent, and a succession of Pokémon adjacent to it \(excluding this one\), become (\w+)/))) {
    const c = word[m[1]];
    for (const f of game.chainFrom(opp, self)) cond(f, c);
    return;
  }
  if ((m = t.match(/^(This Pokémon and )?[Aa]ll (?:neighbor|adjacent) Pokémon become (\w+)/))) {
    const c = word[m[2]];
    if (m[1]) cond(self, c);
    for (const f of game.neighbourFigures(self)) cond(f, c);
    return;
  }
  if (/^The battle opponent either becomes/.test(t)) { cond(opp, pick(condsIn(t))); return; }
  if ((m = t.match(/^The battle opponent (?:becomes (\w+)|falls asleep)(\.|$)/))) {
    cond(opp, m[1] ? word[m[1]] : 'sleep');
    if (/This Pokémon retreats one step/.test(t)) { game.stepAway(self, opp.at ?? self.at!, 1); say(`${self.def.name} retrocede`); }
    return;
  }
  if ((m = t.match(/^This Pokémon becomes (\w+)/))) { cond(self, word[m[1]]); return; }
  if (/^Removes all special conditions of adjacent Pokémon/.test(t)) {
    for (const f of game.neighbourFigures(self)) if (f.cond) { f.cond = null; say(`${f.def.name} se cura`); }
    return;
  }

  // --- Wait and markers ---
  if ((m = t.match(/^The battle opponent (?:now has|gains) Wait(?: (\d+))?\.?$/))) { wait(opp, m[1] ? Number(m[1]) : undefined); return; }
  if ((m = t.match(/^This Pokémon gains Wait(?: (\d+))?\.?$/))) { wait(self, m[1] ? Number(m[1]) : undefined); return; }
  if ((m = t.match(/^Attach(?:es)? (?:an? )?MP [−-](\d+) marker to (?:the )?battle opponent/))) {
    if (!oppOut && game.addMpMarker(opp, -Number(m[1]))) say(`${opp.def.name} recibe un marcador MP −${m[1]}`);
    return;
  }
  if (/^Removes Wait from all your Pokémon on the field/.test(t)) {
    for (const f of game.figures) if (f.owner === self.owner && f.status === 'board' && f.wait) { f.wait = 0; say(`${f.def.name} pierde el Wait`); }
    return;
  }

  // --- knock-outs ---
  if (/^Moves the battle opponent to the P\.C\./.test(t) && game.grassSphereHolds(opp)) { say(`Grass Sphere: ${opp.def.name} no se mueve`); return; }
  if (/^The battle opponent is knocked out\.?$/.test(t) || /^Moves the battle opponent to the P\.C\./.test(t)) { ko.add(opp); say(`${opp.def.name} cae`); return; }
  if (/^This Pokémon and the battle opponent are knocked out/.test(t)) { ko.add(opp); ko.add(self); say('caen los dos'); return; }
  if (/^This Pokémon and all neighbor Pokémon faint/.test(t)) { ko.add(self); for (const f of game.neighbourFigures(self)) ko.add(f); say('caen esta figura y todas las de al lado'); return; }
  if ((m = t.match(/^Knock out 1 of your opponent's (\w+) Pokémon within (\d+) steps/))) {
    const type = m[1], d = game.distances(self.at!);
    const target = game.figures.find((o) => o.owner !== self.owner && o.status === 'board' && !ko.has(o) && (d.get(o.at!) ?? 99) <= Number(m![2]) && (o.def.type === type || o.def.type2 === type));
    if (target) { ko.add(target); say(`${target.def.name} cae`); }
    return;
  }
  if ((m = t.match(/^One other Pokémon on the field spins - if they spin a miss or a white Attack of (\d+) damage or more, they are knocked out/))) {
    const others = game.figures.filter((o) => o !== self && o.status === 'board' && !ko.has(o) && o.owner !== self.owner);
    const o = others.length ? pick(others) : null;
    if (o) { const mv = o.def.wheel[spinIndex(o, rng)].move; if (mv.color === 'red' || (mv.color === 'white' && mv.damage >= Number(m[1]))) { ko.add(o); say(`${o.def.name} cae`); } }
    return;
  }

  // --- bench and P.C. ---
  if (/^The battle opponent is moved to the bench and gains Wait/.test(t)) {
    if (game.hasBuff(opp, 'ballast') || game.grassSphereHolds(opp)) { say(`${opp.def.name} no se mueve (${game.hasBuff(opp, 'ballast') ? 'Ballast' : 'Grass Sphere'})`); return; }
    if (!oppOut && opp.status === 'board') { game.toBench(opp); wait(opp); say(`${opp.def.name} vuelve al banquillo`); }
    return;
  }
  if (/^This Pokémon switches with a Pokémon on your bench/.test(t)) { if (game.swapWithBench(self)) say(`${self.def.name} cambia con el banquillo`); return; }
  if ((m = t.match(/^Moves your (\w+) in the P\.C\. to the bench/))) {
    const f = game.pc[self.owner].find((x) => x.def.name === m![1]);
    if (f) { game.fromPcToBench(f); say(`${f.def.name} vuelve del P.C. al banquillo`); }
    return;
  }

  // --- movement (choices made automatically) ---
  if ((m = t.match(/^The battle opponent (?:and one neighbor Pokémon directly behind it )?(?:is|are) knocked (\d+) steps? back.*?gains? Wait(?: (\d+))?/))) {
    if (oppOut || opp.status !== 'board') return;
    const behind = /directly behind it/.test(t) ? game.behind(opp, self) : null;
    game.stepAway(opp, self.at!, Number(m[1]));
    wait(opp, m[2] ? Number(m[2]) : undefined);
    say(`${opp.def.name} retrocede`);
    if (behind && behind.status === 'board') { game.stepAway(behind, opp.at!, Number(m[1])); wait(behind); }
    return;
  }
  if (/^This Pokémon knocks the battle opponent one step back and claims its previous spot/.test(t)) {
    if (oppOut || !opp.at) return;
    const spot = opp.at;
    game.stepAway(opp, self.at!, 1);
    if (opp.at !== spot) { game.relocate(self, spot); say('empuja y ocupa su sitio'); }
    return;
  }
  if (/^You may knock this Pokémon 1 step back and move the battle opponent to this Pokémon's previous location/.test(t)) {
    if (oppOut || !self.at || !opp.at) return;
    const spot = self.at;
    game.stepAway(self, opp.at, 1);
    if (self.at !== spot) { game.relocate(opp, spot); wait(opp); say('lo arrastra a su sitio'); }
    return;
  }
  if ((m = t.match(/^This Pokémon (?:can take|moves) (\d+)\s*-\s*(\d+) steps back/))) { if (!selfOut) { game.stepAway(self, opp.at ?? self.at!, Number(m[2])); say(`${self.def.name} retrocede`); } return; }
  if (/^This Pokémon (?:can )?jumps? over (?:its|the) battle opponent and land/.test(t)) {
    if (selfOut || !opp.at) return;
    const spot = game.freeNeighbours(opp.at).filter((n) => n !== self.at)[0];
    if (spot) { game.relocate(self, spot); say(`${self.def.name} salta por encima`); }
    if (/then gains Wait/.test(t)) wait(self);
    if (/After moving, it may Attack again/.test(t)) say('el ataque extra no está en este juego (el salto sí)');
    return;
  }
  // Roar of Time*: "If the battle opponent is knocked out, the next turn will always be the other player's." The turn
  // passes to the other player anyway here, so there is nothing to do.
  if (/the next turn will always be the other player/.test(t)) return;
  // Synthesis: "While they are on the field, your Grass Pokémon deal +20 damage to the battle opponent."
  if (/^While they are on the field, your Grass Pokémon deal \+20 damage to the battle opponent/.test(t)) {
    if (!oppOut && opp.status === 'board') { opp.synthesisBy = [...new Set([...(opp.synthesisBy ?? []), self.owner])]; say(`tus Pokémon Planta harán +20 a ${opp.def.name}`); }
    return;
  }
  // Belly Drum: "Attaches a Final Song marker to this Pokémon. The Pokémon with that marker is knocked out 5 turns later.
  // Your Pokémon that have Belly Drum deal +50 damage while those Pokémon are on the field."
  if (/^Attaches a Final Song marker to this Pokémon/.test(t)) {
    if (!selfOut && self.status === 'board' && self.finalSong === undefined) { self.finalSong = game.turn + 5; say(`${self.def.name} caerá en 5 turnos`); }
    return;
  }
  if (/^This Pokémon switches places with its battle opponent/.test(t)) {
    if (oppOut || !self.at || !opp.at) return;
    game.swapPlaces(self, opp); say('intercambian sitio');
    return;
  }
  if (/^Switches the battle opponent with a neighboring opponent Pokémon/.test(t)) {
    const other = oppOut ? null : game.neighbourFigures(opp).find((o) => o.owner === opp.owner);
    if (other) { game.swapPlaces(opp, other); say('cambia de sitio a dos rivales'); }
    return;
  }
  if ((m = t.match(/^The battle opponent is moved (\d+) steps away from this Pokémon/))) {
    if (oppOut || !self.at) return;
    const d = game.distances(self.at);
    const spot = [...d].find(([n, k]) => k === Number(m![1]) && game.isFree(n))?.[0];
    if (spot) { game.relocate(opp, spot); say(`${opp.def.name} se aleja`); }
    return;
  }
  if (/^The opponent is moved 1 step behind this Pokémon/.test(t)) {
    if (oppOut || !self.at || !opp.at) return;
    const spot = game.behindSpot(self, opp.at);
    if (spot) { game.relocate(opp, spot); say(`${opp.def.name} pasa por detrás`); }
    return;
  }
  if (/^Spin again until (.+?) does not land/.test(t) || /^Spin again/.test(t) || /^Deals \+/.test(t) || /^Damage is multiplied/.test(t)) {
    // damage effects, already counted; Water Shuriken also makes a Pokémon next to the opponent spin.
    if (/An opposing Pokémon adjacent to the battle opponent spins\. If it spins a Purple Attack, knock it out/.test(t)) {
      const o = game.neighbourFigures(opp).find((x) => x.owner === opp.owner && !ko.has(x));
      if (o && o.def.wheel[spinIndex(o, rng)].move.color === 'purple') { ko.add(o); say(`${o.def.name} saca morado y cae`); }
    }
    return;
  }
  if (/^The battle opponent falls asleep\. You may move one Pokémon/.test(t)) { cond(opp, 'sleep'); return; }
  if (/If the battle opponent's Attack|knocked out if they spin purple/.test(t)) return;
  say('efecto sin aplicar (aún no está programado)');
}

/** Does the effect text of a move do something in this game? For the Pokédex. */
export function effectStatus(m: Move): 'ok' | 'no' | 'none' {
  const t = text(m);
  if (!t) return 'none';
  return UNSUPPORTED.some(([re]) => re.test(t)) ? 'no' : 'ok';
}

export type { NodeId };
