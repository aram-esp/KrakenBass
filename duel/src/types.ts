export type PlayerId = 0 | 1;
export type NodeId = string;

/** Move colours. The matchup between them lives in rules.config.ts. */
export type Color = 'white' | 'gold' | 'purple' | 'blue' | 'red';

export interface Move {
  name: string;
  color: Color;
  /** Only meaningful for numeric colours (white/gold). */
  damage: number;
}

/** One wheel slice; `weight` is its relative size on the roulette. */
export interface Segment {
  move: Move;
  weight: number;
}

export interface FigureDef {
  id: string;
  name: string;
  /** Movement points available per turn. */
  mp: number;
  wheel: Segment[];
}

export interface Figure {
  uid: string;
  def: FigureDef;
  owner: PlayerId;
  /** null while on the bench or knocked out (see `status`). */
  at: NodeId | null;
  status: 'bench' | 'board' | 'ko';
}

export interface BoardDef {
  nodes: NodeId[];
  edges: [NodeId, NodeId][];
  /** goals[p] is the node player p must defend; the opponent wins by reaching it. */
  goals: Record<PlayerId, NodeId>;
  /** Entry nodes figures are placed on when leaving the bench, per player. */
  spawns: Record<PlayerId, NodeId[]>;
}
