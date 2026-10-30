import type { Figure, NodeId } from '../../src/types.ts';
import { badgeText, drawBadge, OWNER_COLOR, spriteSrc, type Badge, TYPE_COLOR, type Layout, type View } from './shared.ts';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Original placeholder creature: a body in the type colour, eyes, and one trait picked from the name. */
function makeSprite(f: Figure): HTMLCanvasElement {
  const S = 96, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  const base = TYPE_COLOR[f.def.type ?? ''] ?? 0xaaaaaa;
  const body = hex(base);
  const dark = `#${[16, 8, 0].map((sh) => Math.max(0, ((base >> sh) & 255) - 70).toString(16).padStart(2, '0')).join('')}`;
  const light = `#${[16, 8, 0].map((sh) => Math.min(255, ((base >> sh) & 255) + 60).toString(16).padStart(2, '0')).join('')}`;
  const h = hash(f.def.name);
  c.lineWidth = 4; c.strokeStyle = dark; c.fillStyle = body;
  const trait = h % 4;
  const tri = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); c.stroke();
  };
  if (trait === 0) { tri(24, 40, 20, 8, 42, 30); tri(72, 40, 76, 8, 54, 30); } // ears
  else if (trait === 1) tri(40, 28, 48, 4, 56, 28); // horn
  else if (trait === 2) { tri(30, 30, 34, 10, 42, 28); tri(44, 26, 48, 6, 52, 26); tri(54, 28, 62, 10, 66, 30); } // crest
  else { c.beginPath(); c.ellipse(78, 66, 14, 8, 0.6, 0, Math.PI * 2); c.fill(); c.stroke(); } // tail
  c.beginPath(); c.ellipse(48, 56, 34, 32, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = light; c.beginPath(); c.ellipse(48, 66, 20, 16, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 2;
  for (const x of [36, 60]) {
    c.beginPath(); c.arc(x, 50, 8, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#111'; c.beginPath(); c.arc(x + 1, 51, 4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff';
  }
  c.strokeStyle = '#111'; c.lineWidth = 3; c.beginPath();
  c.arc(48, 66, 6, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  return cv;
}

interface Token { f: Figure; x: number; y: number; tx: number; ty: number; show: boolean; sprite: HTMLCanvasElement; img: HTMLImageElement | null }

/** Top-down 2D view. A file at assets/sprites/<figure id>.png replaces the drawn placeholder. */
export class View2D implements View {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nodes = new Map<NodeId, [number, number]>();
  private edges: [NodeId, NodeId][];
  private goal = new Map<NodeId, number>();
  private entries = new Set<NodeId>();
  private tokens = new Map<string, Token>();
  private reach: NodeId[] = [];
  private selected: NodeId | null = null;
  private W = 0; private H = 0; private scale = 1; private ox = 0; private oy = 0;
  private raf = 0;
  private bbox: [number, number, number, number];

  constructor(board: Layout, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    for (const n of board.nodes) this.nodes.set(n, board.layout[n] as [number, number]);
    this.edges = board.edges;
    this.goal.set(board.goals[0], 0); this.goal.set(board.goals[1], 1);
    for (const n of [...board.spawns[0], ...board.spawns[1]]) this.entries.add(n);
    const xs = [...this.nodes.values()].map((p) => p[0]), ys = [...this.nodes.values()].map((p) => p[1]);
    this.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    addEventListener('resize', () => this.active() && this.resize());
  }

  private active() { return this.raf !== 0; }

  setActive(on: boolean) {
    if (on && !this.raf) {
      this.resize();
      const frame = () => { this.draw(); this.raf = requestAnimationFrame(frame); };
      this.raf = requestAnimationFrame(frame);
    } else if (!on && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private resize() {
    const el = this.canvas.parentElement!;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w; this.H = h;
    const [x0, y0, x1, y1] = this.bbox, pad = 56;
    const sw = (x1 - x0) + 2 * pad, sh = (y1 - y0) + 2 * pad;
    this.scale = Math.min(w / sw, h / sh);
    this.ox = (w - (x1 - x0) * this.scale) / 2 - x0 * this.scale;
    this.oy = (h - (y1 - y0) * this.scale) / 2 - y0 * this.scale;
  }

  /** CSS pixel position of a node inside the canvas (also used by tests). */
  screenOf(n: NodeId): { x: number; y: number } {
    const p = this.nodes.get(n)!;
    return { x: p[0] * this.scale + this.ox, y: p[1] * this.scale + this.oy };
  }

  clearFigures() { this.tokens.clear(); this.badges.clear(); }

  private badges = new Map<string, Badge>();
  setBadges(badges: Map<string, Badge>) { this.badges = badges; }

  addFigure(f: Figure) {
    const t: Token = { f, x: 0, y: 0, tx: 0, ty: 0, show: false, sprite: makeSprite(f), img: null };
    this.tokens.set(f.uid, t);
    spriteSrc(f.def.id).then((src) => {
      if (!src) return;
      const img = new Image();
      img.onload = () => { t.img = img; };
      img.src = src;
    });
  }

  place(uid: string, node: NodeId | null) {
    const t = this.tokens.get(uid);
    if (!t) return;
    if (!node) { t.show = false; return; }
    const p = this.nodes.get(node)!;
    t.tx = p[0]; t.ty = p[1];
    if (!t.show) { t.x = t.tx; t.y = t.ty; }
    t.show = true;
  }

  setHighlights(nodes: Iterable<NodeId>, selected: NodeId | null) {
    this.reach = [...nodes];
    this.selected = selected;
  }

  private unit() { return 137 * this.scale; }

  pick(ev: MouseEvent): { uid?: string; node?: NodeId } {
    const r = this.canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top, u = this.unit();
    let best: { uid: string; d: number } | null = null;
    for (const t of this.tokens.values()) {
      if (!t.show) continue;
      const d = Math.hypot(x - (t.x * this.scale + this.ox), y - (t.y * this.scale + this.oy));
      if (d < u * 0.34 && (!best || d < best.d)) best = { uid: t.f.uid, d };
    }
    if (best) return { uid: best.uid };
    let node: NodeId | undefined, nd = u * 0.3;
    for (const n of this.nodes.keys()) {
      const s = this.screenOf(n), d = Math.hypot(x - s.x, y - s.y);
      if (d < nd) { nd = d; node = n; }
    }
    return node ? { node } : {};
  }

  private draw() {
    const c = this.ctx, u = this.unit();
    c.clearRect(0, 0, this.W, this.H);
    const [x0, y0, x1, y1] = this.bbox, pad = 40 * this.scale;
    c.fillStyle = '#232b3d';
    c.beginPath(); c.roundRect(x0 * this.scale + this.ox - pad, y0 * this.scale + this.oy - pad, (x1 - x0) * this.scale + 2 * pad, (y1 - y0) * this.scale + 2 * pad, 18); c.fill();

    c.strokeStyle = '#cfd6e6'; c.lineWidth = Math.max(1.5, u * 0.03);
    c.beginPath();
    for (const [a, b] of this.edges) { const p = this.screenOf(a), q = this.screenOf(b); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
    c.stroke();

    for (const n of this.nodes.keys()) {
      const s = this.screenOf(n), g = this.goal.get(n);
      const r = g !== undefined ? u * 0.24 : this.entries.has(n) ? u * 0.18 : u * 0.1;
      c.fillStyle = g === 0 ? '#2a6df4' : g === 1 ? '#ff7a2e' : this.entries.has(n) ? '#9aa7c4' : '#e9eefb';
      c.beginPath(); c.arc(s.x, s.y, r, 0, Math.PI * 2); c.fill();
    }
    for (const n of this.reach) {
      const s = this.screenOf(n);
      c.fillStyle = 'rgba(76,217,100,.85)';
      c.beginPath(); c.arc(s.x, s.y, u * 0.16, 0, Math.PI * 2); c.fill();
    }
    if (this.selected) {
      const s = this.screenOf(this.selected);
      c.strokeStyle = '#fff'; c.lineWidth = 3;
      c.beginPath(); c.arc(s.x, s.y, u * 0.38, 0, Math.PI * 2); c.stroke();
    }

    const R = u * 0.3;
    const list = [...this.tokens.values()].filter((t) => t.show).sort((a, b) => a.y - b.y);
    for (const t of list) {
      t.x += (t.tx - t.x) * 0.25; t.y += (t.ty - t.y) * 0.25;
      const x = t.x * this.scale + this.ox, y = t.y * this.scale + this.oy;
      c.fillStyle = hex(OWNER_COLOR[t.f.owner]);
      c.beginPath(); c.ellipse(x, y + R * 0.75, R * 1.05, R * 0.42, 0, 0, Math.PI * 2); c.fill();
      c.imageSmoothingEnabled = !t.img;
      c.drawImage(t.img ?? t.sprite, x - R * 1.05, y - R * 1.35, R * 2.1, R * 2.1);
      c.fillStyle = '#e8ecf4'; c.font = `${Math.max(9, u * 0.13)}px system-ui, sans-serif`; c.textAlign = 'center';
      const label = t.f.def.name.length > 11 ? t.f.def.name.slice(0, 10) + '…' : t.f.def.name;
      c.fillText(label, x, y + R * 1.35);
      const b = this.badges.get(t.f.uid);
      if (b) drawBadge(badgeText(b), b.wait > 0, c, x, y - R * 1.5, Math.max(14, u * 0.2));
    }
  }
}
