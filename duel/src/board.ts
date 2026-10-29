import type { BoardDef, NodeId } from './types.ts';

export class Board {
  private adj = new Map<NodeId, Set<NodeId>>();

  readonly def: BoardDef;

  constructor(def: BoardDef) {
    this.def = def;
    for (const n of def.nodes) this.adj.set(n, new Set());
    for (const [a, b] of def.edges) {
      if (!this.adj.has(a) || !this.adj.has(b)) throw new Error(`edge references unknown node: ${a}-${b}`);
      this.adj.get(a)!.add(b);
      this.adj.get(b)!.add(a);
    }
  }

  neighbors(n: NodeId): NodeId[] {
    return [...(this.adj.get(n) ?? [])];
  }
}
