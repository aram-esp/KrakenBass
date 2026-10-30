import type { BattleHooks } from './battle.ts';
import type { Game } from './game.ts';
import type { Figure, Move } from './types.ts';

/**
 * Abilities as the figures had them in the game version played (data/figures.json, per version; 21 of the 82
 * figures of 1.0.0 have one). Only abilities that need no choice from the player and no special conditions
 * work here; the rest are shown with their text and marked as having no effect yet.
 */
export const WORKING = new Set([
  'Spicy Scent', 'Gleam Eyes', 'Plus', 'Minus', 'Battle Armor', 'Migraine', 'Time Distortion', 'Space Distortion', 'Bide',
]);

/** Why an ability of the 1.0.0 figures has no effect yet. Any other name not in WORKING: not implemented yet. */
export const PENDING: Record<string, string> = {
  'Run Off': 'Hace falta que elijas con qué figura de al lado intercambiarla; aún no hay esa opción.',
  Swarm: 'Hace falta que elijas a qué Ledyba mover; aún no hay esa opción.',
  'Run Away': 'Hace falta que decidas, cuando te atacan, si huir al banquillo; además el texto no dice cuántos turnos de Wait.',
  'Sand Veil': 'Hace falta que decidas, cuando te atacan, si esquivar y a qué casilla ir.',
  'Reckless Charge': 'Hace falta un movimiento especial en línea recta, que el tablero aún no distingue.',
  Gooey: 'El texto no dice cuántos turnos de Wait da, y no quiero inventarlo.',
  Guts: 'Depende de los estados alterados (veneno, parálisis…), que este juego aún no tiene.',
  Insomnia: 'Protege del sueño, y este juego aún no tiene estados alterados.',
  'Own Tempo': 'Protege de la confusión, y este juego aún no tiene estados alterados.',
  Immunity: 'Protege del veneno, y este juego aún no tiene estados alterados.',
};
export const pendingReason = (name: string) => PENDING[name] ?? 'Aún no está programada en este juego.';

export const abilityName = (f: Figure) => f.def.ability?.name ?? '';
export const hasAbility = (f: Figure, name: string) => abilityName(f) === name;

/** Bide: "This Pokémon cannot battle." */
export const canBattle = (f: Figure) => !hasAbility(f, 'Bide');

/**
 * Time Distortion (Dialga) / Space Distortion (Palkia): "If there are other Pokémon on your bench, this Pokémon
 * cannot enter the field using an MP move."
 */
export function blockedFromEntering(game: Game, f: Figure): boolean {
  if (f.status !== 'bench' || !(hasAbility(f, 'Time Distortion') || hasAbility(f, 'Space Distortion'))) return false;
  return game.figures.some((o) => o !== f && o.owner === f.owner && o.status === 'bench');
}

function neighbours(game: Game, f: Figure): Figure[] {
  if (f.status !== 'board' || !f.at) return [];
  return game.board.neighbors(f.at).map((n) => game.figureAt(n)).filter((o): o is Figure => !!o);
}

/** Battle effects of the abilities, for one battle (the respin abilities work once per turn). */
export function abilityHooks(game: Game): BattleHooks {
  const usedRespin = new Set<string>();
  return {
    power(f: Figure, m: Move): number {
      let dmg = m.damage;
      // Spicy Scent (Bayleef): "This Pokémon gains +20 damage in battles in your turn."
      if (hasAbility(f, 'Spicy Scent') && f.owner === game.current) dmg += 20;
      const near = neighbours(game, f);
      // Plus (Plusle) / Minus (Minun): "This Pokémon gains +30 damage when next to a Minun / Plusle."
      if (hasAbility(f, 'Plus') && near.some((o) => o.owner === f.owner && o.def.name === 'Minun')) dmg += 30;
      if (hasAbility(f, 'Minus') && near.some((o) => o.owner === f.owner && o.def.name === 'Plusle')) dmg += 30;
      // Gleam Eyes (Luxray): "Opposing Pokémon next to this Pokémon deal −10 damage."
      dmg -= 10 * near.filter((o) => o.owner !== f.owner && hasAbility(o, 'Gleam Eyes')).length;
      return dmg;
    },
    forceRespin(f: Figure, _own: Move, opp: Move): string | null {
      if (usedRespin.has(f.uid)) return null;
      // Battle Armor (Armaldo, Drapion, Kabuto): "If your battle opponent spins an Attack with 10 or more damage,
      // you can force them to spin again once per turn." Used whenever it is losing to such an attack.
      const armor = hasAbility(f, 'Battle Armor') && (opp.color === 'white' || opp.color === 'gold') && opp.damage >= 10;
      // Migraine (Psyduck): "If your opponent spins a Purple Attack, you can force them to respin once a turn."
      const migraine = hasAbility(f, 'Migraine') && opp.color === 'purple';
      if (!armor && !migraine) return null;
      usedRespin.add(f.uid);
      return armor ? 'Battle Armor' : 'Migraine';
    },
  };
}
