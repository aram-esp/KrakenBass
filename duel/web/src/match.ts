import { Game } from '../../src/game.ts';
import { aiTurn } from '../../src/ai.ts';
import { seeded } from '../../src/rng.ts';
import type { BattleResult } from '../../src/battle.ts';
import type { Figure, FigureDef, Move, NodeId, PlayerId } from '../../src/types.ts';
import { $, MOVE_COLOR, TYPE_COLOR, type Layout, type View } from './shared.ts';

const HUMAN: PlayerId = 0;

export class Match {
  game!: Game;
  selected: string | null = null;
  busy = false;
  seedBase = Date.now();

  constructor(private views: View[], private board: Layout, private pool: FigureDef[]) {}

  start() {
    const rng = seeded(this.seedBase++);
    const deck = () => Array.from({ length: 6 }, () => this.pool[Math.floor(rng() * this.pool.length)]);
    const first: PlayerId = rng() < 0.5 ? 0 : 1;
    this.game = new Game(this.board, [deck(), deck()], seeded(this.seedBase++), undefined, first);
    this.game.onBattle = (m, o, r) => this.showBattle(m, o, r);
    this.selected = null;
    $('log').innerHTML = '';
    $('banner').classList.remove('show');
    for (const v of this.views) { v.clearFigures(); for (const f of this.game.figures) v.addFigure(f); }
    this.log(`Empieza ${first === HUMAN ? 'el jugador (azul)' : 'la IA (rojo)'}. Quien empieza tiene MP-1 en su primer turno.`);
    (window as unknown as { __duel: unknown }).__duel = { game: this.game, match: this, views: this.views };
    $('end').onclick = () => { if (this.canAct()) { this.game.endTurn(); this.afterHuman(); } };
    $('again').onclick = () => this.start();
    for (const v of this.views) v.canvas.onclick = (ev) => this.click(v.pick(ev));
    this.refresh();
    if (this.game.current !== HUMAN) this.runAi();
  }

  canAct() { return !this.busy && this.game.winner === null && this.game.current === HUMAN; }

  click(hit: { uid?: string; node?: NodeId }) {
    if (!this.canAct()) return;
    const g = this.game;
    if (hit.uid) {
      const f = g.figures.find((x) => x.uid === hit.uid)!;
      if (f.owner === HUMAN) { this.select(f.uid); return; }
      const mine = this.selected && g.figures.find((x) => x.uid === this.selected);
      if (mine && g.adjacentEnemies(mine).some((e) => e.uid === f.uid)) {
        try { g.battle(mine.uid, f.uid); } catch (e) { this.log(String(e)); }
        this.selected = null;
        this.afterHuman();
      }
      return;
    }
    if (hit.node && this.selected) {
      const f = g.figures.find((x) => x.uid === this.selected)!;
      if (g.reachable(f).has(hit.node)) {
        g.move(f.uid, hit.node);
        if (g.winner !== null) { this.afterHuman(); return; }
      }
      this.refresh();
    }
  }

  select(uid: string) {
    this.selected = this.selected === uid ? null : uid;
    this.refresh();
  }

  afterHuman() {
    this.selected = null;
    this.refresh();
    if (this.game.winner === null && this.game.current !== HUMAN) this.runAi();
  }

  runAi() {
    this.busy = true;
    const step = () => {
      if (this.game.winner !== null || this.game.current === HUMAN) { this.busy = false; this.refresh(); return; }
      aiTurn(this.game, seeded(this.seedBase++));
      this.refresh();
      setTimeout(step, 700);
    };
    setTimeout(step, 600);
  }

  refresh() {
    const g = this.game;
    for (const f of g.figures) for (const v of this.views) v.place(f.uid, f.status === 'board' ? f.at : null);
    const sel = this.selected ? g.figures.find((f) => f.uid === this.selected)! : null;
    const reach = sel ? [...g.reachable(sel)] : [];
    for (const v of this.views) v.setHighlights(reach, sel && sel.status === 'board' ? sel.at : null);

    const side = (p: PlayerId) => {
      const pc = g.pc[p].map((f) => f.def.name).join(', ') || '—';
      const waits = g.figures.filter((f) => f.owner === p && f.wait > 0).map((f) => `${f.def.name} Wait ${f.wait}`).join(', ');
      return `<b style="color:${p === 0 ? '#6fa0ff' : '#ff7a80'}">${p === HUMAN ? 'Tú (azul)' : 'IA (rojo)'}</b><br>P.C.: ${pc}${waits ? `<br>${waits}` : ''}`;
    };
    $('side').innerHTML = `${side(1)}<hr style="border:0;border-top:1px solid #fff2">${side(0)}`;
    const sidem = document.getElementById('sidem'); // only in publish/template.html
    if (sidem) sidem.innerHTML = `<span>${side(1)}</span><span>${side(0)}</span>`;
    $('status').textContent = g.winner !== null ? 'Duelo terminado' : `Turno ${g.turn}/${300} · juega ${g.current === HUMAN ? 'el jugador' : 'la IA'}`;

    const bench = g.figures.filter((f) => f.owner === HUMAN);
    $('bench').innerHTML = '';
    for (const f of bench) {
      const el = document.createElement('button');
      el.type = 'button';
      const where = f.status === 'bench' ? 'banquillo' : f.status === 'pc' ? 'P.C.' : f.at!;
      el.className = 'chip' + (f.uid === this.selected ? ' sel' : '') + (f.status === 'pc' ? ' off' : '');
      el.style.borderColor = '#' + (TYPE_COLOR[f.def.type ?? ''] ?? 0x888888).toString(16).padStart(6, '0');
      el.textContent = `${f.def.name} · MP ${g.mp(f)}${f.wait ? ` · Wait ${f.wait}` : ''} · ${where}`;
      el.onclick = () => { if (this.canAct() && f.status !== 'pc') this.select(f.uid); };
      $('bench').appendChild(el);
    }
    $<HTMLButtonElement>('end').disabled = !this.canAct();
    $('hint').textContent = !this.canAct() ? '' : sel
      ? (sel.status === 'board' && g.adjacentEnemies(sel).length ? 'Verde = mover. Pulsa un enemigo adyacente para combatir (termina el turno).' : 'Verde = destinos posibles.')
      : 'Elige una figura (en el tablero o en el banquillo).';

    if (g.winner !== null) {
      $('bannerText').textContent = g.winner === 'none' ? 'Límite de turnos: pierden ambos' : g.winner === HUMAN ? '¡Victoria!' : 'Derrota';
      $('banner').classList.add('show');
    }
  }

  log(t: string) { const d = document.createElement('div'); d.textContent = t; $('log').prepend(d); }

  showBattle(m: Figure, o: Figure, r: BattleResult) {
    const mine = m.owner === HUMAN;
    this.log(`${m.def.name} (${r.moverMove.color}${r.moverMove.damage ? ' ' + r.moverMove.damage : ''}) vs ${o.def.name} (${r.otherMove.color}${r.otherMove.damage ? ' ' + r.otherMove.damage : ''}) → ${r.ko.length ? r.ko.map((k) => k.def.name + ' al P.C.').join(', ') : 'nada'}${mine ? '' : ' [IA ataca]'}`);
    drawWheel($<HTMLCanvasElement>('w0'), m.def, r.moverMove);
    drawWheel($<HTMLCanvasElement>('w1'), o.def, r.otherMove);
    $('c0').textContent = `${m.def.name}: ${r.moverMove.name}`;
    $('c1').textContent = `${o.def.name}: ${r.otherMove.name}`;
    $('wheels').classList.add('show');
    setTimeout(() => $('wheels').classList.remove('show'), 2200);
  }
}


/** Pie chart of a figure's Data Disk; the spun segment is outlined. */
function drawWheel(cv: HTMLCanvasElement, def: FigureDef, hit: Move) {
  const c = cv.getContext('2d')!, R = cv.width / 2 - 8;
  c.clearRect(0, 0, cv.width, cv.height);
  const total = def.wheel.reduce((s, x) => s + x.weight, 0);
  let a = -Math.PI / 2;
  def.wheel.forEach((seg) => {
    const span = (seg.weight / total) * Math.PI * 2;
    c.beginPath(); c.moveTo(R + 8, R + 8); c.arc(R + 8, R + 8, R, a, a + span); c.closePath();
    c.fillStyle = MOVE_COLOR[seg.move.color]; c.fill();
    c.lineWidth = seg.move === hit ? 6 : 1; c.strokeStyle = seg.move === hit ? '#4cd964' : '#0006'; c.stroke();
    if (span > 0.35) {
      const mid = a + span / 2;
      c.fillStyle = seg.move.color === 'white' || seg.move.color === 'gold' ? '#222' : '#fff';
      c.font = '15px system-ui'; c.textAlign = 'center';
      c.fillText(seg.move.damage ? String(seg.move.damage) : seg.move.color === 'purple' ? '★'.repeat(seg.move.stars || 1) : '', R + 8 + Math.cos(mid) * R * 0.65, R + 13 + Math.sin(mid) * R * 0.65);
    }
    a += span;
  });
}

