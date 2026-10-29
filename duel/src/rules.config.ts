import type { Color } from './types.ts';

/**
 * Sources: Bulbapedia "Pokémon Trading Figure Game" (Mechanics), which says Duel
 * used rules almost identical to it. Items marked UNVERIFIED are not in a source.
 */
export interface RulesConfig {
  /** Max turns before the game is declared over. UNVERIFIED value. */
  turnLimit: number;
  /** Does colour `a` beat a different colour `b`? */
  colorBeats: (a: Color, b: Color) => boolean;
  /** Which adjacent enemy is fought when several are adjacent. UNVERIFIED. */
  target: 'first' | 'none';
}

/**
 * Verified (TFG): blue beats all; purple beats white; red (miss) loses to all.
 * UNVERIFIED: where gold sits. Duel added gold; one search summary put it
 * between blue and purple, so that is used as a placeholder.
 */
const ORDER: Color[] = ['blue', 'gold', 'purple', 'white', 'red'];

export const defaultRules: RulesConfig = {
  turnLimit: 100,
  colorBeats: (a, b) => ORDER.indexOf(a) < ORDER.indexOf(b),
  target: 'first',
};
