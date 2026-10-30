import { evolutionPool, figurePool, type FigureRecord, type InventedFigure } from '../../src/data.ts';
import type { FigureDef } from '../../src/types.ts';
import { $, readData, type Layout } from './shared.ts';
import { Match } from './match.ts';
import { buildHud } from './hud.ts';
import { setupMenus } from './menus.ts';
import { View2D } from './view2d.ts';
import { View3D } from './view3d.ts';

async function main() {
  buildHud();
  const [board, records, evo] = await Promise.all([
    readData<Layout>('data-board', '../data/board.json'),
    readData<FigureRecord[]>('data-figures', '../data/figures.json'),
    readData<{ evolves: Record<string, (string | number)[]>; invented?: Record<string, InventedFigure> }>('data-evolutions', '../data/evolutions.json'),
  ]);
  const pool: FigureDef[] = figurePool(records);
  const evolves = Object.fromEntries(Object.entries(evo.evolves).map(([k, v]) => [k, [...new Set(v.map(String))]]));
  const invented = evo.invented ?? {};
  const extras = evolutionPool(records, evolves, pool, undefined, invented);
  // Invented evolutions take the rarity of the stage they come from; listed as records for the menus and the wiki.
  const rarityOf = (id: string): string => records.find((r) => String(r.id) === id)?.rarity ?? (invented[id] ? rarityOf(invented[id].from) : 'Common');
  const allRecords: FigureRecord[] = [...records, ...Object.entries(invented).map(([id, inv]) => ({
    title: inv.name, id: id as unknown as number, name: inv.name, type: inv.type, type2: inv.type2, mp: 0,
    rarity: rarityOf(id), version: 'inventada', wheels: {},
  }))];
  const c2 = $<HTMLCanvasElement>('view2d'), c3 = $<HTMLCanvasElement>('view');
  const v2 = new View2D(board, c2), v3 = new View3D(board, c3);
  const match = new Match([v2, v3], board, pool);
  const menus = setupMenus(pool, allRecords, {
    play: (deck) => match.start(deck),
    canContinue: () => !!match.game && match.game.winner === null,
  }, extras, evolves);
  match.onMenu = menus.open;
  const allDefs = new Map([...pool, ...extras].map((d) => [d.id, d]));
  match.evolveInDuel = (d) => { const t = (evolves[d.id] ?? []).find((x) => allDefs.has(x)); return t ? allDefs.get(t)! : null; };
  match.onGameEnd = (won, deckIds) => menus.duelEnded(won, deckIds);
  match.onBattleFought = (id) => menus.battleFought(id);

  let mode: '2d' | '3d' = '2d';
  const show = (m: '2d' | '3d') => {
    mode = m;
    c2.hidden = m !== '2d';
    c3.hidden = m !== '3d';
    v2.setActive(m === '2d');
    v3.setActive(m === '3d');
    $('viewToggle').textContent = m === '2d' ? 'Vista 2.5D' : 'Vista 2D';
  };
  $('viewToggle').onclick = () => show(mode === '2d' ? '3d' : '2d');
  show('3d'); // 2.5D: 3D board with sprite billboards (View3D)
  menus.open();
}

main();
