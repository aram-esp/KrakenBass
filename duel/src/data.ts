import type { Color, FigureDef, Move, Segment } from './types.ts';

/** One entry of data/figures.json (see research/parse_figures.py). */
export interface FigureRecord {
  title: string;
  id: number;
  name: string;
  type: string;
  mp: number;
  rarity: string;
  type2?: string | null;
  /** Abilities by version, keyed like `wheels`. */
  abilities?: Record<string, { type?: string; name: string; effect: string | null }[] | { type?: string; name: string; effect: string | null }>;
  /** Game version in which the figure was released, e.g. "1.3.2". */
  version: string;
  wheels: Record<string, { kind: string; color: string | null; name: string; power: number | null; prob: number | null; stars: number | null }[]>;
}

const COLORS = new Set<string>(['white', 'gold', 'purple', 'blue', 'red']);

/**
 * Game version the duel is played at: only figures released by then, each with its wheel at that version.
 * The user asked (2026-10-30) for the launch version 1.0.0 (82 figures). Other cuts tried: '3.0.12' (last version
 * before the Mega update 4.0.0, 265 figures). Set to null to use every figure with its newest wheel.
 */
export const GAME_VERSION: string | null = '1.0.0';

const parseVersion = (v: string) => v.split('.').map(Number);

/** <0, 0 or >0 like a comparator: "3.0.12" vs "4.0.0" -> negative. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Was the figure already released at game version `v`? */
export function releasedBy(rec: FigureRecord, v: string | null): boolean {
  return v === null || compareVersions(rec.version, v) <= 0;
}

/**
 * Wheel key valid at game version `v`. Keys are "default" (never changed), "Version a-b" (a to b inclusive) or
 * "Version a" (a onwards). If no key covers `v`, the one that started last before it. Null `v`: the first (newest) key.
 */
export function wheelKeyAt(rec: FigureRecord, v: string | null): string | undefined {
  const keys = Object.keys(rec.wheels);
  if (v === null) return keys[0];
  let best: { key: string; from: string } | undefined;
  for (const key of keys) {
    if (key === 'default') return key;
    const m = /^Version (\d+(?:\.\d+)*)(?:-(\d+(?:\.\d+)*))?\.?$/.exec(key);
    if (!m) continue;
    const [, from, to] = m;
    if (compareVersions(from, v) > 0) continue;
    if (!to || compareVersions(v, to) <= 0) return key;
    if (!best || compareVersions(from, best.from) > 0) best = { key, from };
  }
  return best?.key;
}

/** Build an engine figure from a record, using its wheel at game version `v` and skipping Z-Moves and colourless rows. */
export function toFigureDef(rec: FigureRecord, v: string | null = null): FigureDef {
  const wheel: Segment[] = [];
  const key = wheelKeyAt(rec, v);
  const segments = (key && rec.wheels[key]) || [];
  for (const s of segments) {
    if (s.kind !== 'duelattack' || !s.color || !COLORS.has(s.color) || !s.prob) continue;
    const move: Move = { name: s.name, color: s.color as Color, damage: s.power ?? 0, stars: s.stars ?? 0 };
    wheel.push({ move, weight: s.prob });
  }
  if (!wheel.length) wheel.push({ move: { name: 'Miss', color: 'red', damage: 0 }, weight: 1 });
  const abKey = rec.abilities ? wheelKeyAt({ ...rec, wheels: rec.abilities } as unknown as FigureRecord, v) : undefined;
  const abs = abKey ? rec.abilities![abKey] : undefined;
  const ab = (Array.isArray(abs) ? abs : abs ? [abs] : []).find((a) => a && a.name && a.name !== 'None');
  return {
    id: String(rec.id), type: rec.type, name: rec.name, mp: rec.mp, wheel,
    ...(rec.type2 ? { type2: rec.type2 } : {}),
    ...(ab ? { ability: { name: ab.name, effect: (ab.effect ?? '').replace(/\{\{mp\}\}/g, 'MP').trim() } } : {}),
  };
}

/** The figures that can appear in a duel at game version `v`, each with its wheel at that version. */
export function figurePool(records: FigureRecord[], v: string | null = GAME_VERSION): FigureDef[] {
  return records.filter((r) => releasedBy(r, v)).map((r) => toFigureDef(r, v));
}
