import type { Color } from './types.ts';

/**
 * Every value here is UNVERIFIED. They are placeholders until the original
 * numbers are confirmed from primary sources (Bulbapedia / r/pokemonduel wiki).
 * Do not treat them as facts about the original game.
 */
export interface RulesConfig {
  /** Max turns before the game is declared over. */
  turnLimit: number;
  /** Outcome when the turn limit runs out. Sources say "both lose"; unconfirmed. */
  turnLimitResult: 'both-lose' | 'draw';
  /** Does `a` beat `b`? Only consulted when the two colours differ. */
  colorBeats: (a: Color, b: Color) => boolean;
  /** What happens when two numeric moves tie on damage. Unknown in the original. */
  tie: 'both-ko' | 'defender-wins' | 'attacker-wins';
}

/**
 * Two sources disagree on the colour hierarchy:
 *  A) blue beats everything; purple > white; gold > purple; red loses to all.
 *  B) blue > gold > purple > white > red.
 * Option B is a strict total order, so it is used as the default.
 */
const ORDER_B: Color[] = ['blue', 'gold', 'purple', 'white', 'red'];

export const defaultRules: RulesConfig = {
  turnLimit: 100,
  turnLimitResult: 'both-lose',
  colorBeats: (a, b) => ORDER_B.indexOf(a) < ORDER_B.indexOf(b),
  tie: 'both-ko',
};
