import type { Game } from '../../src/game.ts';
import type { PlayerId } from '../../src/types.ts';

const HUMAN: PlayerId = 0;

/**
 * The guided tutorial: tips that appear once, when the duel reaches the moment they explain. The duel itself is the
 * original game's tutorial (Bulbapedia "Training Center (Duel)": the player against Luca, with these decks); the tips
 * are this game's own text (2026-11-03).
 */
export class Coach {
  private shown = new Set<string>();
  private queue: string[] = [];
  private events = new Set<string>();
  constructor(private plateName: string | null) {}

  /** Something happened in the duel ('battle', 'ko'). */
  note(ev: string) { this.events.add(ev); }

  private once(key: string, when: boolean, text: string) {
    if (when && !this.shown.has(key)) { this.shown.add(key); this.queue.push(text); }
  }

  /** The next tip to show now, if any. */
  next(g: Game): string | null {
    const mine = g.figures.filter((f) => f.owner === HUMAN);
    const myTurn = g.current === HUMAN && g.winner === null;
    const onBoard = mine.filter((f) => f.status === 'board');
    this.once('intro', true, '¡Bienvenido al Duelo de Figuras! Ganas si llevas una de tus figuras a la portería del rival: el círculo grande del otro lado del tablero. '
      + 'Tú defiendes la de tu lado. También ganas si el rival se queda sin ningún movimiento posible.');
    this.once('bench', myTurn && !onBoard.length, 'Es tu turno. Tus figuras empiezan en el banquillo. Toca una: las casillas verdes son adonde puede ir. '
      + 'El número azul de cada figura son sus MP, las casillas que avanza en un turno. Salir del banquillo cuesta 1 MP y se entra por una de tus dos entradas. '
      + 'Quien empieza el duelo tiene 1 MP menos en su primer turno.');
    this.once('moved', myTurn && onBoard.length > 0 && g.turn > 2, 'Cada turno mueves solo una figura, o ninguna. '
      + 'Si al acabar hay una figura tuya al lado de una rival, puedes combatir; si no, el turno pasa al rival solo.');
    const fighter = myTurn && mine.some((f) => g.canAttack(f) && g.adjacentEnemies(f).length);
    this.once('canBattle', fighter, 'Tienes una figura al lado de un rival. Para combatir, toca tu figura y después al rival (anillo rojo). '
      + 'Puedes combatir aunque no hayas movido. Combatir termina el turno.');
    this.once('battle', this.events.has('battle'), 'Así es un combate: las dos ruletas giran y cada figura saca un ataque. '
      + 'Blanco: daño, gana el número más alto. Dorado: daño, y además gana al morado. Morado: efecto especial (veneno, sueño…); gana al blanco, y entre dos morados ganan más estrellas ★. '
      + 'Azul: esquiva, gana a todo pero no noquea. Rojo: Fallo, pierde siempre. Solo un ataque blanco o dorado que gana deja fuera de combate al rival.');
    this.once('ko', this.events.has('ko'), 'Una figura ha quedado fuera de combate: va al P.C., donde caben 2. '
      + 'Si entra una tercera, la que lleva más tiempo vuelve al banquillo y puede salir otra vez.');
    const toMyGoal = g.distances(g.board.def.goals[HUMAN]);
    const near = g.figures.some((f) => f.owner !== HUMAN && f.status === 'board' && (toMyGoal.get(f.at!) ?? 99) <= 2);
    this.once('defend', myTurn && near, '¡Cuidado! Un rival está a 2 casillas o menos de tu portería. Ponle una figura en medio, ponte encima de tu portería o combate contra él.');
    this.once('surround', myTurn && g.turn >= 7, 'Rodear: si todas las casillas de alrededor de una figura las ocupan figuras rivales (despiertas), queda fuera de combate sin combatir. '
      + 'Vale para ti y para el rival: no dejes a tus figuras encerradas.');
    this.once('plates', myTurn && !!this.plateName && g.turn >= 5 && g.plates[HUMAN].some((p) => !p.used),
      `Abajo a la derecha está PLATES: cartas que se usan una vez por duelo, al principio de tu turno y antes de mover. `
      + `La tuya es ${this.plateName}: tus figuras de tipo Planta hacen +20 de daño hasta que una de ellas noquee a un rival; usarla termina el turno.`);
    this.once('ai', myTurn && g.turn >= 9, 'Si dudas, el botón IA juega tu turno por ti. Y si quieres más, en el menú tienes la Liga, el Training Center, los hoteles y la Pokédex con todas las reglas.');
    return this.queue.shift() ?? null;
  }
}
