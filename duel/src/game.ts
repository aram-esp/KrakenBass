import { Board } from './board.ts';
import { abilityHooks, afterBattle, blockedFromEntering, canBattle, canHaveCondition, hasAbility, mpBonus } from './abilities.ts';
import type { BattleResult } from './battle.ts';
import { resolveBattle } from './effects.ts';
import { duelEffectKey, healConds, heldType, plateSpec, plateTargets, plateUsable, turnBuffKey, typePowerType, type PlateDef } from './plates.ts';
import type { BoardDef, Condition, Figure, FigureDef, NodeId, PlayerId } from './types.ts';
import type { Rng } from './rng.ts';
import { defaultRules, type RulesConfig } from './rules.config.ts';

export type Winner = PlayerId | 'none';

/** An ability move chosen by the player instead of (or before) an MP move. */
export interface Special {
  kind: 'runoff' | 'swarm' | 'forestleap' | 'cutoff' | 'tag';
  /** Who moves or is affected, and where it ends up. */
  uid: string;
  to: NodeId;
  /** The other figure involved (Run Off swap partner, Swarm's Ledyba, the ally woken by a tag). */
  other?: string;
  label: string;
}

/**
 * One duel. A turn is: optionally move one figure (a bench figure enters through a free entry point for 1 MP), then
 * optionally battle an adjacent enemy (which ends the turn), or call endTurn(). Battles follow the original rules
 * (src/effects.ts), with special conditions, attack effects and the abilities in src/abilities.ts.
 * Plates and Mega/Z-Moves are not modelled.
 */
export class Game {
  readonly board: Board;
  readonly figures: Figure[] = [];
  readonly pc: Record<PlayerId, Figure[]> = { 0: [], 1: [] };
  turn = 1;
  current: PlayerId;
  winner: Winner | null = null;
  /**
   * Called after every spin of a battle, e.g. so a UI can show the wheels. `tie`: nobody won this spin and, with
   * rules.decisive, both figures spin again (another call follows).
   */
  onBattle?: (mover: Figure, other: Figure, result: BattleResult, info: { tie: boolean }) => void;
  /** Called just before a battle changes anything, e.g. so a UI can draw the board as it stands. */
  onBeforeBattle?: () => void;
  /** Things that happened outside a battle's wheels (abilities, conditions), for the log. */
  onNote?: (text: string) => void;
  /** The figure a figure evolves into during the duel (Metamorphosis), if any. Set by the app. */
  evolveInDuel?: (def: FigureDef) => FigureDef | null;
  readonly rules: RulesConfig;
  /** Each player's plates (deck order); a used plate stays used for the rest of the duel (Recycle aside). */
  readonly plates: Record<PlayerId, { def: PlateDef; used: boolean }[]> = { 0: [], 1: [] };
  /** Plate effects: for this turn on a figure (uid -> keys), and lasting ones. */
  private buffs = new Map<string, Set<string>>();
  readonly typePowers: Record<PlayerId, Set<string>> = { 0: new Set(), 1: new Set() };
  /** Held items (+20 while on the field): uid -> type. Spheres and Poison Blade: uid -> key (while on the field). */
  readonly held = new Map<string, string>();
  readonly spheres = new Map<string, string>();
  readonly duelEffects: Record<PlayerId, Set<string>> = { 0: new Set(), 1: new Set() };
  /** X Speed: uid -> name of the White Attack that becomes Gold this turn. */
  readonly xspeed = new Map<string, string>();
  private plateThisTurn = false;
  private moved = false;
  private usedRunOff = new Set<string>();
  private firstPlayer: PlayerId;
  private rng: Rng;
  private layout: Record<string, [number, number]>;

  constructor(
    boardDef: BoardDef,
    decks: [FigureDef[], FigureDef[]],
    rng: Rng,
    rules: RulesConfig = defaultRules,
    first: PlayerId = 0,
    plateDecks: [PlateDef[], PlateDef[]] = [[], []],
  ) {
    this.board = new Board(boardDef);
    this.rng = rng;
    this.rules = rules;
    this.firstPlayer = first;
    this.current = first;
    this.layout = ((boardDef as unknown as { layout?: Record<string, [number, number]> }).layout) ?? {};
    for (const p of [0, 1] as PlayerId[]) this.plates[p] = plateDecks[p].map((def) => ({ def, used: false }));
    for (const p of [0, 1] as PlayerId[]) {
      decks[p].forEach((def, i) =>
        this.figures.push({ uid: `${p}:${i}`, def, owner: p, at: null, status: 'bench', wait: 0 }));
    }
  }

  figureAt(n: NodeId): Figure | undefined {
    return this.figures.find((f) => f.status === 'board' && f.at === n);
  }

  isFree(n: NodeId): boolean {
    const goals = Object.values(this.board.def.goals);
    return !this.figureAt(n) && !goals.includes(n);
  }

  /** Asleep or frozen: cannot move, attack or surround, and does not block others passing through. */
  dozing(f: Figure): boolean {
    return f.cond === 'sleep' || f.cond === 'frozen';
  }

  /** MP available to this figure right now. */
  mp(f: Figure): number {
    if (this.dozing(f)) return 0;
    const penalty = f.owner === this.firstPlayer && this.turn === 1 ? this.rules.firstTurnMpPenalty : 0;
    let plate = this.hasBuff(f, 'counterattack') ? 1 : 0;
    // Aqua Sphere: "your Water-type Pokémon that are next to Water-type Pokémon gain +1 MP (to a maximum of MP 3)".
    const water = (o: Figure) => o.def.type === 'Water' || o.def.type2 === 'Water';
    if (water(f) && f.status === 'board' && this.sphereActive(f.owner, 'aquasphere') && this.neighbourFigures(f).some(water)) plate += 1;
    // Dragon Sphere: "your Dragon-type Pokémon with MP 1 or lower get +1 MP".
    const dragon = f.def.type === 'Dragon' || f.def.type2 === 'Dragon';
    if (dragon && f.def.mp <= 1 && this.sphereActive(f.owner, 'dragonsphere')) plate += 1;
    let mp = f.def.mp + mpBonus(this, f) + (f.mpMarker ?? 0) + plate;
    // Air Balloon: "Until the end of that Pokémon's next battle, its MP is 2".
    if (this.spheres.get(f.uid) === 'airballoon') mp = 2;
    return Math.max(0, (plate && water(f) ? Math.min(3, mp) : mp) - penalty);
  }

  /** Destinations for this figure's MP move. Occupied nodes block (dozing figures do not); bench figures pay 1 MP to enter. */
  reachable(f: Figure): Set<NodeId> {
    const out = new Set<NodeId>();
    const mp = this.mp(f);
    if (f.wait > 0 || mp < 1 || this.moved || blockedFromEntering(this, f)) return out;
    // Invisibility Cape: "it can move through other Pokémon when making an MP move."
    // Air Balloon, and Dragon Sphere for Dragon-types with no special condition: they can MP move over other Pokémon.
    const over = this.hasBuff(f, 'cape') || this.spheres.get(f.uid) === 'airballoon'
      || ((f.def.type === 'Dragon' || f.def.type2 === 'Dragon') && !f.cond && this.sphereActive(f.owner, 'dragonsphere'));
    const blocks = (n: NodeId) => { const o = this.figureAt(n); return !!o && !this.dozing(o) && !over; };
    // Diving Entry: "When moving this Pokémon from the bench, it can only move to one space away from the entry point."
    if (f.status === 'bench' && hasAbility(f, 'Diving Entry')) {
      for (const s of this.board.def.spawns[f.owner]) {
        if (this.figureAt(s)) continue;
        for (const n of this.board.neighbors(s)) if (!this.figureAt(n) && n !== this.board.def.goals[f.owner]) out.add(n);
      }
      return out;
    }
    const dist = new Map<NodeId, number>();
    const queue: NodeId[] = [];
    if (f.status === 'bench') {
      for (const s of this.board.def.spawns[f.owner]) {
        if (!this.figureAt(s)) { dist.set(s, 1); queue.push(s); }
      }
    } else if (f.status === 'board') {
      dist.set(f.at!, 0);
      queue.push(f.at!);
    } else {
      return out;
    }
    while (queue.length) {
      const cur = queue.shift()!;
      const d = dist.get(cur)!;
      if (d >= mp) continue;
      for (const nb of this.board.neighbors(cur)) {
        if (dist.has(nb) || blocks(nb)) continue;
        dist.set(nb, d + 1);
        queue.push(nb);
      }
    }
    for (const n of dist.keys()) if (n !== f.at && !this.figureAt(n)) out.add(n);
    // Reckless Charge: "This Pokémon can move up to 2 steps in a straight line."
    if (f.status === 'board' && hasAbility(f, 'Reckless Charge')) for (const n of this.straightLine(f.at!, 2)) out.add(n);
    return out;
  }

  /** Free nodes up to `steps` away from `from` going on in the same direction (by the board layout). */
  private straightLine(from: NodeId, steps: number): NodeId[] {
    const out: NodeId[] = [];
    const p = (n: NodeId) => this.layout[n];
    for (const first of this.board.neighbors(from)) {
      if (this.figureAt(first) || !p(first) || !p(from)) continue;
      out.push(first);
      let prev = from, cur = first;
      for (let i = 1; i < steps; i++) {
        const dir = [p(cur)[0] - p(prev)[0], p(cur)[1] - p(prev)[1]];
        const next = this.board.neighbors(cur).find((n) => {
          if (n === prev || this.figureAt(n) || !p(n)) return false;
          const d2 = [p(n)[0] - p(cur)[0], p(n)[1] - p(cur)[1]];
          const cos = (dir[0] * d2[0] + dir[1] * d2[1]) / (Math.hypot(dir[0], dir[1]) * Math.hypot(d2[0], d2[1]));
          return cos > 0.94; // within ~20 degrees
        });
        if (!next) break;
        out.push(next);
        prev = cur; cur = next;
      }
    }
    return out.filter((n) => n !== this.board.def.goals[this.figureAt(from)?.owner ?? 0]);
  }

  adjacentEnemies(f: Figure): Figure[] {
    if (f.status !== 'board') return [];
    return this.board.neighbors(f.at!)
      .map((n) => this.figureAt(n))
      .filter((o): o is Figure => !!o && o.owner !== f.owner && canBattle(o));
  }

  /** Can this figure start a battle now (on the board, no Wait, not asleep/frozen, no Bide)? */
  canAttack(f: Figure): boolean {
    return f.status === 'board' && f.wait === 0 && !this.dozing(f) && canBattle(f);
  }

  move(uid: string, to: NodeId): void {
    const f = this.mine(uid);
    if (!this.reachable(f).has(to)) throw new Error('unreachable node');
    const fromBench = f.status === 'bench';
    this.place(f, to);
    if (fromBench) f.fresh = true;
    this.moved = true;
    if (to === this.board.def.goals[(1 - f.owner) as PlayerId]) {
      this.winner = f.owner;
      return;
    }
    this.settle();
    // Diving Entry: "... Your turn ends."
    if (fromBench && hasAbility(f, 'Diving Entry') && this.winner === null) { this.note(`${f.def.name} entra con Diving Entry: termina el turno`); this.endTurn(); }
  }

  /** Ability moves available to this figure now (purple targets in the UI). */
  specials(f: Figure): Special[] {
    const out: Special[] = [];
    if (f.owner !== this.current || this.winner !== null || f.wait > 0) return out;
    const goalOwn = this.board.def.goals[f.owner];
    if (f.status === 'board' && !this.dozing(f)) {
      // Tag: wake an adjacent sleeping (or frozen) ally; ends the turn (Bulbapedia, Asleep).
      for (const o of this.neighbourFigures(f)) {
        if (o.owner === f.owner && this.dozing(o)) out.push({ kind: 'tag', uid: f.uid, to: o.at!, other: o.uid, label: `Despertar a ${o.def.name}` });
      }
      // Run Off: "Before using this Pokémon, you can switch its position with another one of your own Pokémon in an adjacent space."
      if (hasAbility(f, 'Run Off') && !this.moved && !this.usedRunOff.has(f.uid)) {
        for (const o of this.neighbourFigures(f)) if (o.owner === f.owner) out.push({ kind: 'runoff', uid: f.uid, to: o.at!, other: o.uid, label: `Run Off: cambiar con ${o.def.name}` });
      }
      if (!this.moved) {
        // Cut Off: "When this Pokémon is on the field, it can move to your goal point instead of making an MP move (ends your turn)."
        if (hasAbility(f, 'Cut Off') && !this.figureAt(goalOwn)) out.push({ kind: 'cutoff', uid: f.uid, to: goalOwn, label: 'Cut Off: ir a tu portería' });
        // Forest Leap: move to a spot next to an adjacent Grass Pokémon, or next to any in a chain of adjacent Grass Pokémon.
        if (hasAbility(f, 'Forest Leap')) {
          const grass = (o: Figure) => o.def.type === 'Grass' || o.def.type2 === 'Grass';
          const seen = new Set<string>([f.uid]);
          const queue = this.neighbourFigures(f).filter(grass);
          queue.forEach((g) => seen.add(g.uid));
          const spots = new Set<NodeId>();
          while (queue.length) {
            const g = queue.shift()!;
            for (const n of this.board.neighbors(g.at!)) if (this.isFree(n) && n !== f.at) spots.add(n);
            for (const o of this.neighbourFigures(g)) if (grass(o) && !seen.has(o.uid)) { seen.add(o.uid); queue.push(o); }
          }
          for (const n of spots) out.push({ kind: 'forestleap', uid: f.uid, to: n, label: 'Forest Leap' });
        }
        // Swarm: "Instead of using this Pokémon, you can move a Ledyba next to it (ends your turn)"; Serebii adds Ledian and,
        // if no opposing Pokémon stands on your entry points, one from the bench.
        if (hasAbility(f, 'Swarm')) {
          const enemyOnEntry = this.board.def.spawns[f.owner].some((s) => { const o = this.figureAt(s); return !!o && o.owner !== f.owner; });
          const mate = this.figures.find((o) => o !== f && o.owner === f.owner && ['Ledyba', 'Ledian'].includes(o.def.name)
            && (o.status === 'board' || (o.status === 'bench' && !enemyOnEntry && o.wait === 0)));
          if (mate) for (const n of this.board.neighbors(f.at!)) if (this.isFree(n)) out.push({ kind: 'swarm', uid: mate.uid, to: n, other: f.uid, label: `Swarm: traer a ${mate.def.name}` });
        }
      }
    }
    return out;
  }

  doSpecial(s: Special): void {
    const f = this.figures.find((x) => x.uid === (s.kind === 'swarm' ? s.other : s.uid));
    if (!f) throw new Error('unknown figure');
    this.mine(f.uid);
    if (!this.specials(f).some((x) => x.kind === s.kind && x.to === s.to && x.uid === s.uid)) throw new Error('not available');
    const mover = this.figures.find((x) => x.uid === s.uid)!;
    this.note(s.label);
    if (s.kind === 'tag') { const o = this.figures.find((x) => x.uid === s.other)!; o.cond = null; this.endTurn(); return; }
    if (s.kind === 'runoff') { this.swapPlaces(f, this.figures.find((x) => x.uid === s.other)!); this.usedRunOff.add(f.uid); this.settle(); return; }
    this.place(mover, s.to);
    this.moved = true;
    this.settle();
    if (s.kind === 'cutoff' || s.kind === 'swarm') this.endTurn();
  }

  /** Battle an adjacent enemy. With rules.decisive a tie is spun again until someone wins (30 spins at most). */
  battle(uid: string, targetUid: string): BattleResult {
    const f = this.mine(uid);
    if (!this.canAttack(f)) throw new Error('figure cannot attack');
    const target = this.adjacentEnemies(f).find((e) => e.uid === targetUid);
    if (!target) throw new Error('target is not an adjacent enemy');
    this.onBeforeBattle?.();
    // Abilities that avoid the battle (the original lets the player choose; here they are always used when possible).
    if (hasAbility(target, 'Run Away') && target.wait === 0) {
      // "When this Pokémon is attacked, it can move to the bench. If it does, it gains Wait."
      this.toBench(target); this.gainWait(target);
      return this.avoided(f, target, `${target.def.name} usa Run Away y vuelve al banquillo`);
    }
    if (hasAbility(target, 'Sand Veil') && !this.dozing(target)) {
      // "If this Pokémon is attacked, it can move under the opponent's Pokémon to another space next to it. (A battle does not occur.)"
      const spot = this.freeNeighbours(f.at!).find((n) => n !== target.at);
      if (spot) { this.relocate(target, spot); return this.avoided(f, target, `${target.def.name} usa Sand Veil y se escabulle`); }
    }
    const hooks = abilityHooks(this);
    let result = resolveBattle(this, f, target, this.rng, hooks, this.rules.decisive);
    for (let spins = 1; this.rules.decisive && result.winner === null && spins < 30; spins++) {
      this.onBattle?.(f, target, result, { tie: true });
      result = resolveBattle(this, f, target, this.rng, hooks, this.rules.decisive);
    }
    for (const k of result.ko) {
      if (k.status === 'pc' || k.status === 'removed') continue;
      const by = k === f ? target : f;
      if (by.owner !== k.owner && (by === f ? result.winner === 'mover' : result.winner === 'other')) {
        this.typePowerKo(by);
        // Force Remove: "If that Pokémon's attack knocks a Pokémon out that turn, it will be eliminated from the duel."
        if (this.hasBuff(by, 'forceremove')) { this.removeFromDuel(k); result.notes.push(`Force Remove: ${k.def.name} queda fuera del duelo`); continue; }
      }
      this.sendToPc(k);
    }
    result.notes.push(...afterBattle(this, f, target, result));
    for (const x of [f, target]) {
      if (this.spheres.get(x.uid) === 'airballoon') this.spheres.delete(x.uid);
      x.fresh = false;
      if (x.cond === 'frozen' && x.status === 'board') x.cond = null; // cleared after a battle (Serebii)
    }
    // Asleep Pokémon wake up after being attacked by an opponent (Bulbapedia) unless this battle just put it to sleep.
    if (target.cond === 'sleep' && !result.notes.some((n) => n.includes(`${target.def.name} queda dormido`))) target.cond = null;
    this.onBattle?.(f, target, result, { tie: false });
    this.settle();
    if (this.winner === null) this.endTurn();
    return result;
  }

  private avoided(f: Figure, target: Figure, text: string): BattleResult {
    this.note(text);
    this.settle();
    if (this.winner === null) this.endTurn();
    const none = { name: '—', color: 'red' as const, damage: 0 };
    return { moverMove: none, otherMove: none, moverPower: 0, otherPower: 0, winner: null, ko: [], notes: [text] };
  }

  endTurn(): void {
    if (this.winner !== null) throw new Error('game is over');
    for (const f of this.figures) if (f.wait > 0) f.wait -= 1;
    this.current = (1 - this.current) as PlayerId;
    this.turn += 1;
    this.moved = false;
    this.usedRunOff.clear();
    this.buffs.clear();
    this.xspeed.clear();
    this.plateThisTurn = false;
    if (this.turn > this.rules.turnLimit) { this.winner = 'none'; return; }
    // Final Song marker (Belly Drum): knocked out 5 turns later.
    for (const f of this.figures) if (f.status === 'board' && f.finalSong !== undefined && this.turn >= f.finalSong) {
      this.note(`${f.def.name} cae por el marcador Final Song`);
      this.sendToPc(f);
    }
    // Shed Skin: "This Pokémon will recover from any status effect at the start of your turn, and the turn will end."
    // Spellbind (Hypno on the field): sleep is not removed by other abilities.
    const spellbind = this.figures.some((o) => o.status === 'board' && hasAbility(o, 'Spellbind'));
    const shed = this.figures.find((o) => o.owner === this.current && o.status === 'board' && o.cond && hasAbility(o, 'Shed Skin')
      && !(o.cond === 'sleep' && spellbind));
    if (shed) { shed.cond = null; this.note(`${shed.def.name} usa Shed Skin y se cura: termina el turno`); this.endTurn(); return; }
    if (this.legalActionCount(this.current) === 0) this.winner = (1 - this.current) as PlayerId;
  }

  hasBuff(f: Figure, key: string): boolean {
    return this.buffs.get(f.uid)?.has(key) ?? false;
  }

  /** A sphere-type plate of player p is in force: its chosen figure is on the field. */
  sphereActive(p: PlayerId, key: string): boolean {
    return [...this.spheres].some(([uid, k]) => k === key && this.figures.find((x) => x.uid === uid)?.status === 'board' && this.figures.find((x) => x.uid === uid)?.owner === p);
  }

  /** Grass Sphere: your Grass-type Pokémon are not moved to the bench or P.C. by opposing Attacks. */
  grassSphereHolds(f: Figure): boolean {
    return (f.def.type === 'Grass' || f.def.type2 === 'Grass') && this.sphereActive(f.owner, 'grasssphere');
  }

  /** Can the current player use a plate now (start of the turn, before moving, one per turn)? */
  canUsePlate(p: PlayerId, index: number): boolean {
    const slot = this.plates[p][index];
    return !!slot && !slot.used && this.current === p && this.winner === null && !this.moved && !this.plateThisTurn && plateUsable(this, p, slot.def);
  }

  /** Free spots one step from your entry points (Long Throw). */
  longThrowSpots(p: PlayerId): NodeId[] {
    const out = new Set<NodeId>();
    for (const s of this.board.def.spawns[p]) for (const n of this.board.neighbors(s)) if (this.isFree(n)) out.add(n);
    return [...out];
  }

  /** Hurdle Jump: over a connected Pokémon to a free spot beyond it (straight on if possible). */
  hurdleSpots(f: Figure): NodeId[] {
    if (!f.at) return [];
    const out: NodeId[] = [];
    const d = this.distances(f.at);
    for (const n of this.board.neighbors(f.at)) {
      if (!this.figureAt(n)) continue;
      for (const m of this.freeNeighbours(n)) if (m !== f.at && (d.get(m) ?? 0) === 2) out.push(m);
    }
    return [...new Set(out)];
  }

  /**
   * Use plate `index` of player p on `targets` (figure uids; two for Pokémon Switch). Choices of a spot (Long Throw,
   * Hurdle Jump) take the free spot nearest the opponent's goal. Returns a note for the log.
   */
  usePlate(p: PlayerId, index: number, targets: string[] = []): string {
    if (!this.canUsePlate(p, index)) throw new Error('plate not usable now');
    const slot = this.plates[p][index];
    const plate = slot.def, spec = plateSpec(plate);
    const fig = (uid?: string) => this.figures.find((x) => x.uid === uid);
    const t = fig(targets[0]);
    if (spec.target !== 'none' && (!t || !plateTargets(this, p, plate).includes(t))) throw new Error('bad target');
    const toGoal = this.distances(this.board.def.goals[(1 - p) as PlayerId]);
    const nearest = (ns: NodeId[]) => [...ns].sort((a, b) => (toGoal.get(a) ?? 99) - (toGoal.get(b) ?? 99))[0];
    let text = `${plate.name}`;
    const buff = turnBuffKey(plate.name), power = typePowerType(plate.name), held = heldType(plate.name), heal = healConds(plate.name), duel = duelEffectKey(plate.name);
    if (buff && t) {
      if (!this.buffs.has(t.uid)) this.buffs.set(t.uid, new Set());
      this.buffs.get(t.uid)!.add(buff);
      if (buff === 'xspeed') {
        // "one of this Pokémon's White Attacks will be changed to a Gold Attack": the biggest White piece.
        const w = [...t.def.wheel].filter((s) => s.move.color === 'white').sort((a, b) => b.weight - a.weight)[0];
        if (w) this.xspeed.set(t.uid, w.move.name);
      }
      text += ` en ${t.def.name}`;
    } else if (power) {
      this.typePowers[p].add(power);
      text += `: tus Pokémon de tipo ${power} hacen +20`;
    } else if (held && t) {
      this.held.set(t.uid, held);
      text += ` en ${t.def.name}: +20 mientras esté en el tablero`;
    } else if (heal && t) {
      t.cond = null;
      text += `: ${t.def.name} se cura`;
    } else if (duel) {
      if (t) this.spheres.set(t.uid, duel); else this.duelEffects[p].add(duel);
      if (duel === 'electroenergy') for (const f of this.figures) if (f.owner === p && f.cond === 'paralysis' && (f.def.type === 'Electric' || f.def.type2 === 'Electric')) f.cond = null;
      text += t ? ` en ${t.def.name}` : '';
    } else {
      switch (plate.name) {
        case 'Clear Wait': t!.wait = 0; text += `: ${t!.def.name} pierde el Wait`; break;
        case 'Max Revive': this.toBench(t!); t!.wait = 0; text += `: ${t!.def.name} vuelve al banquillo`; break;
        case 'Switcheroo': {
          const out = this.pc[p][0];
          this.toBench(out);
          this.sendToPc(t!);
          text += `: ${t!.def.name} va al P.C. y ${out.def.name} vuelve al banquillo`;
          break;
        }
        case 'Priority Recovery': this.pc[p].reverse(); text += ': cambia el orden del P.C.'; break;
        case 'Long Throw': { const to = nearest(this.longThrowSpots(p)); this.place(t!, to); text += `: ${t!.def.name} entra lejos`; break; }
        case 'Scoop Up': this.toBench(t!); text += `: ${t!.def.name} vuelve al banquillo`; break;
        case 'Swap Spot': { const o = this.neighbourFigures(t!).find((x) => x.owner === p)!; this.swapPlaces(t!, o); text += `: ${t!.def.name} cambia con ${o.def.name}`; break; }
        case 'Quick Care': this.sendToPc(t!); text += `: ${t!.def.name} va al P.C.`; break;
        case 'Hurdle Jump': { const to = nearest(this.hurdleSpots(t!)); this.relocate(t!, to); text += `: ${t!.def.name} salta`; break; }
        case 'Goal Block': this.relocate(t!, this.board.def.goals[p]); text += `: ${t!.def.name} defiende la portería`; break;
        case 'Pokémon Switch': {
          const o = fig(targets[1]);
          if (!o || o.owner !== p || o === t || (o.status === 'bench' && t!.status === 'bench') || o.status === 'pc') throw new Error('bad second target');
          const [ta, ts, oa, os] = [t!.at, t!.status, o.at, o.status];
          t!.at = oa; t!.status = os; o.at = ta; o.status = ts;
          text += `: ${t!.def.name} y ${o.def.name} cambian`;
          break;
        }
        case 'Recycle':
          for (const q of [0, 1] as PlayerId[]) for (const x of this.plates[q]) if (x.def.name !== 'Recycle') x.used = false;
          text += ': las plates vuelven a estar disponibles';
          break;
      }
    }
    slot.used = true;
    this.plateThisTurn = true;
    this.note(text);
    this.settle();
    if (spec.endsTurn && this.winner === null) this.endTurn();
    return text;
  }

  /** Type powers end when an enemy is knocked out by an Attack of a Pokémon of that type of yours. */
  typePowerKo(attacker: Figure): void {
    for (const t of [...this.typePowers[attacker.owner]]) if (attacker.def.type === t || attacker.def.type2 === t) this.typePowers[attacker.owner].delete(t);
  }

  /** Force Remove: out of the duel for good. */
  removeFromDuel(f: Figure): void {
    this.pc[f.owner] = this.pc[f.owner].filter((x) => x !== f);
    f.status = 'removed';
    f.at = null;
  }

  /** The player gives up: the opponent wins. */
  forfeit(p: PlayerId): void {
    if (this.winner === null) this.winner = (1 - p) as PlayerId;
  }

  setWait(uid: string, turns: number): void {
    const f = this.figures.find((x) => x.uid === uid);
    if (!f) throw new Error('unknown figure');
    f.wait = turns;
  }

  /**
   * "Gains Wait" with no number: in the TFG Wait lasts one turn (Bulbapedia "Wait (TFG)"), so here the figure skips its
   * owner's next turn (Wait counts both players' turns). A number is used as given.
   */
  gainWait(f: Figure, turns?: number): void {
    f.wait = Math.max(f.wait, turns ?? (f.owner === this.current ? 3 : 2));
  }

  /** Give a special condition (one at a time, the new one replaces the old). False if the figure is immune. */
  setCondition(f: Figure, c: Condition): boolean {
    if (f.status !== 'board' || !canHaveCondition(this, f, c)) return false;
    const isT = (t: string) => f.def.type === t || f.def.type2 === t;
    // Flame Energy / Flame Sphere: Fire-type not frozen or burned. Steel Energy / Metal Sphere: Steel-type not poisoned.
    if (isT('Fire') && (c === 'frozen' || c === 'burn') && (this.duelEffects[f.owner].has('flameenergy') || this.sphereActive(f.owner, 'flamesphere'))) return false;
    if (isT('Steel') && (c === 'poison' || c === 'noxious') && (this.duelEffects[f.owner].has('steelenergy') || this.sphereActive(f.owner, 'metalsphere'))) return false;
    f.cond = c;
    return true;
  }

  addMpMarker(f: Figure, delta: number): boolean {
    if (f.status !== 'board' || hasAbility(f, 'Leaf Guard')) return false; // Leaf Guard: no markers from attacks
    // Mystic Sphere: your Fairy-type Pokémon cannot have markers attached from Attacks.
    if ((f.def.type === 'Fairy' || f.def.type2 === 'Fairy') && this.sphereActive(f.owner, 'mysticsphere')) return false;
    f.mpMarker = (f.mpMarker ?? 0) + delta;
    return true;
  }

  /** Leaving the field removes conditions and markers (Bulbapedia); Wait stays. */
  private leaveField(f: Figure): void {
    f.at = null;
    f.cond = null;
    f.mpMarker = 0;
    f.fresh = false;
    f.finalSong = undefined;
    f.synthesisBy = undefined;
    this.held.delete(f.uid);
    this.spheres.delete(f.uid);
  }

  /** Send a figure to its owner's P.C.; a full P.C. pushes its oldest figure back to the bench. */
  sendToPc(f: Figure): void {
    this.pc[(f.owner)] = this.pc[f.owner].filter((x) => x !== f);
    f.status = 'pc';
    this.leaveField(f);
    this.pc[f.owner].push(f);
    while (this.pc[f.owner].length > this.rules.pcSize) {
      const back = this.pc[f.owner].shift()!;
      back.status = 'bench';
    }
  }

  toBench(f: Figure): void {
    if (f.status === 'pc') this.pc[f.owner] = this.pc[f.owner].filter((x) => x !== f);
    f.status = 'bench';
    this.leaveField(f);
  }

  fromPcToBench(f: Figure): void {
    this.toBench(f);
  }

  /** Put a figure on a node (from the bench or the board). */
  place(f: Figure, n: NodeId): void {
    f.status = 'board';
    f.at = n;
  }

  /** Move a figure on the board to a free node (effects). */
  relocate(f: Figure, n: NodeId): void {
    if (f.status !== 'board' || this.figureAt(n)) return;
    f.at = n;
  }

  swapPlaces(a: Figure, b: Figure): void {
    [a.at, b.at] = [b.at, a.at];
  }

  /** Swap a figure on the board with the first bench figure without Wait. */
  swapWithBench(f: Figure): boolean {
    const b = this.figures.find((o) => o.owner === f.owner && o.status === 'bench' && o.wait === 0);
    if (!b || !f.at) return false;
    const spot = f.at;
    this.toBench(f);
    this.place(b, spot);
    return true;
  }

  neighbourFigures(f: Figure): Figure[] {
    if (f.status !== 'board' || !f.at) return [];
    return this.board.neighbors(f.at).map((n) => this.figureAt(n)).filter((o): o is Figure => !!o);
  }

  freeNeighbours(n: NodeId): NodeId[] {
    return this.board.neighbors(n).filter((x) => this.isFree(x));
  }

  /** Steps from `from` to every node (ignoring figures). */
  distances(from: NodeId): Map<NodeId, number> {
    const d = new Map<NodeId, number>([[from, 0]]);
    const q = [from];
    while (q.length) {
      const c = q.shift()!;
      for (const n of this.board.neighbors(c)) if (!d.has(n)) { d.set(n, d.get(c)! + 1); q.push(n); }
    }
    return d;
  }

  /** Move `f` up to `steps` steps away from node `away` (each step to a free neighbour farther from it). */
  stepAway(f: Figure, away: NodeId, steps: number): void {
    const d = this.distances(away);
    for (let i = 0; i < steps && f.at; i++) {
      const next = this.freeNeighbours(f.at).filter((n) => (d.get(n) ?? 0) > (d.get(f.at!) ?? 0))
        .sort((x, y) => (d.get(y) ?? 0) - (d.get(x) ?? 0))[0];
      if (!next) break;
      f.at = next;
    }
  }

  /** The figure directly behind `f`, seen from `from` (a neighbour of `f` farther from `from`). */
  behind(f: Figure, from: Figure): Figure | null {
    if (!f.at || !from.at) return null;
    const d = this.distances(from.at);
    return this.neighbourFigures(f).find((o) => o !== from && (d.get(o.at!) ?? 0) > (d.get(f.at!) ?? 0)) ?? null;
  }

  /** A free spot behind `f`, seen from node `from`. */
  behindSpot(f: Figure, from: NodeId): NodeId | null {
    if (!f.at) return null;
    const d = this.distances(from);
    return this.freeNeighbours(f.at).find((n) => (d.get(n) ?? 0) > (d.get(f.at!) ?? 0)) ?? null;
  }

  /** `start` and the figures reachable from it through adjacent figures, excluding `except`. */
  chainFrom(start: Figure, except: Figure): Figure[] {
    const out = [start];
    const seen = new Set([start.uid, except.uid]);
    for (let i = 0; i < out.length; i++) {
      for (const o of this.neighbourFigures(out[i])) if (!seen.has(o.uid)) { seen.add(o.uid); out.push(o); }
    }
    return out;
  }

  note(text: string): void {
    this.onNote?.(text);
  }

  /** A figure with every adjacent spot held by enemies (awake ones) is knocked out without battle. */
  settle(): void {
    for (const f of this.figures) {
      if (f.status !== 'board') continue;
      const nbs = this.board.neighbors(f.at!);
      if (nbs.length && nbs.every((n) => { const o = this.figureAt(n); return !!o && o.owner === 1 - f.owner && !this.dozing(o); })) this.sendToPc(f);
    }
  }

  legalActionCount(p: PlayerId): number {
    const wasMoved = this.moved, wasCurrent = this.current;
    this.moved = false;
    this.current = p;
    let n = 0;
    for (const f of this.figures) {
      if (f.owner !== p) continue;
      n += this.reachable(f).size;
      if (this.canAttack(f)) n += this.adjacentEnemies(f).length;
      if (f.status === 'board') n += this.specials(f).length;
    }
    n += this.plates[p].filter((x, i) => !x.used && this.current === p && plateUsable(this, p, x.def) && i >= 0).length;
    this.moved = wasMoved;
    this.current = wasCurrent;
    return n;
  }

  private mine(uid: string): Figure {
    if (this.winner !== null) throw new Error('game is over');
    const f = this.figures.find((x) => x.uid === uid);
    if (!f) throw new Error('unknown figure');
    if (f.owner !== this.current) throw new Error('not your figure');
    return f;
  }
}
