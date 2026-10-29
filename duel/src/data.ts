import type { Color, FigureDef, Move, Segment } from './types.ts';

/** One entry of data/figures.json (see research/parse_figures.py). */
export interface FigureRecord {
  title: string;
  id: number;
  name: string;
  type: string;
  mp: number;
  rarity: string;
  wheels: Record<string, { kind: string; color: string | null; name: string; power: number | null; prob: number | null; stars: number | null }[]>;
}

const COLORS = new Set<string>(['white', 'gold', 'purple', 'blue', 'red']);

/** Build an engine figure from a record, using its first (newest) wheel and skipping Z-Moves and colourless rows. */
export function toFigureDef(rec: FigureRecord): FigureDef {
  const wheel: Segment[] = [];
  const newest = Object.values(rec.wheels)[0] ?? [];
  for (const s of newest) {
    if (s.kind !== 'duelattack' || !s.color || !COLORS.has(s.color) || !s.prob) continue;
    const move: Move = { name: s.name, color: s.color as Color, damage: s.power ?? 0, stars: s.stars ?? 0 };
    wheel.push({ move, weight: s.prob });
  }
  if (!wheel.length) wheel.push({ move: { name: 'Miss', color: 'red', damage: 0 }, weight: 1 });
  return { id: String(rec.id), type: rec.type, name: rec.name, mp: rec.mp, wheel };
}
