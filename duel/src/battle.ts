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
  /** Figures knocked out by this battle (empty on a tie or a dodge). */
  ko: Figure[];
}

/** >0: `a` wins, <0: `b` wins, 0: nothing happens. */
function compare(a: Move, b: Move, rules: RulesConfig): number {
  const o = rules.outcome(a.color, b.color);
  if (o === 'a') return 1;
  if (o === 'b') return -1;
  if (o === 'none') return 0;
  if (a.color === 'purple' && b.color === 'purple') return Math.sign((a.stars ?? 0) - (b.stars ?? 0));
  return Math.sign(a.damage - b.damage);
}

/**
 * Both figures spin and the colour matchup decides. Only a winning white/gold attack
 * with damage > 0 knocks the loser out; purple wins apply effects (not modelled yet)
 * and blue wins just dodge.
 */
export function battle(mover: Figure, other: Figure, rules: RulesConfig, rng: Rng): BattleResult {
  const mm = spin(mover, rng);
  const om = spin(other, rng);
  const c = compare(mm, om, rules);
  const knocks = (m: Move) => (m.color === 'white' || m.color === 'gold') && m.damage > 0;
  let ko: Figure[] = [];
  if (c > 0 && knocks(mm)) ko = [other];
  if (c < 0 && knocks(om)) ko = [mover];
  return { moverMove: mm, otherMove: om, ko };
}
