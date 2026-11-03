/**
 * The player's hotel and its worker: an "amiibo"-style AI (see docs/amiibo.md).
 *
 * Like a Smash Figure Player, the worker is the normal AI (src/ai.ts) plus its own weights, which it learns by
 * imitating the player it trains against (the FP copies its opponent's style). Level 1-50 lowers its mistakes; its
 * personality is read from the weights with branches and thresholds, after Smash Ultimate's.
 * The player's own hotel, the worker, guests and every number here are INVENTED for this game (2026-11-02);
 * only the idea (base AI + learned data, imitation, level 1-50, learning on/off, personality from attributes) comes from
 * the Smash sources in docs/amiibo.md.
 */
import { DEFAULT_WEIGHTS, aiTurn, levelWeights, type AiWeights, type Features } from './ai.ts';
import { Game } from './game.ts';
import type { PlateDef } from './plates.ts';
import { houseRules } from './rules.config.ts';
import type { Rng } from './rng.ts';
import type { BoardDef, FigureDef, PlayerId } from './types.ts';

export interface Worker {
  /** The figure the worker is (its sprite and name). */
  figureId: string;
  name: string;
  /** Its deck (figure ids) and plates (plate ids), given by the player. */
  deck: string[];
  plates: string[];
  weights: AiWeights;
  exp: number;
  learn: boolean;
  wins: number;
  losses: number;
  /** Times it copied a choice of the player. */
  lessons: number;
  /** Mistakes set by hand: no longer used (the setting was removed on 2026-11-03); kept so old saves load. */
  noiseOverride?: number | null;
  /** When the last guest was attended (ms). */
  lastGuestAt: number;
}

export interface MyHotel { name: string; worker: Worker; coins: number }

export const MAX_LEVEL = 50;
/** INVENTED: 200 experience a level; a training duel gives 150 (win or lose), a guest 100 (win) or 40 (loss). */
export const EXP_PER_LEVEL = 200;
export const TRAIN_EXP = 150;
export const GUEST_EXP = { win: 100, loss: 40 };
/** INVENTED: coins a won guest duel leaves at the hotel, one guest every 30 minutes, at most 8 waiting. */
export const GUEST_COINS = 150;
export const GUEST_EVERY_MS = 30 * 60 * 1000;
export const MAX_GUESTS = 8;
/** INVENTED: how far one lesson moves the weights, and the range they can take (× the default). */
export const LEARN_RATE = 0.12;
export const W_MIN = 0.2, W_MAX = 5;

export const levelOf = (w: Worker) => Math.min(MAX_LEVEL, 1 + Math.floor(w.exp / EXP_PER_LEVEL));
/** INVENTED: random noise on its choices, from 60 at level 1 to 2 at level 50 (kept for reference; workerWeights uses levelWeights). */
export const noiseAt = (level: number) => 60 - (58 * (level - 1)) / (MAX_LEVEL - 1);
/** Its AI: its learned weights at its level (the same scale as the rivals' levels, src/ai.ts levelWeights). */
export const workerWeights = (w: Worker): AiWeights => levelWeights({ ...w.weights, noise: 2 }, levelOf(w));
/** Trait names for the customisation screen. */
export const TRAIT_ES: Record<Exclude<keyof AiWeights, 'noise'>, string> = {
  danger: 'Tapar un peligro inmediato', danger2: 'Prever peligro a 2 turnos', threat: 'Amenazar la portería rival', progress: 'Adelantar a su figura más avanzada',
  progressAll: 'Adelantar a todas', onBoard: 'Sacar figuras del banquillo', surround: 'Rodear figuras', guardGoal: 'Ponerse en su portería',
  koValue: 'Buscar combates (valor de un KO)', exposure: 'Evitar combates que perdería',
};

export function newWorker(figureId: string, name: string, deck: string[], plates: string[], now: number): Worker {
  return { figureId, name, deck, plates, weights: { ...DEFAULT_WEIGHTS }, exp: 0, learn: true, wins: 0, losses: 0, lessons: 0, lastGuestAt: now };
}

const LEARNED: (keyof AiWeights)[] = ['danger', 'danger2', 'threat', 'progress', 'progressAll', 'onBoard', 'surround', 'guardGoal', 'koValue', 'exposure'];

/**
 * One lesson: the player chose a move with features `chosen` where the worker would have picked `own`. Every weight moves
 * toward what explains the player's choice, in proportion to how much it mattered (a multiplicative step, so the
 * different scales of the weights do not matter). Returns false if there was nothing to learn.
 */
export function learnFrom(w: Worker, chosen: Features, own: Features, rate = LEARN_RATE): boolean {
  if (!w.learn) return false;
  const c = LEARNED.map((k) => (chosen[k] - own[k]) * w.weights[k]);
  const total = c.reduce((t, x) => t + Math.abs(x), 0);
  if (total < 1e-6) return false;
  LEARNED.forEach((k, i) => {
    const step = Math.exp(rate * Math.sign(c[i]) * Math.abs(c[i]) / total);
    w.weights[k] = Math.min(DEFAULT_WEIGHTS[k] * W_MAX, Math.max(DEFAULT_WEIGHTS[k] * W_MIN, w.weights[k] * step));
  });
  w.lessons++;
  return true;
}

/**
 * Personality, after Smash Ultimate (a branch per style, points from the attributes, the branch with most points wins,
 * three tiers by threshold, "Normal" when no branch stands out). The tier names are Smash's personalities in Spanish;
 * which weights make each branch is this game's own.
 */
export const BRANCHES: { key: string; label: string; weights: (keyof AiWeights)[]; tiers: [string, string, string] }[] = [
  { key: 'def', label: 'Defensa', weights: ['danger', 'danger2', 'guardGoal'], tiers: ['Cauto', 'Realista', 'Imperturbable'] },
  { key: 'ofn', label: 'Ataque', weights: ['threat', 'progress'], tiers: ['Entusiasta', 'Agresivo', 'Ofensivo'] },
  { key: 'rsk', label: 'Combate', weights: ['koValue'], tiers: ['Temerario', 'Buscaemociones', 'Intrépido'] },
  { key: 'gen', label: 'Rodear', weights: ['surround'], tiers: ['Versátil', 'Astuto', 'Técnico'] },
  { key: 'cau', label: 'Prudencia', weights: ['exposure'], tiers: ['Frío', 'Lógico', 'Sagaz'] },
  { key: 'dyn', label: 'Despliegue', weights: ['onBoard', 'progressAll'], tiers: ['Tranquilo', 'Salvaje', 'Vivaz'] },
];
export const TIER_AT = [1.15, 1.5, 2];

export function branchScores(w: AiWeights): { key: string; label: string; ratio: number }[] {
  return BRANCHES.map((b) => ({ key: b.key, label: b.label, ratio: b.weights.reduce((t, k) => t + w[k] / DEFAULT_WEIGHTS[k], 0) / b.weights.length }));
}

export function personality(w: AiWeights): string {
  const s = branchScores(w);
  const best = s.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const tier = TIER_AT.filter((t) => best.ratio >= t).length;
  if (!tier) return 'Normal';
  return BRANCHES.find((b) => b.key === best.key)!.tiers[tier - 1];
}

/** Guests waiting at the hotel now. */
export const guestsWaiting = (w: Worker, now: number) => Math.min(MAX_GUESTS, Math.floor((now - w.lastGuestAt) / GUEST_EVERY_MS));

/** Play one duel with no screen: the worker (player 0) against a guest (player 1). True if the worker won. */
export function playHeadless(board: BoardDef, workerDeck: FigureDef[], guestDeck: FigureDef[], workerPlates: PlateDef[], guestPlates: PlateDef[],
  weights: AiWeights, guest: AiWeights | undefined, rng: Rng, seed: (n: number) => Rng): boolean {
  const g = new Game(board, [workerDeck, guestDeck], seed(Math.floor(rng() * 1e9)), houseRules, (rng() < 0.5 ? 0 : 1) as PlayerId, [workerPlates, guestPlates]);
  for (let n = 0; g.winner === null && n < 3000; n++) aiTurn(g, rng, g.current === 0 ? weights : guest);
  return g.winner === 0;
}
