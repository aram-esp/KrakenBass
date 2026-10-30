import type { BoardDef, Figure } from '../../src/types.ts';

export type Layout = BoardDef & { layout: Record<string, [number, number] | string> };

export const OWNER_COLOR = [0x2a6df4, 0xd8343c];
export const MOVE_COLOR: Record<string, string> = { white: '#ffffff', gold: '#ffc107', purple: '#8e44ad', blue: '#2f80ed', red: '#e74c3c' };
export const TYPE_COLOR: Record<string, number> = {
  Normal: 0xa8a77a, Fire: 0xee8130, Water: 0x6390f0, Electric: 0xf7d02c, Grass: 0x7ac74c, Ice: 0x96d9d6,
  Fighting: 0xc22e28, Poison: 0xa33ea1, Ground: 0xe2bf65, Flying: 0xa98ff3, Psychic: 0xf95587, Bug: 0xa6b91a,
  Rock: 0xb6a136, Ghost: 0x735797, Dragon: 0x6f35fc, Dark: 0x705746, Steel: 0xb7b7ce, Fairy: 0xd685ad,
};

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Data embedded in the page (published build) wins; otherwise fetch it (local dev server). */
export async function readData<T>(id: string, url: string): Promise<T> {
  const el = document.getElementById(id);
  if (el?.textContent) return JSON.parse(el.textContent) as T;
  return (await fetch(url)).json() as Promise<T>;
}

/** True in the single-file published build, which has no assets folder to probe. */
export const EMBEDDED = () => !!document.getElementById('data-board');

/** A way of drawing the duel. Match drives every view; only the visible one is shown. */
export interface View {
  canvas: HTMLCanvasElement;
  clearFigures(): void;
  addFigure(f: Figure): void;
  place(uid: string, node: string | null): void;
  setHighlights(nodes: Iterable<string>, selected: string | null): void;
  pick(ev: MouseEvent): { uid?: string; node?: string };
  setActive(on: boolean): void;
}

const spriteCache = new Map<string, Promise<string | null>>();
let embeddedSprites: Record<string, string> | null = null;

/**
 * Image URL for assets/sprites/<id>.png, or null when there is none. The published single-file build
 * carries the sprites as data: URIs in #data-sprites; the dev server serves the files.
 */
export function spriteSrc(id: string): Promise<string | null> {
  if (EMBEDDED()) {
    embeddedSprites ??= JSON.parse(document.getElementById('data-sprites')?.textContent || '{}');
    return Promise.resolve(embeddedSprites![id] ?? null);
  }
  if (!spriteCache.has(id)) {
    const url = `../assets/sprites/${id}.png`;
    spriteCache.set(id, fetch(url, { method: 'HEAD' }).then((r) => (r.ok ? url : null)).catch(() => null));
  }
  return spriteCache.get(id)!;
}
