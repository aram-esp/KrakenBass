/**
 * Single-player modes of the original: Training Center stages, Carmonte Island hotels and League ranks.
 *
 * Sourced (2026-11-02):
 * - Bulbapedia "Training Center (Duel)" (data/training.json via tools/build_training.py): every stage's decks, plates,
 *   three challenges and bonus.
 * - Fandom "Quests": hotels, leaders, number of stages, unlocked by completing the previous hotel; an emblem per hotel.
 * - Bulbapedia "League Match": leagues by rating (Beginner 0-1299 ... Legend 3000+).
 * INVENTED (marked below): hotel opponents' decks and rewards, hotel challenges, rating changes.
 */
import type { BattleResult } from './battle.ts';
import type { Game } from './game.ts';
import type { Figure, PlayerId } from './types.ts';

export interface TrainingStage {
  set: string;
  title: string;
  opponent: string;
  challenges: string[];
  opponentDeck: string[];
  opponentPlates: string[];
  playerDeck: string[];
  playerPlates: string[];
  reward: string;
}

/** What happened in a duel, for the challenges. */
export interface DuelStats {
  battlesStarted: number;
  blueSpins: number;
  goldSpins: number;
  koInBattle: number;
  poisoned: number;
  slept: number;
  surrounds: number;
  plates: string[];
  ownGoal: boolean;
  oppEntry: boolean;
  blockBoth: boolean;
  allOffBench: boolean;
  winByGoal: boolean;
  turns: number;
  /** Opponent figures' conditions last seen (to count new ones). */
  seen: Record<string, string | null>;
}

export const newStats = (): DuelStats => ({
  battlesStarted: 0, blueSpins: 0, goldSpins: 0, koInBattle: 0, poisoned: 0, slept: 0, surrounds: 0, plates: [],
  ownGoal: false, oppEntry: false, blockBoth: false, allOffBench: false, winByGoal: false, turns: 0, seen: {},
});

/** A battle ended (not a tie re-spin). */
export function noteBattle(s: DuelStats, mover: Figure, other: Figure, r: BattleResult, me: PlayerId): void {
  if (mover.owner === me) s.battlesStarted++;
  const mine = mover.owner === me ? r.moverMove : other.owner === me ? r.otherMove : null;
  if (mine?.color === 'blue') s.blueSpins++;
  if (mine?.color === 'gold') s.goldSpins++;
  for (const k of r.ko) if (k.owner !== me && (mover.owner === me ? r.winner === 'mover' : r.winner === 'other')) s.koInBattle++;
}

/** Look at the board (after every action). */
export function observe(s: DuelStats, g: Game, me: PlayerId): void {
  const opp = (1 - me) as PlayerId;
  const at = (n: string) => g.figureAt(n);
  s.turns = g.turn;
  if (at(g.board.def.goals[me])?.owner === me) s.ownGoal = true;
  const entries = g.board.def.spawns[opp];
  if (entries.some((n) => at(n)?.owner === me)) s.oppEntry = true;
  if (entries.every((n) => at(n)?.owner === me)) s.blockBoth = true;
  if (!g.figures.some((f) => f.owner === me && f.status === 'bench')) s.allOffBench = true;
  for (const f of g.figures) {
    if (f.owner !== opp) continue;
    const c = f.status === 'board' ? f.cond ?? null : null;
    if (c && c !== s.seen[f.uid]) { if (c === 'poison' || c === 'noxious') s.poisoned++; if (c === 'sleep') s.slept++; }
    s.seen[f.uid] = c;
  }
  for (const p of g.plates[me]) if (p.used && !s.plates.includes(p.def.name)) s.plates.push(p.def.name);
  if (g.winner === me && g.figures.some((f) => f.owner === me && f.at === g.board.def.goals[opp])) s.winByGoal = true;
}

/** Spanish text of a challenge (the data is in English). */
export function challengeEs(t: string): string {
  const n = /(\d+) times?/.exec(t)?.[1];
  const veces = n === '1' ? '1 vez' : `${n} veces`;
  const table: [RegExp, string][] = [
    [/^Win by moving a Pokémon to the goal point/, 'Gana llevando una figura a la portería rival (no por Wait).'],
    [/^Don't initiate any battles/, 'No inicies ningún combate.'],
    [/goal point in (\d+) or fewer turns/, `Llega a la portería rival en ${/(\d+) or fewer/.exec(t)?.[1]} turnos o menos.`],
    [/^Put one of your Pokémon on your own goal point/, 'Pon una figura tuya en tu propia portería.'],
    [/^Use (.+)\.$/, `Usa la plate ${/^Use (.+)\.$/.exec(t)?.[1]}.`],
    [/^Put one of your Pokémon on one of your opponent's entry points/, 'Pon una figura tuya en una entrada del rival.'],
    [/blue Attacks/, `Saca un ataque azul ${veces}.`],
    [/^Poison an opponent's/, `Envenena a figuras rivales ${veces}.`],
    [/^Put an opponent's Figures to sleep/, `Duerme a figuras rivales ${veces}.`],
    [/^Knock out (\d+) opposing Figures in battle/, `Noquea a ${/Knock out (\d+)/.exec(t)?.[1]} figuras rivales en combate.`],
    [/^Surround a Pokémon/, `Rodea a una figura ${veces}.`],
    [/^Move all Pokémon off the bench/, 'Saca todas tus figuras del banquillo.'],
    [/^Block both of your opponent's entry points/, 'Bloquea las dos entradas del rival con figuras.'],
    [/^Win after your own Figures use gold Attacks/, `Gana tras sacar ataques dorados ${veces}.`],
    [/^Win the duel\.?$/, 'Gana el duelo.'],
    [/^Win in (\d+) or fewer turns/, `Gana en ${/(\d+) or fewer/.exec(t)?.[1]} turnos o menos.`],
  ];
  // "Use your Figures' blue Attacks" also starts with "Use": check it first.
  if (/blue Attacks/.test(t)) return `Saca un ataque azul ${veces}.`;
  return table.find(([re]) => re.test(t))?.[1] ?? t;
}

/** Was the challenge met? (null: this game does not check it). Checked at the end of the duel. */
export function challengeMet(t: string, s: DuelStats, won: boolean): boolean | null {
  const n = Number(/(\d+) times?/.exec(t)?.[1] ?? 1);
  if (/blue Attacks/.test(t)) return s.blueSpins >= n;
  if (/^Win by moving a Pokémon to the goal point/.test(t)) return won && s.winByGoal;
  if (/^Don't initiate any battles/.test(t)) return won && s.battlesStarted === 0;
  let m;
  if ((m = /goal point in (\d+) or fewer turns/.exec(t))) return won && s.winByGoal && s.turns <= Number(m[1]);
  if (/^Put one of your Pokémon on your own goal point/.test(t)) return s.ownGoal;
  if (/^Put one of your Pokémon on one of your opponent's entry points/.test(t)) return s.oppEntry;
  if (/^Poison an opponent's/.test(t)) return s.poisoned >= n;
  if (/^Put an opponent's Figures to sleep/.test(t)) return s.slept >= n;
  if ((m = /^Knock out (\d+) opposing Figures in battle/.exec(t))) return s.koInBattle >= Number(m[1]);
  if (/^Surround a Pokémon/.test(t)) return s.surrounds >= n;
  if (/^Move all Pokémon off the bench/.test(t)) return s.allOffBench;
  if (/^Block both of your opponent's entry points/.test(t)) return s.blockBoth;
  if (/^Win after your own Figures use gold Attacks/.test(t)) return won && s.goldSpins >= n;
  if (/^Win the duel\.?$/.test(t)) return won;
  if ((m = /^Win in (\d+) or fewer turns/.exec(t))) return won && s.turns <= Number(m[1]);
  if ((m = /^Use (.+)\.$/.exec(t))) return s.plates.includes(m[1]);
  return null;
}

/** A stage's bonus (Bulbapedia text) as gems, plates and figures by name. */
export function parseReward(t: string): { gems: number; names: string[] } {
  let gems = 0;
  const names: string[] = [];
  for (const part of t.split(',').map((x) => x.trim()).filter(Boolean)) {
    const g = /^Gems\s*×\s*(\d+)/.exec(part);
    if (g) gems += Number(g[1]);
    else names.push(part.replace(/\s*\(\d+\)$/, ''));
  }
  return { gems, names };
}

// ---------- Carmonte Island hotels (Fandom "Quests") ----------
export interface Hotel { name: string; leader: string; stages: number }
export const HOTELS: Hotel[] = [
  { name: 'Ulex', leader: 'Yuji', stages: 12 },
  { name: 'Chateau de Rosa', leader: 'Nadya', stages: 15 },
  { name: 'Atlantis', leader: 'Joe', stages: 18 },
  { name: 'Olivia Palace', leader: 'Brenda', stages: 20 },
  { name: 'The Volcano', leader: 'Don Roger', stages: 25 },
  { name: 'Elysium', leader: 'NO7', stages: 30 },
];

/** INVENTED: the challenges of a hotel stage (the sources do not list them). */
export const HOTEL_CHALLENGES = ['Win the duel.', 'Win in 20 or fewer turns.', 'Knock out 2 opposing Figures in battle.'];
/** INVENTED: coins for the first win of a hotel stage, and gems for beating a leader. */
export const hotelCoins = (h: number) => 300 * (h + 1);
export const LEADER_GEMS = 50;

/**
 * INVENTED: a hotel stage's opponent deck. Seeded by hotel and stage so it is always the same; later hotels and stages
 * take rarer figures, and the leader (last stage) the rarest the pool has.
 */
export function hotelDeck<T extends { id: string }>(h: number, stage: number, pool: T[], rarityOf: (id: string) => string, rng: (seed: number) => () => number): T[] {
  const order = ['Common', 'Uncommon', 'Rare', 'EX'];
  const r = rng(1000 * (h + 1) + stage);
  const leader = stage === HOTELS[h].stages - 1;
  const level = Math.min(3, (h + stage / HOTELS[h].stages * 1.5) / 1.8 + (leader ? 1 : 0));
  const deck: T[] = [];
  for (let i = 0; i < 6; i++) {
    const want = Math.max(0, Math.min(3, Math.floor(level + r() * 1.6 - 0.4)));
    const list = pool.filter((d) => order.indexOf(rarityOf(d.id)) === want);
    deck.push((list.length ? list : pool)[Math.floor(r() * (list.length || pool.length))]);
  }
  return deck;
}

// ---------- League ranks (Bulbapedia "League Match") ----------
export const LEAGUES: [string, number][] = [
  ['Beginner', 0], ['Trainer', 1300], ['Leader', 1500], ['Elite', 1700], ['Champion', 1900],
  ['Great', 2100], ['Ultra', 2400], ['Master', 2700], ['Legend', 3000],
];
export const leagueOf = (rating: number) => [...LEAGUES].reverse().find(([, min]) => rating >= min)![0];
/** INVENTED: starting rating, and an Elo change against an AI of your own rating (so ±16 a duel). */
export const START_RATING = 1000;
export const ELO_K = 32;
export function ratingChange(rating: number, won: boolean, ai = rating): number {
  const expect = 1 / (1 + 10 ** ((ai - rating) / 400));
  return Math.round(ELO_K * ((won ? 1 : 0) - expect));
}

export interface StoryState {
  rating: number;
  /** Training stage index -> challenges met (kept once met) and whether the bonus was given. */
  training: Record<number, { done: boolean[]; bonus?: boolean }>;
  /** Hotel index -> stages beaten (in order) and challenges met per stage. */
  hotels: Record<number, { cleared: number; done: Record<number, boolean[]> }>;
}
export const newStory = (): StoryState => ({ rating: START_RATING, training: {}, hotels: {} });
export const hotelUnlocked = (s: StoryState, h: number) => h === 0 || (s.hotels[h - 1]?.cleared ?? 0) >= HOTELS[h - 1].stages;
export const emblems = (s: StoryState) => HOTELS.filter((x, h) => (s.hotels[h]?.cleared ?? 0) >= x.stages).length;

/**
 * INVENTED: the AI style of a hotel stage. The first stages of Ulex play like rookies, the rest take a style by stage,
 * and each leader always plays its own style with few mistakes.
 */
export const LEADER_STYLE = ['balanced', 'tactician', 'defensive', 'hunter', 'aggressive', 'balanced'];
export function hotelStyle(h: number, stage: number): { key: string; leader: boolean } {
  if (stage === HOTELS[h].stages - 1) return { key: LEADER_STYLE[h], leader: true };
  if (h === 0 && stage < 4) return { key: 'rookie', leader: false };
  const keys = ['balanced', 'defensive', 'aggressive', 'hunter', 'tactician'];
  return { key: keys[(h * 7 + stage * 3) % keys.length], leader: false };
}

// ---------- Offline ranking (INVENTED, 2026-11-03) ----------
/** A trainer of the offline ranking: league rivals are taken from here, and their points move like yours. */
export interface Trainer { name: string; rating: number; style: string }

const FIRST = ['Álex', 'Noa', 'Kai', 'Lúa', 'Iker', 'Vera', 'Mateo', 'Nora', 'Leo', 'Olivia', 'Hugo', 'Mía', 'Dani', 'Irene', 'Bruno', 'Alba',
  'Teo', 'Carla', 'Marco', 'Sofía', 'Gael', 'Lola', 'Pau', 'Elsa', 'Unai', 'Ariadna', 'Rui', 'Celia', 'Enzo', 'Julia'];
const NICK = ['Rayo', 'Bruma', 'Cometa', 'Escarcha', 'Trueno', 'Brasa', 'Marea', 'Roca', 'Sombra', 'Viento', 'Chispa', 'Nube', 'Brote', 'Acero', 'Eco'];
export const LADDER_SIZE = 60;

/** A new ranking: 60 trainers, most of them in the low leagues. */
export function newLadder(rng: () => number): Trainer[] {
  const styles = ['balanced', 'defensive', 'aggressive', 'hunter', 'tactician'];
  const used = new Set<string>();
  const out: Trainer[] = [];
  while (out.length < LADDER_SIZE) {
    const name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${NICK[Math.floor(rng() * NICK.length)]}`;
    if (used.has(name)) continue;
    used.add(name);
    const rating = Math.round(600 + 2600 * rng() ** 2.2); // skewed toward the low leagues
    out.push({ name, rating, style: styles[Math.floor(rng() * styles.length)] });
  }
  return out;
}

/** A rival for a league duel: one of the 6 trainers closest to your points. */
export function pickRival(ladder: Trainer[], rating: number, rng: () => number): number {
  const near = ladder.map((t, i) => ({ i, d: Math.abs(t.rating - rating) })).sort((a, b) => a.d - b.d).slice(0, 6);
  return near[Math.floor(rng() * near.length)].i;
}

/** The rest of the ranking plays too: a few duels among the trainers after each of yours. */
export function driftLadder(ladder: Trainer[], rng: () => number, duels = 6): void {
  for (let k = 0; k < duels; k++) {
    const a = ladder[Math.floor(rng() * ladder.length)];
    const near = ladder.filter((t) => t !== a && Math.abs(t.rating - a.rating) < 250);
    const b = near[Math.floor(rng() * near.length)];
    if (!b) continue;
    const d = ratingChange(a.rating, rng() < 1 / (1 + 10 ** ((b.rating - a.rating) / 400)), b.rating);
    a.rating = Math.max(0, a.rating + d);
    b.rating = Math.max(0, b.rating - d);
  }
}

/** AI level (1-50) of a rival by its points: about 3 at the start (1000), 50 from 3000. */
export const aiLevelFor = (rating: number) => Math.max(1, Math.min(50, Math.round((rating - 900) / 42) + 1));
/** AI level of a hotel stage: Ulex 1-9 ... Elysium 41-49, leaders +3. */
export const hotelLevel = (h: number, stage: number) =>
  Math.min(50, 1 + h * 8 + Math.floor((stage / HOTELS[h].stages) * 8) + (stage === HOTELS[h].stages - 1 ? 3 : 0));
