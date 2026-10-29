import type { Color } from './types.ts';

/**
 * Colour matchup, read from the community chart (Fandom archive wiki "Color chart") and
 * the Serebii/Bulbapedia rule text. 'a' = the row colour wins, 'b' = the column colour wins,
 * 'cmp' = compare damage (stars for purple/purple), 'none' = nothing happens.
 */
export type Outcome = 'a' | 'b' | 'cmp' | 'none';

const T: Record<Color, Record<Color, Outcome>> = {
  red:    { red: 'none', white: 'b',   purple: 'b',   gold: 'b',   blue: 'b' },
  white:  { red: 'a',    white: 'cmp',  purple: 'b',   gold: 'cmp', blue: 'b' },
  purple: { red: 'a',    white: 'a',    purple: 'cmp', gold: 'b',   blue: 'b' },
  gold:   { red: 'a',    white: 'cmp',  purple: 'a',   gold: 'cmp', blue: 'b' },
  blue:   { red: 'a',    white: 'a',    purple: 'a',   gold: 'a',   blue: 'none' },
};

export interface RulesConfig {
  /** Turn limit; if nobody has won by then both players lose (Fandom archive wiki). */
  turnLimit: number;
  outcome: (a: Color, b: Color) => Outcome;
  /** Which adjacent enemy is fought when several are adjacent. UNVERIFIED: the real game lets the player choose. */
  target: 'first' | 'none';
}

export const defaultRules: RulesConfig = {
  turnLimit: 300,
  outcome: (a, b) => T[a][b],
  target: 'first',
};
