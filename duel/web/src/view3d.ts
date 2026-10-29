import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Figure, NodeId } from '../../src/types.ts';
import { EMBEDDED, OWNER_COLOR, TYPE_COLOR, type Layout, type View } from './shared.ts';

/** Screenshot pixel coordinates -> world units on the table. */
function toWorld(p: [number, number]): THREE.Vector3 {
  return new THREE.Vector3((p[0] - 562) * 0.0125, 0, (p[1] - 981) * 0.0125);
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
      if (!el.clientWidth || !el.clientHeight) return;
      this.renderer.setSize(el.clientWidth, el.clientHeight, false);
      this.camera.aspect = el.clientWidth / el.clientHeight;
      // Pull the camera back on narrow screens so the whole 7-node-wide board stays in view.
      const k = Math.max(1, 1.3 / this.camera.aspect);
      const target = new THREE.Vector3(0, 0, 0.4);
      this.camera.position.copy(target).add(new THREE.Vector3(0, 12.5, 9.1).multiplyScalar(k));
      this.camera.lookAt(target);
      this.camera.updateProjectionMatrix();
    };
    this.resize = resize;
    addEventListener('resize', resize);
    resize();
    this.loop = () => {
      for (const [uid, target] of this.tween) {
        const g = this.figureGroup.get(uid)!;
        g.position.lerp(target, 0.25);
        if (g.position.distanceTo(target) < 0.01) { g.position.copy(target); this.tween.delete(uid); }
      }
      this.renderer.render(this.scene, this.camera);
    };
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

