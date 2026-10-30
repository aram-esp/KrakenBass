import { Game } from '../../src/game.ts';
import { aiTurn } from '../../src/ai.ts';
import { seeded } from '../../src/rng.ts';
import type { BattleResult } from '../../src/battle.ts';
import type { Figure, FigureDef, Move, NodeId, PlayerId } from '../../src/types.ts';
import { houseRules } from '../../src/rules.config.ts';
import { plateSpec, plateTargets, type PlateDef } from '../../src/plates.ts';
import { $, COND_SHORT, MOVE_COLOR, TYPE_COLOR, type Layout, type View } from './shared.ts';

const HUMAN: PlayerId = 0;

export class Match {
  game!: Game;
  selected: string | null = null;
  busy = false;
  seedBase = Date.now();
  private disksTimer = 0;
  /** Choosing the target(s) of a plate: its index and the figures picked so far. */
  private plateAim: { index: number; picked: string[] } | null = null;
  private skipDisks: (() => void) | null = null;

  constructor(private views: View[], private board: Layout, private pool: FigureDef[]) {}

  /** The player's chosen deck for the next duels; null = random. */
  humanDeck: FigureDef[] | null = null;
  /** The figure a figure evolves into during a duel (Metamorphosis); set by main. */
  evolveInDuel?: (def: FigureDef) => FigureDef | null;
  /** Called by the "Menú" buttons. */
  onMenu: () => void = () => {};
  /** Called once when a duel ends (won = the player won); may return a line for the end banner. */
  onGameEnd: (won: boolean, deckIds: string[]) => string | void = () => {};
  /** Called when one of the player's figures has fought a battle. */
  onBattleFought: (id: string) => void = () => {};
  private reported = false;

  /** Plates the AI can get (the ones that work), and the player's plate deck. */
  platePool: PlateDef[] = [];
  humanPlates: PlateDef[] = [];

  start(humanDeck: FigureDef[] | null = this.humanDeck, plates: PlateDef[] = this.humanPlates) {
    this.humanDeck = humanDeck;
    this.humanPlates = plates;
    const rng = seeded(this.seedBase++);
    const deck = () => Array.from({ length: 6 }, () => this.pool[Math.floor(rng() * this.pool.length)]);
    const first: PlayerId = rng() < 0.5 ? 0 : 1;
    // The AI takes random working plates up to a total cost of 6.
    const aiPlates: PlateDef[] = [];
    for (let tries = 0; tries < 40 && aiPlates.length < 6 && this.platePool.length; tries++) {
      const p = this.platePool[Math.floor(rng() * this.platePool.length)];
      if (aiPlates.reduce((c, x) => c + x.cost, 0) + p.cost <= 6) aiPlates.push(p);
    }
    this.game = new Game(this.board, [humanDeck ?? deck(), deck()], seeded(this.seedBase++), houseRules, first, [plates, aiPlates]);
    this.game.onBattle = (m, o, r, info) => {
      if (!info.tie) for (const f of [m, o]) if (f.owner === HUMAN) this.onBattleFought(f.def.id);
      this.showBattle(m, o, r, info);
    };
    // Draw the board as it is right before the battle (e.g. the AI's move); then it waits for the disks.
    this.game.onBeforeBattle = () => this.refresh();
    this.game.onNote = (t) => this.log(t);
    this.game.evolveInDuel = this.evolveInDuel;
    this.selected = null;
    this.plateAim = null;
    this.reported = false;
    $('log').innerHTML = '';
    $('banner').classList.remove('show');
    this.diskQueue = [];
    this.playing = false;
    clearTimeout(this.disksTimer);
    $('wheels').classList.remove('show');
    for (const v of this.views) { v.clearFigures(); for (const f of this.game.figures) v.addFigure(f); }
    this.log(`Empieza ${first === HUMAN ? 'el jugador (azul)' : 'la IA (rojo)'}. Quien empieza tiene MP-1 en su primer turno.`);
    (window as unknown as { __duel: unknown }).__duel = { game: this.game, match: this, views: this.views };
    $('end').onclick = () => { if (this.canAct()) { this.game.endTurn(); this.afterHuman(); } };
    // The original's AI button: the AI plays this turn for you.
    $('aiBtn').onclick = () => { if (this.canAct()) { this.selected = null; aiTurn(this.game, seeded(this.seedBase++)); this.afterHuman(); } };
    // Forfeit: a second press within 3 s confirms.
    const ff = $<HTMLButtonElement>('forfeit');
    ff.classList.remove('armed'); ff.textContent = 'Rendirse';
    ff.onclick = () => {
      if (this.game.winner !== null) return;
      if (!ff.classList.contains('armed')) {
        ff.classList.add('armed'); ff.textContent = '¿Rendirse? Pulsa otra vez';
        setTimeout(() => { ff.classList.remove('armed'); ff.textContent = 'Rendirse'; }, 3000);
        return;
      }
      ff.classList.remove('armed'); ff.textContent = 'Rendirse';
      this.game.forfeit(HUMAN);
      this.log('Te has rendido.');
      this.refresh();
    };
    // The Data Disk button shows the selected figure's wheel.
    $('disk').onclick = () => {
      const f = this.selected ? this.game.figures.find((x) => x.uid === this.selected) : undefined;
      if (!f || this.playing) return;
      this.diskQueue.push({ m: f, o: f, r: { moverMove: f.def.wheel[0].move, otherMove: f.def.wheel[0].move, moverPower: 0, otherPower: 0, winner: null, ko: [], notes: [] }, info: { tie: false, peek: true }, logText: '' });
      this.playNextDisks();
    };
    $('again').onclick = () => this.start();
    $('toMenu').onclick = () => this.onMenu();
    $('menuBtn').onclick = () => this.onMenu();
    for (const v of this.views) v.canvas.onclick = (ev) => this.click(v.pick(ev));
    this.refresh();
    if (this.game.current !== HUMAN) this.runAi();
  }

  canAct() { return !this.busy && !this.disksShowing() && this.game.winner === null && this.game.current === HUMAN; }

  /** While Data Disks are on screen nobody acts. */
  disksShowing() { return this.playing; }

  click(hit: { uid?: string; node?: NodeId }) {
    if (!this.canAct()) return;
    const g = this.game;
    if (this.plateAim) {
      const uid = hit.uid ?? (hit.node ? g.figureAt(hit.node)?.uid : undefined);
      if (uid) this.pickPlateTarget(uid);
      return;
    }
    // Ability moves (purple): a click on its node, or on the figure standing there (Run Off, waking an ally).
    const sel = this.selected ? g.figures.find((x) => x.uid === this.selected) : undefined;
    if (sel) {
      const at = hit.node ?? (hit.uid ? g.figures.find((x) => x.uid === hit.uid)?.at ?? undefined : undefined);
      const sp = at ? g.specials(sel).find((s) => s.to === at) : undefined;
      if (sp && !(hit.node && g.reachable(sel).has(hit.node))) {
        const before = g.current;
        try { g.doSpecial(sp); } catch (e) { this.log(String(e)); }
        if (g.current !== before || g.winner !== null) { this.afterHuman(); return; }
        this.selected = sp.kind === 'runoff' ? sel.uid : null;
        this.refresh();
        return;
      }
    }
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
        if (g.winner !== null || g.current !== HUMAN) { this.afterHuman(); return; } // Diving Entry ends the turn
        // As in the original, the turn ends by itself after a move unless that figure can battle or tag.
        if (!(g.canAttack(f) && g.adjacentEnemies(f).length) && !g.specials(f).some((x) => x.kind === 'tag')) {
          g.endTurn();
          this.afterHuman();
          return;
        }
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
      if (this.disksShowing()) { setTimeout(step, 150); return; }
      if (this.game.winner !== null || this.game.current === HUMAN) { this.busy = false; this.refresh(); return; }
      aiTurn(this.game, seeded(this.seedBase++));
      this.refresh();
      setTimeout(step, 700);
    };
    setTimeout(step, 600);
  }

  refresh() {
    const g = this.game;
    // While the Data Disks spin the board keeps showing the position from before the battle; the result
    // (knock-outs, P.C., win banner, log) appears when the last disk closes (playNextDisks calls refresh).
    if (this.playing) {
      $<HTMLButtonElement>('end').disabled = true;
      $('hint').textContent = '';
      return;
    }
    // Board figures on their node; bench and P.C. figures on their off-board spot (drawn by the 2.5D view).
    for (const p of [0, 1] as PlayerId[]) {
      const bench = g.figures.filter((f) => f.owner === p && f.status === 'bench');
      for (const f of g.figures.filter((x) => x.owner === p)) {
        const off = f.status === 'bench' ? { area: 'bench' as const, owner: p, index: bench.indexOf(f) }
          : f.status === 'pc' ? { area: 'pc' as const, owner: p, index: g.pc[p].indexOf(f) } : undefined;
        for (const v of this.views) v.place(f.uid, f.status === 'board' ? f.at : null, off);
      }
    }
    const sel = this.selected ? g.figures.find((f) => f.uid === this.selected)! : null;
    const reach = sel ? [...g.reachable(sel)] : [];
    const specials = sel && this.canAct() ? g.specials(sel) : [];
    for (const v of this.views) v.setHighlights(reach, sel && sel.status === 'board' ? sel.at : null, specials.map((s) => s.to));
    const badges = new Map(g.figures.filter((f) => f.status !== 'pc').map((f) => [f.uid, { mp: g.mp(f), wait: f.wait, cond: f.cond }]));
    for (const v of this.views) v.setBadges(badges);
    // Figures that can act now get the original's yellow mark.
    const actable = !this.canAct() ? [] : this.plateAim ? this.plateTargetsNow().map((f) => f.uid)
      : g.figures.filter((f) => f.owner === HUMAN && (g.reachable(f).size > 0 || (g.canAttack(f) && g.adjacentEnemies(f).length > 0) || g.specials(f).length > 0)).map((f) => f.uid);
    this.renderPlates();
    for (const v of this.views) { v.setActable?.(actable); v.setSelected?.(this.selected); }
    drawWheel($<HTMLCanvasElement>('diskCanvas'), sel?.def ?? EMPTY_DISK, null, 0, true);

    const info = (p: PlayerId) => {
      const conds = g.figures.filter((f) => f.owner === p && f.cond).map((f) => `${f.def.name}: ${COND_SHORT[f.cond!]}`);
      return [`P.C. ${g.pc[p].length}/2`, ...conds].join(' · ');
    };
    $('youInfo').textContent = info(HUMAN);
    $('aiInfo').textContent = info(1);
    $('turnNum').textContent = String(Math.min(g.turn, 300));
    $('plYou').classList.toggle('dim', g.current !== HUMAN);
    $('plAi').classList.toggle('dim', g.current === HUMAN);
    $<HTMLButtonElement>('aiBtn').disabled = !this.canAct();
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
    // The chips are only needed in the 2D view, which does not draw the benches.
    $('bench').classList.toggle('show', $<HTMLCanvasElement>('view').hidden);
    $<HTMLButtonElement>('end').disabled = !this.canAct();
    if (this.plateAim) {
      const p = g.plates[HUMAN][this.plateAim.index].def;
      $('hint').textContent = `${p.name}: elige ${this.plateAim.picked.length ? 'la segunda figura' : 'una figura'} (anillo amarillo). Pulsa PLATES para cancelar.`;
    }
    const specialHint = this.plateAim ? '' : specials.length ? ` Morado = ${[...new Set(specials.map((s) => s.label.split(':')[0]))].join(', ')}.` : '';
    if (!this.plateAim) $('hint').textContent = !this.canAct() ? '' : sel
      ? (g.canAttack(sel) && g.adjacentEnemies(sel).length ? 'Verde = mover. Pulsa un enemigo adyacente para combatir (termina el turno).' : 'Verde = destinos posibles.') + specialHint
      : 'Elige una figura (en el tablero o en el banquillo).';

    if (g.winner !== null) {
      if (!this.reported) {
        this.reported = true;
        const line = this.onGameEnd(g.winner === HUMAN, g.figures.filter((f) => f.owner === HUMAN).map((f) => f.def.id));
        $('bannerText').textContent = g.winner === 'none' ? 'Límite de turnos: pierden ambos' : g.winner === HUMAN ? '¡Victoria!' : 'Derrota';
        if (line) {
          const sub = document.createElement('div');
          sub.style.cssText = 'font-size:16px;margin-top:8px;color:#ffd21f';
          sub.textContent = line;
          $('bannerText').appendChild(sub);
        }
      }
      $('banner').classList.add('show');
    }
  }

  /** Figures the plate being aimed can be used on now (for Pokémon Switch, the second pick excludes the first). */
  private plateTargetsNow(): Figure[] {
    if (!this.plateAim) return [];
    const plate = this.game.plates[HUMAN][this.plateAim.index].def;
    const first = this.plateAim.picked[0];
    const all = plateTargets(this.game, HUMAN, plate).filter((f) => f.uid !== first);
    if (first && this.game.figures.find((f) => f.uid === first)?.status === 'bench') return all.filter((f) => f.status === 'board');
    return all;
  }

  private pickPlateTarget(uid: string) {
    if (!this.plateAim || !this.plateTargetsNow().some((f) => f.uid === uid)) return;
    this.plateAim.picked.push(uid);
    const plate = this.game.plates[HUMAN][this.plateAim.index].def;
    if (plateSpec(plate).target === 'two-own' && this.plateAim.picked.length < 2) { this.refresh(); return; }
    this.usePlateNow(this.plateAim.index, this.plateAim.picked);
  }

  private usePlateNow(index: number, targets: string[]) {
    this.plateAim = null;
    $('platePanel').classList.remove('show');
    try { this.game.usePlate(HUMAN, index, targets); } catch (e) { this.log(String(e)); }
    this.selected = null;
    if (this.game.current !== HUMAN || this.game.winner !== null) this.afterHuman(); else this.refresh();
  }

  /** The PLATES card stack and its list (original: the plate cards at the bottom right). */
  private renderPlates() {
    const g = this.game, mine = g.plates[HUMAN];
    $('platesLeft').textContent = String(mine.filter((x) => !x.used).length);
    $<HTMLButtonElement>('platesBtn').disabled = !mine.length;
    $('platesBtn').onclick = () => {
      if (this.plateAim) { this.plateAim = null; this.refresh(); return; }
      $('platePanel').classList.toggle('show');
      this.refresh();
    };
    const panel = $('platePanel');
    if (!panel.classList.contains('show')) return;
    panel.innerHTML = '<h3>Tus plates</h3>';
    mine.forEach((slot, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pl-item' + (slot.used ? ' used' : '');
      b.innerHTML = '<span></span><span class="cost"></span><small></small>';
      b.children[0].textContent = slot.def.name;
      b.children[1].textContent = `coste ${slot.def.cost}`;
      b.children[2].textContent = slot.used ? 'Ya usada en este duelo.' : slot.def.text;
      b.disabled = !this.canAct() || !g.canUsePlate(HUMAN, i);
      b.onclick = () => {
        if (plateSpec(slot.def).target === 'none') { this.usePlateNow(i, []); return; }
        this.plateAim = { index: i, picked: [] };
        panel.classList.remove('show');
        this.refresh();
      };
      panel.appendChild(b);
    });
    if (this.canAct() && !mine.some((_, i) => g.canUsePlate(HUMAN, i))) {
      const n = document.createElement('small');
      n.style.color = '#a8b6d6';
      n.textContent = 'Las plates se usan al principio de tu turno, antes de mover, y solo una por turno.';
      panel.appendChild(n);
    }
  }

  log(t: string) {
    const d = document.createElement('div');
    d.textContent = t;
    $('log').prepend(d);
    $('ticker').textContent = t;
  }

  showBattle(m: Figure, o: Figure, r: BattleResult, info: BattleInfo = { tie: false }) {
    const mine = m.owner === HUMAN;
    const side = (f: Figure, mv: Move, p: number) => `${f.def.name} (${mv.color}${p ? ' ' + p : ''})`;
    const logText = `${side(m, r.moverMove, r.moverPower)} vs ${side(o, r.otherMove, r.otherPower)} → `
      + (info.tie ? 'empate, se vuelve a girar' : r.ko.length ? r.ko.map((k) => k.def.name + ' al P.C.').join(', ') : 'nada')
      + (r.notes.length ? ` (${r.notes.join('; ')})` : '') + (mine ? '' : ' [IA ataca]');
    this.diskQueue.push({ m, o, r, info, logText });
    if (!this.playing) this.playNextDisks();
  }

  /** Spins are shown one after another (a tie, then the spin again). */
  private diskQueue: { m: Figure; o: Figure; r: BattleResult; info: BattleInfo; logText: string }[] = [];
  private playing = false;

  private playNextDisks() {
    const next = this.diskQueue.shift();
    if (!next) {
      $('wheels').classList.remove('show');
      this.playing = false;
      this.skipDisks = null;
      this.refresh();
      return;
    }
    this.playing = true;
    const { m, o, r, info, logText } = next;
    const second = $('w1').parentElement!;
    second.hidden = !!info.peek;
    if (info.peek) {
      // Data Disk of the selected figure: the whole wheel, no spin; a click closes it.
      let title = document.getElementById('wheelsTitle');
      if (!title) { title = document.createElement('div'); title.id = 'wheelsTitle'; $('wheels').prepend(title); }
      title.textContent = `Ruleta de ${m.def.name}`;
      drawWheel($<HTMLCanvasElement>('w0'), m.def, null);
      $('c0').textContent = m.def.wheel.map((x) => moveText(x.move)).join(' · ');
      $('wheels').classList.add('show');
      this.skipDisks = () => { second.hidden = false; this.playNextDisks(); };
      $('wheels').onclick = () => this.skipDisks?.();
      return;
    }
    const caps: [string, string] = [`${m.def.name}: ${moveText(r.moverMove, r.moverPower)}`, `${o.def.name}: ${moveText(r.otherMove, r.otherPower)}`];
    const fates: [Fate, Fate] = info.tie
      ? [{ kind: 'none', text: 'Empate' }, { kind: 'none', text: 'Empate' }]
      : [fate(m, r.otherMove, r.otherPower, r), fate(o, r.moverMove, r.moverPower, r)];
    const reveal = (i: 0 | 1) => {
      const cap = $(`c${i}`);
      cap.textContent = caps[i];
      const line = document.createElement('div');
      line.className = `fate ${fates[i].kind}`;
      line.textContent = fates[i].text;
      cap.appendChild(line);
    };
    let title = document.getElementById('wheelsTitle');
    if (!title) {
      title = document.createElement('div');
      title.id = 'wheelsTitle';
      $('wheels').prepend(title);
    }
    title.textContent = info.tie ? 'Empate: se vuelve a girar' : `${m.def.name} ataca a ${o.def.name}`;
    if (r.notes.length) {
      const n = document.createElement('div');
      n.style.cssText = 'font-size:14px;font-weight:600;color:#ffd21f;margin-top:4px';
      n.textContent = r.notes.join(' · ');
      title.appendChild(n);
    }
    $('c0').textContent = `${m.def.name}: …`;
    $('c1').textContent = `${o.def.name}: …`;
    $('wheels').classList.add('show');
    clearTimeout(this.disksTimer);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spinMs = reduce ? 0 : SPIN_MS, holdMs = HOLD_MS;
    const finish = () => { this.log(logText); this.playNextDisks(); };
    const stops = [
      spinWheel($<HTMLCanvasElement>('w0'), m.def, r.moverMove, spinMs, 0, () => reveal(0)),
      spinWheel($<HTMLCanvasElement>('w1'), o.def, r.otherMove, spinMs, SPIN_STAGGER, () => reveal(1)),
    ];
    this.disksTimer = setTimeout(finish, spinMs + SPIN_STAGGER + holdMs);
    // A click on the disks jumps to the result, a second one goes on (next battle or back to the board).
    this.skipDisks = () => {
      // map, not some: stop both disks, not just the first one still spinning.
      if (stops.map((s) => s()).some(Boolean)) { clearTimeout(this.disksTimer); this.disksTimer = setTimeout(finish, holdMs); return; }
      clearTimeout(this.disksTimer);
      finish();
    };
    $('wheels').onclick = () => this.skipDisks?.();
    this.refresh();
  }
}


type BattleInfo = { tie: boolean; peek?: boolean };

/** Grey disk shown on the Data Disk button when no figure is selected. */
const EMPTY_DISK: FigureDef = { id: '', name: '', mp: 0, wheel: [{ move: { name: '', color: 'white', damage: 0 }, weight: 1 }] };

type Fate = { kind: 'hit' | 'stop' | 'none'; text: string };

/** "Bite (20)", "Bite (20 → 40)" when an ability changed it, "Dodge", "Swagger ★★". */
function moveText(mv: Move, power = mv.damage): string {
  if (mv.damage) return power !== mv.damage ? `${mv.name} (${mv.damage} → ${power})` : `${mv.name} (${mv.damage})`;
  if (mv.color === 'purple') return `${mv.name} ${'★'.repeat(mv.stars || 1)}`;
  return mv.name;
}

/**
 * How the battle ended for `f`: knocked out (with the damage received, if the winning move had damage), or the
 * winner (with the damage it stopped, if the opposing move had damage).
 */
function fate(f: Figure, opp: Move, oppPower: number, r: BattleResult): Fate {
  const damaging = (opp.color === 'white' || opp.color === 'gold') && oppPower > 0;
  if (r.ko.includes(f)) return { kind: 'hit', text: damaging ? `Recibe ${oppPower} de daño → al P.C.` : 'Pierde → al P.C.' };
  if (r.ko.length) return { kind: 'stop', text: damaging ? `Gana · para ${oppPower} de daño` : 'Gana' };
  return { kind: 'none', text: damaging ? `Para ${oppPower} de daño` : 'Sin daño' };
}

/** Disk timing: spin time, delay of the second disk, and how long the result stays on screen. */
const SPIN_MS = 3000;
const SPIN_STAGGER = 350;
const HOLD_MS = 2300;

/**
 * Spin a Data Disk and stop it with the spun segment under the pointer at the top.
 * Returns a function that jumps to the end; it returns true if the disk was still spinning.
 */
function spinWheel(cv: HTMLCanvasElement, def: FigureDef, hit: Move, ms: number, delay: number, onStop: () => void): () => boolean {
  const total = def.wheel.reduce((s, x) => s + x.weight, 0);
  let start = 0, idx = def.wheel.findIndex((x) => x.move === hit);
  if (idx < 0) idx = 0;
  for (let i = 0; i < idx; i++) start += def.wheel[i].weight;
  // Where in the segment the pointer lands (not always the centre), as an angle from the top.
  const landAt = ((start + def.wheel[idx].weight * (0.2 + Math.random() * 0.6)) / total) * Math.PI * 2;
  const end = Math.PI * 2 * 6 - landAt;
  const t0 = performance.now() + delay;
  let done = false, raf = 0;
  const frame = (now: number) => {
    const t = ms <= 0 ? 1 : Math.min(1, Math.max(0, (now - t0) / ms));
    const eased = 1 - Math.pow(1 - t, 4);
    drawWheel(cv, def, t >= 1 ? hit : null, end * eased);
    if (t < 1) { raf = requestAnimationFrame(frame); return; }
    done = true;
    onStop();
  };
  frame(performance.now());
  return () => {
    if (done) return false;
    cancelAnimationFrame(raf);
    frame(Number.POSITIVE_INFINITY);
    return true;
  };
}

/**
 * Pie chart of a figure's Data Disk turned by `rot` radians, with a fixed pointer at the top; `hit` is outlined.
 * `mini`: a small icon (deck picker) with no labels and no pointer.
 */
export function drawWheel(cv: HTMLCanvasElement, def: FigureDef, hit: Move | null, rot = 0, mini = false) {
  const c = cv.getContext('2d')!, R = cv.width / 2 - (mini ? 2 : 22), C = cv.width / 2;
  c.clearRect(0, 0, cv.width, cv.height);
  const total = def.wheel.reduce((s, x) => s + x.weight, 0);
  let a = -Math.PI / 2 + rot;
  def.wheel.forEach((seg) => {
    const span = (seg.weight / total) * Math.PI * 2;
    c.beginPath(); c.moveTo(C, C); c.arc(C, C, R, a, a + span); c.closePath();
    c.fillStyle = MOVE_COLOR[seg.move.color]; c.fill();
    c.lineWidth = seg.move === hit ? 6 : 1; c.strokeStyle = seg.move === hit ? '#4cd964' : '#0006'; c.stroke();
    if (!mini && span > 0.35) {
      const mid = a + span / 2;
      c.fillStyle = seg.move.color === 'white' || seg.move.color === 'gold' ? '#222' : '#fff';
      c.font = 'bold 24px system-ui'; c.textAlign = 'center';
      c.fillText(seg.move.damage ? String(seg.move.damage) : seg.move.color === 'purple' ? '★'.repeat(seg.move.stars || 1) : '', C + Math.cos(mid) * R * 0.65, C + 5 + Math.sin(mid) * R * 0.65);
    }
    a += span;
  });
  if (mini) return;
  // Pointer at the top: the segment under it is the result.
  c.beginPath(); c.moveTo(C - 16, 2); c.lineTo(C + 16, 2); c.lineTo(C, 34); c.closePath();
  c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#12151c'; c.stroke();
}

