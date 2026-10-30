import type { Figure, Move } from './types.ts';
import type { Rng } from './rng.ts';
import type { RulesConfig } from './rules.config.ts';

export function spin(figure: Figure, rng: Rng): Move {
  const wheel = figure.def.wheel;
  const total = wheel.reduce((s, seg) => s + seg.weight, 0);
  let r = rng() * total;
  for (const seg of wheel) {
    r -= seg.weight;
    if (r < 0) return seg.move;
  }
  return wheel[wheel.length - 1].move;
}

export interface BattleResult {
  moverMove: Move;
  otherMove: Move;
  /** Damage of each spun attack after abilities (0 for non-damaging colours). */
  moverPower: number;
  otherPower: number;
  /** Who won the spin; null on a tie or when nobody wins (blue/blue, Miss/Miss). */
  winner: 'mover' | 'other' | null;
  /** Figures knocked out by this battle. */
  ko: Figure[];
  /** Abilities that changed the battle, for the log. */
  notes: string[];
}

/** Ability effects on a battle (src/abilities.ts). The defaults change nothing. */
export interface BattleHooks {
  /** Damage of a white/gold attack spun by `f`. */
  power(f: Figure, m: Move): number;
  /** May `f`, losing with `own`, force the opponent to spin `opp` again? Returns the ability name, or null. */
  forceRespin(f: Figure, own: Move, opp: Move): string | null;
}

export const NO_HOOKS: BattleHooks = { power: (_f, m) => m.damage, forceRespin: () => null };

const damaging = (m: Move) => m.color === 'white' || m.color === 'gold';

/** >0: `a` wins, <0: `b` wins, 0: nothing happens. */
function compare(a: Move, b: Move, pa: number, pb: number, rules: RulesConfig): number {
  const o = rules.outcome(a.color, b.color);
  if (o === 'a') return 1;
  if (o === 'b') return -1;
  if (o === 'none') return 0;
  if (a.color === 'purple' && b.color === 'purple') return Math.sign((a.stars ?? 0) - (b.stars ?? 0));
  return Math.sign(pa - pb);
}

/**
 * Both figures spin and the colour matchup decides. Real rules: only a winning white/gold attack with damage > 0
 * knocks the loser out (purple wins would apply effects, not modelled yet; blue wins just dodge).
 * rules.decisive: whoever wins knocks the other out. Abilities come in through `hooks`.
 */
export function battle(mover: Figure, other: Figure, rules: RulesConfig, rng: Rng, hooks: BattleHooks = NO_HOOKS): BattleResult {
  let mm = spin(mover, rng);
  let om = spin(other, rng);
  const notes: string[] = [];
  const pw = (f: Figure, m: Move) => (damaging(m) ? Math.max(0, hooks.power(f, m)) : 0);
  const outcome = () => compare(mm, om, pw(mover, mm), pw(other, om), rules);
  let c = outcome();
  // A losing side with a respin ability makes the opponent spin again (the defender is asked first).
  if (c > 0) {
    const ab = hooks.forceRespin(other, om, mm);
    if (ab) { notes.push(`${other.def.name} usa ${ab}: ${mover.def.name} vuelve a girar`); mm = spin(mover, rng); c = outcome(); }
  }
  if (c < 0) {
    const ab = hooks.forceRespin(mover, mm, om);
    if (ab) { notes.push(`${mover.def.name} usa ${ab}: ${other.def.name} vuelve a girar`); om = spin(other, rng); c = outcome(); }
  }
  const moverPower = pw(mover, mm), otherPower = pw(other, om);
  const winner = c > 0 ? 'mover' : c < 0 ? 'other' : null;
  let ko: Figure[] = [];
  if (winner === 'mover' && (rules.decisive || (damaging(mm) && moverPower > 0))) ko = [other];
  if (winner === 'other' && (rules.decisive || (damaging(om) && otherPower > 0))) ko = [mover];
  return { moverMove: mm, otherMove: om, moverPower, otherPower, winner, ko, notes };
}
