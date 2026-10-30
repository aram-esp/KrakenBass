import type { BattleHooks, BattleResult } from './battle.ts';
import { evolvedWheel } from './data.ts';
import type { Game } from './game.ts';
import type { Condition, Figure, Move } from './types.ts';

/**
 * Abilities as the figures had them in the game version played (data/figures.json, per version), plus the ones of
 * the figures reached by evolving. Texts are the original ones; how each works here is noted next to it.
 * Abilities that let a player choose are used automatically when they are defensive (Run Away, Sand Veil) and offered
 * as purple targets on the board when they are moves (Run Off, Swarm, Forest Leap, Cut Off): see Game.specials.
 */

/** Abilities that can do nothing here, with the reason (shown in the Pokédex). */
export const PENDING: Record<string, string> = {
  'Big Chorus': 'Impide al rival usar plates, y en este juego no hay plates.',
  'Electromagnetic Barrier': 'Protege de los ataques que obligan a girar, y ningún ataque de este juego lo hace.',
  'Slime Barrier': 'Anula los estados que ponen los ataques blancos del rival, y ningún ataque blanco de este juego pone estados sin el *.',
  'Steel Breaker': 'Pone el marcador Cracked, y ninguna fuente dice qué hace ese marcador.',
};
export const pendingReason = (name: string) => PENDING[name] ?? 'Aún no está programada en este juego.';

/** Every ability of the figures in this game that works (all but PENDING). */
export const WORKING = new Set([
  'Spicy Scent', 'Gleam Eyes', 'Plus', 'Minus', 'Battle Armor', 'Migraine', 'Time Distortion', 'Space Distortion', 'Bide',
  'Run Off', 'Swarm', 'Run Away', 'Sand Veil', 'Reckless Charge', 'Gooey', 'Guts', 'Insomnia', 'Own Tempo', 'Immunity',
  'Band Attack', 'Big Eggsplosion', 'Blue Spark', 'Cut Off', 'Diffuse Poison', 'Diving Entry', 'Electric Fur', 'Electric Upsurge',
  'Enhanced Core', 'Forest Leap', 'Gale Wings', 'Grounding', 'Huge Power', 'Hypnotic Stare', 'Leaf Guard', 'Metamorphosis',
  'Mud Coating', 'Shed Skin', 'Sneaky Steps', 'Speed Booster', 'Spellbind', 'Spinning Pattern', 'Rapid Approach',
]);

/** How each ability that needed a decision or an interpretation works here (Pokédex). */
export const NOTES: Record<string, string> = {
  'Run Away': 'Se usa siempre que puede. Wait sin número: se salta su siguiente turno.',
  'Sand Veil': 'Se usa siempre que hay una casilla libre junto al atacante.',
  'Run Off': 'Casillas moradas: pulsa un aliado de al lado para cambiarte con él antes de mover.',
  Swarm: 'Casillas moradas: elige junto a qué casilla traer a Ledyba/Ledian.',
  'Forest Leap': 'Casillas moradas: salta junto a un Pokémon Planta encadenado.',
  'Cut Off': 'Casilla morada: tu portería.',
  Gooey: 'Wait sin número: el rival se salta su siguiente turno.',
  'Big Eggsplosion': 'Elige automáticamente el primer Exeggcute tuyo del tablero.',
  'Speed Booster': 'Las figuras conseguidas evolucionando cuentan como evolucionadas: +1 MP.',
  'Enhanced Core': 'Las figuras conseguidas evolucionando cuentan como evolucionadas: +1 MP.',
  Metamorphosis: 'Si no cae en un combate, evoluciona en el momento (+10 de daño y +1★, como en el original).',
};

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
const onField = (game: Game) => game.figures.filter((o) => o.status === 'board');
const isType = (f: Figure, t: string) => f.def.type === t || f.def.type2 === t;

/** Extra MP from abilities. */
export function mpBonus(game: Game, f: Figure): number {
  let mp = 0;
  // Speed Booster (Dragonite) / Enhanced Core (Magnezone): "+1 MP" when it has evolved.
  if ((hasAbility(f, 'Speed Booster') || hasAbility(f, 'Enhanced Core')) && f.def.evolved) mp += 1;
  if (f.status === 'board') {
    // Sneaky Steps (Cacturne): "If there are no opposing Pokémon within two steps of this Pokémon, this Pokémon has MP 3 while on the field."
    if (hasAbility(f, 'Sneaky Steps')) {
      const d = game.distances(f.at!);
      if (!onField(game).some((o) => o.owner !== f.owner && (d.get(o.at!) ?? 99) <= 2)) mp = Math.max(mp, 3 - f.def.mp);
    }
  }
  // Mud Coating (Marshtomp, Swampert): "When this Pokémon is on the field, if there are 3 or more Water Pokémon on the field,
  // your Ground Pokémon with MP1 or lower get +1 MP."
  if (isType(f, 'Ground') && f.def.mp <= 1 && onField(game).some((o) => o.owner === f.owner && hasAbility(o, 'Mud Coating'))
    && onField(game).filter((o) => isType(o, 'Water')).length >= 3) mp += 1;
  return mp;
}

/** Can `f` get this condition? (immunity abilities) */
export function canHaveCondition(_game: Game, f: Figure, c: Condition): boolean {
  if (hasAbility(f, 'Immunity') && (c === 'poison' || c === 'noxious')) return false; // Zangoose
  if (hasAbility(f, 'Insomnia') && c === 'sleep') return false; // Drowzee, Honchkrow
  if (hasAbility(f, 'Own Tempo') && c === 'confusion') return false; // Spinda
  if ((hasAbility(f, 'Grounding') || hasAbility(f, 'Electric Fur')) && c === 'paralysis') return false; // Raichu, Flaaffy
  if (hasAbility(f, 'Leaf Guard') && c !== 'sleep') return false; // Meganium: "cannot be affected by special conditions other than sleep"
  return true;
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
      // Huge Power (Azumarill) / Guts (Machamp): +50 without / with a special condition.
      if (hasAbility(f, 'Huge Power') && !f.cond) dmg += 50;
      if (hasAbility(f, 'Guts') && f.cond) dmg += 50;
      // Band Attack (Zweilous, Hydreigon): "+10 damage for each Deino or Zweilous (or Hydreigon, as its text says) on the field."
      if (hasAbility(f, 'Band Attack')) {
        const names = ['Deino', 'Zweilous', 'Hydreigon'].filter((n) => f.def.ability!.effect.includes(n));
        dmg += 10 * onField(game).filter((o) => o !== f && names.includes(o.def.name)).length;
      }
      // Electric Upsurge (Ampharos, no stacking): "your Electric Pokémon deal +10 damage for each paralyzed Pokémon on the field."
      if (isType(f, 'Electric') && onField(game).some((o) => o.owner === f.owner && hasAbility(o, 'Electric Upsurge'))) {
        dmg += 10 * onField(game).filter((o) => o.cond === 'paralysis').length;
      }
      // Enhanced Core (Magnezone): "your Pokémon that are both Electric and Steel type deal +20 damage."
      if (isType(f, 'Electric') && isType(f, 'Steel') && onField(game).some((o) => o.owner === f.owner && hasAbility(o, 'Enhanced Core'))) dmg += 20;
      // Diffuse Poison (Crobat, no stacking): "all poisoned Pokémon will do a further −20 damage."
      if ((f.cond === 'poison' || f.cond === 'noxious') && onField(game).some((o) => hasAbility(o, 'Diffuse Poison'))) dmg -= 20;
      // Big Eggsplosion (Exeggutor): "If Barrage is spun, it deals +60 damage" with a friendly Exeggcute chosen.
      if (hasAbility(f, 'Big Eggsplosion') && m.name.startsWith('Barrage') && eggsplosionPartner(game, f)) dmg += 60;
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
    // Spinning Pattern (Poliwhirl): "Your opponent's spins are shifted by two segments in a clockwise direction."
    spinShift: (_f, opp) => (hasAbility(opp, 'Spinning Pattern') ? 2 : 0),
    transform(f: Figure, m: Move, opp: Figure): Move {
      const miss: Move = { name: 'Miss', color: 'red', damage: 0 };
      // Gale Wings (Fletchinder, Talonflame): "In its first battle after moving to the field, all of this Pokémon's White Attacks become Gold Attacks."
      if (m.color === 'white' && f.fresh && hasAbility(f, 'Gale Wings')) return { ...m, color: 'gold' };
      if (m.color !== 'blue') return m;
      // Blue Spark (Luxio): "The Dodges of opposing Pokémon adjacent to this Pokémon become Misses."
      if (neighbours(game, f).some((o) => o.owner !== f.owner && hasAbility(o, 'Blue Spark'))) return miss;
      // Electric Fur (Flaaffy): "If this Pokémon is not affected by a special condition, all of the Blue Attacks of
      // non-Ground battle opponents of this Pokémon become Misses."
      if (hasAbility(opp, 'Electric Fur') && !opp.cond && !isType(f, 'Ground')) return miss;
      // Rapid Approach: "All the Blue Attacks of this Pokémon's battle opponents become Misses."
      if (hasAbility(opp, 'Rapid Approach')) return miss;
      return m;
    },
  };
}

function eggsplosionPartner(game: Game, f: Figure): Figure | undefined {
  return onField(game).find((o) => o.owner === f.owner && o.def.name === 'Exeggcute');
}

/** Ability effects after a battle; returns notes for the log. */
export function afterBattle(game: Game, mover: Figure, other: Figure, r: BattleResult): string[] {
  const notes: string[] = [];
  for (const [self, opp, own] of [[mover, other, r.moverMove], [other, mover, r.otherMove]] as const) {
    const alive = (x: Figure) => x.status === 'board';
    // Hypnotic Stare (Poliwrath): "Any Pokémon that battles this Pokémon will become confused."
    if (hasAbility(self, 'Hypnotic Stare') && alive(opp) && game.setCondition(opp, 'confusion')) notes.push(`Hypnotic Stare: ${opp.def.name} queda confuso`);
    // Gooey (Goomy, Sliggoo): "Pokémon that battle with this Pokémon gain Wait."
    if (hasAbility(self, 'Gooey') && opp.status !== 'pc') { game.gainWait(opp); notes.push(`Gooey: ${opp.def.name} queda en Wait`); }
    // Big Eggsplosion: "If it does [deal +60 with Barrage], the Exeggcute is knocked out."
    if (hasAbility(self, 'Big Eggsplosion') && own.name.startsWith('Barrage')) {
      const egg = eggsplosionPartner(game, self);
      if (egg) { game.sendToPc(egg); notes.push(`Big Eggsplosion: ${egg.def.name} cae`); }
    }
    // Metamorphosis (Metapod, Kakuna): "If this Pokémon is not knocked out in battle, it can evolve."
    if (hasAbility(self, 'Metamorphosis') && alive(self)) {
      const next = game.evolveInDuel?.(self.def);
      if (next) {
        const from = self.def.name;
        self.def = { ...next, wheel: evolvedWheel(next), evolved: true };
        notes.push(`Metamorphosis: ${from} evoluciona en ${next.name}`);
      }
    }
  }
  return notes;
}
