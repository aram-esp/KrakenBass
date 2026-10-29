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

/** Returns >0 if `a` wins, <0 if `b` wins, 0 for nothing happens. */
function compare(a: Move, b: Move, rules: RulesConfig): number {
  if (a.color !== b.color) return rules.colorBeats(a.color, b.color) ? 1 : -1;
  if (a.color === 'white' || a.color === 'gold') return Math.sign(a.damage - b.damage);
  if (a.color === 'purple') return Math.sign((a.stars ?? 0) - (b.stars ?? 0));
  return 0; // blue/blue and red/red: nothing happens
}

/**
 * Both figures spin; the colours decide the outcome. Per the TFG rules ties
 * do nothing. A white win knocks the loser out; whether purple/gold wins also
 * knock out is UNVERIFIED and treated the same here.
 */
export function battle(mover: Figure, other: Figure, rules: RulesConfig, rng: Rng): BattleResult {
  const mm = spin(mover, rng);
  const om = spin(other, rng);
  const c = compare(mm, om, rules);
  const knocks = (m: Move) => m.color === 'white' || m.color === 'gold' || m.color === 'purple';
  let ko: Figure[] = [];
  if (c > 0 && knocks(mm)) ko = [other];
  if (c < 0 && knocks(om)) ko = [mover];
  return { moverMove: mm, otherMove: om, ko };
}
