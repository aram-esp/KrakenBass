import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Figure, NodeId } from '../../src/types.ts';
import { badgeText, drawBadge, EMBEDDED, OWNER_COLOR, spriteSrc, type Badge, TYPE_COLOR, type Layout, type View } from './shared.ts';

/** Screenshot pixel coordinates -> world units on the table. */
function toWorld(p: [number, number]): THREE.Vector3 {
  return new THREE.Vector3((p[0] - 562) * 0.0125, 0, (p[1] - 981) * 0.0125);
}

/**
 * Camera elevation above the table (degrees). Lower = more tilted, figures seen more from the front.
 * Portrait screens get a higher camera: tilted, the wide board would be a thin strip there.
 */
const CAMERA_ELEVATION = 36;
const CAMERA_ELEVATION_PORTRAIT = 52;

/** World units per sprite pixel: a typical 60 px tall figure stands ~1.25 units. */
const SPRITE_UNIT = 0.021;

/** Pixel-art texture cropped to its opaque pixels, so the sprite's feet sit on the base. */
function croppedSprite(img: HTMLImageElement): { tex: THREE.Texture; w: number; h: number } {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const a = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (a[(y * c.width + x) * 4 + 3] > 16) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d')!.drawImage(c, x0, y0, w, h, 0, 0, w, h);
  const tex = new THREE.CanvasTexture(out);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w, h };
}

export class View3D implements View {
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
  /** Goal glows, pulsing in the render loop. */
  goalGlow: THREE.Mesh[] = [];
  loader = new GLTFLoader();
  hasModel = new Map<string, Promise<boolean>>();

  canvas: HTMLCanvasElement;
  private resize: () => void = () => {};
  private loop: () => void = () => {};

  constructor(board: Layout, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
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

    // Board in the style of the original field screenshot (research/img/field.png): a pale mottled surface,
    // thick white routes, small white ring points, concentric rings on the entry points, glowing goals
    // (blue for the player's, orange for the opponent's) and white lines setting the benches apart.
    this.scene.background = new THREE.Color(0x0e1424);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.9 }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.02;
    this.scene.add(table);

    for (const n of board.nodes) this.nodePos.set(n, toWorld(board.layout[n] as [number, number]));
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const strip = (a: THREE.Vector3, b: THREE.Vector3, width: number) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, width), white);
      m.position.copy(a).lerp(b, 0.5).setY(0.005);
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      this.scene.add(m);
    };
    for (const [a, b] of board.edges) strip(this.nodePos.get(a)!, this.nodePos.get(b)!, 0.08);
    // Bench lines, beyond each back row.
    const xs = [...this.nodePos.values()].map((v) => v.x), zs = [...this.nodePos.values()].map((v) => v.z);
    const minX = Math.min(...xs) - 0.6, maxX = Math.max(...xs) + 0.6;
    for (const z of [Math.min(...zs) - 0.85, Math.max(...zs) + 0.85]) strip(new THREE.Vector3(minX, 0, z), new THREE.Vector3(maxX, 0, z), 0.07);

    const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, at: THREE.Vector3, y: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.copy(at).setY(y);
      this.scene.add(m);
      return m;
    };
    const goalOf = new Map<NodeId, number>([[board.goals[0], 0], [board.goals[1], 1]]);
    const entries = new Set<NodeId>([...board.spawns[0], ...board.spawns[1]]);
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hub = new THREE.MeshStandardMaterial({ color: 0xb9bfcc, roughness: 0.6 });
    for (const n of board.nodes) {
      const at = this.nodePos.get(n)!;
      const g = goalOf.get(n);
      if (g !== undefined) {
        const color = g === 0 ? 0x2f8cff : 0xff8a2e;
        const glow = flat(new THREE.CircleGeometry(0.62, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }), at, 0.012);
        this.goalGlow.push(glow);
        flat(new THREE.CircleGeometry(0.44, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.35 }), at, 0.016);
        flat(new THREE.RingGeometry(0.44, 0.52, 40), new THREE.MeshBasicMaterial({ color }), at, 0.018);
        // Arrow pointing along the row, like the original's play-style goal mark.
        const tri = new THREE.Shape();
        tri.moveTo(-0.13, -0.17); tri.lineTo(0.2, 0); tri.lineTo(-0.13, 0.17); tri.closePath();
        const arrow = flat(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color }), at, 0.02);
        if (g === 1) arrow.rotation.z = Math.PI;
      } else if (entries.has(n)) {
        for (const [r0, r1] of [[0.4, 0.46], [0.25, 0.3]]) flat(new THREE.RingGeometry(r0, r1, 36), white, at, 0.014);
        flat(new THREE.CircleGeometry(0.12, 24), hub, at, 0.014);
      } else {
        flat(new THREE.CircleGeometry(0.16, 24), white, at, 0.014);
        flat(new THREE.CircleGeometry(0.09, 24), hub, at, 0.016);
      }
      // Invisible disc for clicks, bigger than the drawn point.
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), pickMat);
      pick.position.copy(at);
      pick.userData.node = n;
      this.scene.add(pick);
      this.nodeMesh.set(n, pick);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    // Points that must stay on screen: every node, and the top of a figure standing on it.
    const fitPoints: THREE.Vector3[] = [];
    for (const p of this.nodePos.values()) fitPoints.push(p.clone(), p.clone().setY(1.3));
    const resize = () => {
      const el = canvas.parentElement!;
      if (!el.clientWidth || !el.clientHeight) return;
      this.renderer.setSize(el.clientWidth, el.clientHeight, false);
      this.camera.aspect = el.clientWidth / el.clientHeight;
      this.camera.updateProjectionMatrix();
      this.fitCamera(fitPoints);
    };
    this.resize = resize;
    addEventListener('resize', resize);
    resize();
    this.loop = () => {
      const t = performance.now() / 1000;
      for (const m of this.goalGlow) (m.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.2 * Math.sin(t * 2.4);
      for (const [uid, target] of this.tween) {
        const g = this.figureGroup.get(uid)!;
        g.position.lerp(target, 0.25);
        if (g.position.distanceTo(target) < 0.01) { g.position.copy(target); this.tween.delete(uid); }
      }
      this.renderer.render(this.scene, this.camera);
    };
  }

  /** Tilted camera, moved in as close as it can while every fit point stays inside the view. */
  private fitCamera(points: THREE.Vector3[]) {
    const e = ((this.camera.aspect < 1 ? CAMERA_ELEVATION_PORTRAIT : CAMERA_ELEVATION) * Math.PI) / 180;
    const dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
    const target = new THREE.Vector3(0, 0.3, 0);
    const v = new THREE.Vector3();
    const fits = (d: number) => {
      this.camera.position.copy(target).addScaledVector(dir, d);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      return points.every((p) => { v.copy(p).project(this.camera); return Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.9 && v.z < 1; });
    };
    let lo = 3, hi = 80;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    fits(hi);
  }

  setActive(on: boolean) {
    this.renderer.setAnimationLoop(on ? this.loop : null);
    if (on) this.resize();
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
    for (const { s } of this.badgeSprites.values()) s.material.map?.dispose();
    this.badgeSprites.clear();
  }

  /**
   * Placeholder base + body. A model at assets/models/<id>.glb replaces the body; otherwise the figure's sprite
   * (see spriteSrc) stands on the base as a camera-facing billboard (2.5D).
   */
  addFigure(f: Figure) {
    const g = new THREE.Group();
    // Wooden base with a rim in the team colour, as on the original figures.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.07, 28), new THREE.MeshStandardMaterial({ color: OWNER_COLOR[f.owner], emissive: OWNER_COLOR[f.owner], emissiveIntensity: 0.25 }));
    base.position.y = 0.035;
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.41, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.8 }));
    wood.position.y = 0.105;
    g.add(wood);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), new THREE.MeshStandardMaterial({ color: TYPE_COLOR[f.def.type ?? ''] ?? 0xcccccc }));
    body.position.y = 0.45;
    g.add(base, body);
    g.userData.uid = f.uid;
    g.visible = false;
    this.scene.add(g);
    this.figureGroup.set(f.uid, g);
    this.tryModel(f.def.id).then((ok) => {
      if (!ok) { this.addSprite(f, g, body); return; }
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

  private addSprite(f: Figure, g: THREE.Group, body: THREE.Mesh) {
    spriteSrc(f.def.id).then((src) => {
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        if (!this.figureGroup.has(f.uid)) return; // duel restarted while loading
        const { tex, w, h } = croppedSprite(img);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
        s.center.set(0.5, 0);
        s.scale.set(w * SPRITE_UNIT, h * SPRITE_UNIT, 1);
        s.position.y = 0.15;
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.152;
        g.remove(body);
        body.geometry.dispose();
        (body.material as THREE.Material).dispose();
        g.add(shadow, s);
      };
      img.src = src;
    });
  }

  private tryModel(id: string): Promise<boolean> {
    if (EMBEDDED()) return Promise.resolve(false); // published single-file build has no model folder
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

  /** One label per figure, floating at its feet on the camera side so the sprite never hides it. */
  private badgeSprites = new Map<string, { s: THREE.Sprite; text: string }>();

  setBadges(badges: Map<string, Badge>) {
    for (const [uid, g] of this.figureGroup) {
      const b = badges.get(uid);
      let entry = this.badgeSprites.get(uid);
      if (!b) { if (entry) entry.s.visible = false; continue; }
      const text = badgeText(b);
      if (!entry) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
        s.center.set(0.5, 0.5);
        s.scale.set(0.9, 0.34, 1);
        s.position.set(0, 0.22, 0.62);
        s.renderOrder = 10;
        g.add(s);
        entry = { s, text: '' };
        this.badgeSprites.set(uid, entry);
      }
      if (entry.text !== text) {
        const tex = new THREE.CanvasTexture(drawBadge(text, b.wait > 0)!);
        tex.colorSpace = THREE.SRGBColorSpace;
        entry.s.material.map?.dispose();
        entry.s.material.map = tex;
        entry.s.material.needsUpdate = true;
        entry.text = text;
      }
      entry.s.visible = true;
    }
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


/** Pale mottled surface like the original field: soft lilac, green and grey blotches on a light ground. */
function marbleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#cfcbd6';
  x.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tints = ['#b9b3c9', '#c4d1c0', '#dedae4', '#a9b4b8', '#d8cfe0', '#bcc8cf'];
  for (let i = 0; i < 260; i++) {
    const px = rnd() * 512, py = rnd() * 512, r = 20 + rnd() * 90;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, tints[Math.floor(rnd() * tints.length)] + 'aa');
    g.addColorStop(1, tints[0] + '00');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(px, py, r * 1.8, r * 0.6, rnd() * Math.PI, 0, Math.PI * 2); x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2.2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
