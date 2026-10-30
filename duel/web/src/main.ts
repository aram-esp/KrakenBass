import { figurePool, type FigureRecord } from '../../src/data.ts';
import type { FigureDef } from '../../src/types.ts';
import { $, readData, type Layout } from './shared.ts';
import { Match } from './match.ts';
import { View2D } from './view2d.ts';
import { View3D } from './view3d.ts';

async function main() {
  const [board, records] = await Promise.all([
    readData<Layout>('data-board', '../data/board.json'),
    readData<FigureRecord[]>('data-figures', '../data/figures.json'),
  ]);
  const pool: FigureDef[] = figurePool(records);
  const c2 = $<HTMLCanvasElement>('view2d'), c3 = $<HTMLCanvasElement>('view');
  const v2 = new View2D(board, c2), v3 = new View3D(board, c3);
  const match = new Match([v2, v3], board, pool);
  match.start();

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
}

main();
