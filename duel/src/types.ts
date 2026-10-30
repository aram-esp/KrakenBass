export type PlayerId = 0 | 1;
export type NodeId = string;

/** Move colours. The matchup between them lives in rules.config.ts. */
export type Color = 'white' | 'gold' | 'purple' | 'blue' | 'red';

export interface Move {
  name: string;
  color: Color;
  /** Only meaningful for numeric colours (white/gold). */
  damage: number;
  /** Purple moves compare stars when both sides spin purple. */
  stars?: number;
}

/** One wheel slice; `weight` is its relative size on the roulette. */
export interface Segment {
  move: Move;
  weight: number;
}

export interface FigureDef {
  /** Matches assets/models/<id>.glb when a model is provided. */
  id: string;
  /** Pokémon type (placeholder colours, type badges) and the secondary type, if any. */
  type?: string;
  type2?: string;
  /** The figure's ability at the game version, if it has one (see src/abilities.ts). */
  ability?: { name: string; effect: string };
  name: string;
  /** Movement points available per turn. */
  mp: number;
  wheel: Segment[];
}

export interface Figure {
  uid: string;
  def: FigureDef;
  owner: PlayerId;
  /** null unless `status` is 'board'. */
  at: NodeId | null;
  status: 'bench' | 'board' | 'pc';
  /** Turns of Wait left; counts down every turn of either player. */
  wait: number;
}

export interface BoardDef {
  nodes: NodeId[];
  edges: [NodeId, NodeId][];
  /** goals[p] is the node player p must defend; the opponent wins by reaching it. */
  goals: Record<PlayerId, NodeId>;
  /** Entry nodes figures are placed on when leaving the bench, per player. */
  spawns: Record<PlayerId, NodeId[]>;
}
