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
  attackerMove: Move;
  defenderMove: Move;
  /** Figures knocked out by this battle. */
  ko: Figure[];
}

export function battle(attacker: Figure, defender: Figure, rules: RulesConfig, rng: Rng): BattleResult {
  const am = spin(attacker, rng);
  const dm = spin(defender, rng);
  let ko: Figure[];

  if (am.color !== dm.color) {
    ko = rules.colorBeats(am.color, dm.color) ? [defender] : [attacker];
  } else if (am.damage !== dm.damage) {
    ko = am.damage > dm.damage ? [defender] : [attacker];
  } else {
    ko = rules.tie === 'both-ko' ? [attacker, defender]
      : rules.tie === 'attacker-wins' ? [defender] : [attacker];
  }
  return { attackerMove: am, defenderMove: dm, ko };
}
