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
  /** MP removed from every figure of the first player during their first turn. */
  firstTurnMpPenalty: number;
  /** Capacity of each player's P.C.; a further KO sends the oldest figure back to the bench. */
  pcSize: number;
  outcome: (a: Color, b: Color) => Outcome;
  /** Which adjacent enemy is fought when several are adjacent. UNVERIFIED: the real game lets the player choose. */
  target: 'first' | 'none';
  /**
   * When the attacker loses a battle it would be knocked out. 'ko': it is (the real game). 'counter': house rule asked by
   * the user on 2026-10-30: the attacker is not knocked out; the defender counter-attacks at once with a new spin of both
   * wheels and, if it wins, the attacker is knocked out; otherwise nothing happens. A defender with Wait cannot counter.
   */
  attackerLoss: 'ko' | 'counter';
}

export const defaultRules: RulesConfig = {
  turnLimit: 300,
  firstTurnMpPenalty: 1,
  pcSize: 2,
  outcome: (a, b) => T[a][b],
  target: 'first',
  attackerLoss: 'ko',
};

/** The rules the web game is played with: the real ones plus the user's house rules. */
export const houseRules: RulesConfig = { ...defaultRules, attackerLoss: 'counter' };
