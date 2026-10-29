import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Game } from '../../src/game.ts';
import { aiTurn } from '../../src/ai.ts';
import { toFigureDef, type FigureRecord } from '../../src/data.ts';
import { seeded } from '../../src/rng.ts';
import type { BattleResult } from '../../src/battle.ts';
import type { BoardDef, Figure, FigureDef, Move, NodeId, PlayerId } from '../../src/types.ts';

type Layout = BoardDef & { layout: Record<string, [number, number] | string> };

const HUMAN: PlayerId = 0;
const OWNER_COLOR = [0x2a6df4, 0xd8343c];
const MOVE_COLOR: Record<string, string> = { white: '#ffffff', gold: '#ffc107', purple: '#8e44ad', blue: '#2f80ed', red: '#e74c3c' };
const TYPE_COLOR: Record<string, number> = {
  Normal: 0xa8a77a, Fire: 0xee8130, Water: 0x6390f0, Electric: 0xf7d02c, Grass: 0x7ac74c, Ice: 0x96d9d6,
  Fighting: 0xc22e28, Poison: 0xa33ea1, Ground: 0xe2bf65, Flying: 0xa98ff3, Psychic: 0xf95587, Bug: 0xa6b91a,
  Rock: 0xb6a136, Ghost: 0x735797, Dragon: 0x6f35fc, Dark: 0x705746, Steel: 0xb7b7ce, Fairy: 0xd685ad,
};

/** Data embedded in the page (published build) wins; otherwise fetch it (local dev server). */
async function readData<T>(id: string, url: string): Promise<T> {
  const el = document.getElementById(id);
  if (el?.textContent) return JSON.parse(el.textContent) as T;
  return (await fetch(url)).json() as Promise<T>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main() {
  const [boardJson, records] = await Promise.all([
    readData<Layout>('data-board', '../data/board.json'),
    readData<FigureRecord[]>('data-figures', '../data/figures.json'),
  ]);
  const pool: FigureDef[] = records.map(toFigureDef);
  const world = new World(boardJson);
  new Match(world, boardJson, pool).start();
}

/** Screenshot pixel coordinates -> world units on the table. */
function toWorld(p: [number, number]): THREE.Vector3 {
  return new THREE.Vector3((p[0] - 562) * 0.0125, 0, (p[1] - 981) * 0.0125);
}

class World {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  raycaster = new THREE.Raycaster();
  nodePos = new Map<NodeId, THREE.Vector3>();
  nodeMesh = new Map<NodeId, THREE.Mesh>();
  figureGroup = new Map<string, THREE.Group>();
  tween = new Map<string, THREE.Vector3>();
  hilite: THREE.Mesh[] = [];
  ring: THREE.Mesh;
  loader = new GLTFLoader();
  hasModel = new Map<string, Promise<boolean>>();

  constructor(board: Layout) {
    const canvas = $<HTMLCanvasElement>('view');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x12151c);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 12.5, 9.5);
    this.camera.lookAt(0, 0, 0.4);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334055, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 10, 6);
    this.scene.add(sun);

    const table = new THREE.Mesh(new THREE.PlaneGeometry(16, 11), new THREE.MeshStandardMaterial({ color: 0x232b3d }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.02;
    this.scene.add(table);

    for (const n of board.nodes) this.nodePos.set(n, toWorld(board.layout[n] as [number, number]));
    const pts: THREE.Vector3[] = [];
    for (const [a, b] of board.edges) pts.push(this.nodePos.get(a)!.clone().setY(0.01), this.nodePos.get(b)!.clone().setY(0.01));
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcfd6e6 })));

    const goalOf = new Map<NodeId, number>([[board.goals[0], 0], [board.goals[1], 1]]);
    const entries = new Set<NodeId>([...board.spawns[0], ...board.spawns[1]]);
    for (const n of board.nodes) {
      const g = goalOf.get(n);
      const r = g !== undefined ? 0.5 : entries.has(n) ? 0.4 : 0.22;
      const color = g === 0 ? 0x2a6df4 : g === 1 ? 0xff7a2e : entries.has(n) ? 0x9aa7c4 : 0xe9eefb;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 28), new THREE.MeshStandardMaterial({ color, emissive: g !== undefined ? color : 0x000000, emissiveIntensity: 0.5 }));
      m.position.copy(this.nodePos.get(n)!);
      m.userData.node = n;
      this.scene.add(m);
      this.nodeMesh.set(n, m);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    const resize = () => {
      const el = canvas.parentElement!;
      this.renderer.setSize(el.clientWidth, el.clientHeight, false);
      this.camera.aspect = el.clientWidth / el.clientHeight;
      // Pull the camera back on narrow screens so the whole 7-node-wide board stays in view.
      const k = Math.max(1, 1.3 / this.camera.aspect);
      const target = new THREE.Vector3(0, 0, 0.4);
      this.camera.position.copy(target).add(new THREE.Vector3(0, 12.5, 9.1).multiplyScalar(k));
      this.camera.lookAt(target);
      this.camera.updateProjectionMatrix();
    };
    addEventListener('resize', resize);
    resize();
    this.renderer.setAnimationLoop(() => {
      for (const [uid, target] of this.tween) {
        const g = this.figureGroup.get(uid)!;
        g.position.lerp(target, 0.25);
        if (g.position.distanceTo(target) < 0.01) { g.position.copy(target); this.tween.delete(uid); }
      }
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Remove every figure so a new duel starts with fresh pieces (new deck, new types, new models). */
  clearFigures() {
    for (const g of this.figureGroup.values()) {
      this.scene.remove(g);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
    }
    this.figureGroup.clear();
    this.tween.clear();
  }

  /** Placeholder base + body; a model at assets/models/<id>.glb replaces the body when it exists. */
  addFigure(f: Figure) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.14, 24), new THREE.MeshStandardMaterial({ color: OWNER_COLOR[f.owner] }));
    base.position.y = 0.07;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), new THREE.MeshStandardMaterial({ color: TYPE_COLOR[f.def.type ?? ''] ?? 0xcccccc }));
    body.position.y = 0.45;
    g.add(base, body);
    g.userData.uid = f.uid;
    g.visible = false;
    this.scene.add(g);
    this.figureGroup.set(f.uid, g);
    this.tryModel(f.def.id).then((ok) => {
      if (!ok) return;
      this.loader.load(`../assets/models/${f.def.id}.glb`, (gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        gltf.scene.scale.setScalar(0.85 / (size.y || 1));
        gltf.scene.position.y = 0.14;
        g.remove(body);
        g.add(gltf.scene);
      });
    });
  }

  private tryModel(id: string): Promise<boolean> {
    if (document.getElementById('data-board')) return Promise.resolve(false); // published single-file build has no model folder
    if (!this.hasModel.has(id)) {
      this.hasModel.set(id, fetch(`../assets/models/${id}.glb`, { method: 'HEAD' }).then((r) => r.ok).catch(() => false));
    }
    return this.hasModel.get(id)!;
  }

  place(uid: string, node: NodeId | null) {
    const g = this.figureGroup.get(uid)!;
    if (!node) { g.visible = false; return; }
    const target = this.nodePos.get(node)!.clone().setY(0.02);
    if (!g.visible) g.position.copy(target);
    g.visible = true;
    this.tween.set(uid, target);
  }

  setHighlights(nodes: Iterable<NodeId>, selected: NodeId | null) {
    for (const m of this.hilite) this.scene.remove(m);
    this.hilite = [];
    for (const n of nodes) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20), new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, opacity: 0.8 }));
      m.position.copy(this.nodePos.get(n)!).setY(0.05);
      this.scene.add(m);
      this.hilite.push(m);
    }
    this.ring.visible = !!selected;
    if (selected) this.ring.position.copy(this.nodePos.get(selected)!).setY(0.06);
  }

  /** What did the user click: a figure uid, a node, or nothing. */
  pick(ev: MouseEvent): { uid?: string; node?: NodeId } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const figs = [...this.figureGroup.values()].filter((g) => g.visible);
    const hit = this.raycaster.intersectObjects([...figs, ...this.nodeMesh.values()], true)[0];
    if (!hit) return {};
    let o: THREE.Object3D | null = hit.object;
    while (o) {
      if (o.userData.uid) return { uid: o.userData.uid };
      if (o.userData.node) return { node: o.userData.node };
      o = o.parent;
    }
    return {};
  }
}

class Match {
  game!: Game;
  selected: string | null = null;
  busy = false;
  seedBase = Date.now();

  constructor(private world: World, private board: Layout, private pool: FigureDef[]) {}

  start() {
    const rng = seeded(this.seedBase++);
    const deck = () => Array.from({ length: 6 }, () => this.pool[Math.floor(rng() * this.pool.length)]);
    const first: PlayerId = rng() < 0.5 ? 0 : 1;
    this.game = new Game(this.board, [deck(), deck()], seeded(this.seedBase++), undefined, first);
    this.game.onBattle = (m, o, r) => this.showBattle(m, o, r);
    this.selected = null;
    $('log').innerHTML = '';
    $('banner').classList.remove('show');
    this.world.clearFigures();
    for (const f of this.game.figures) this.world.addFigure(f);
    this.log(`Empieza ${first === HUMAN ? 'el jugador (azul)' : 'la IA (rojo)'}. Quien empieza tiene MP-1 en su primer turno.`);
    (window as unknown as { __duel: unknown }).__duel = { game: this.game, match: this, world: this.world };
    $('end').onclick = () => { if (this.canAct()) { this.game.endTurn(); this.afterHuman(); } };
    $('again').onclick = () => this.start();
    this.world.renderer.domElement.onclick = (ev) => this.click(world_pick(this.world, ev));
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
    const g = this.game, w = this.world;
    for (const f of g.figures) w.place(f.uid, f.status === 'board' ? f.at : null);
    const sel = this.selected ? g.figures.find((f) => f.uid === this.selected)! : null;
    w.setHighlights(sel ? g.reachable(sel) : [], sel && sel.status === 'board' ? sel.at : null);

    const side = (p: PlayerId) => {
      const pc = g.pc[p].map((f) => f.def.name).join(', ') || '—';
      const waits = g.figures.filter((f) => f.owner === p && f.wait > 0).map((f) => `${f.def.name} Wait ${f.wait}`).join(', ');
      return `<b style="color:${p === 0 ? '#6fa0ff' : '#ff7a80'}">${p === HUMAN ? 'Tú (azul)' : 'IA (rojo)'}</b><br>P.C.: ${pc}${waits ? `<br>${waits}` : ''}`;
    };
    $('side').innerHTML = `${side(1)}<hr style="border:0;border-top:1px solid #fff2">${side(0)}`;
    $('sidem').innerHTML = `<span>${side(1)}</span><span>${side(0)}</span>`;
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

function world_pick(w: World, ev: MouseEvent) { return w.pick(ev); }

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

main();
