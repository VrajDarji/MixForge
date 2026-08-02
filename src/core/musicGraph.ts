// Graph — static, immutable, offline-built (ADR-001, ADR-002)
// Interface only. The in-memory / persisted implementation lives in
// src/graph/ (Phase 2) and must satisfy this contract exactly.

import { ChunkNode } from './nodeSignals';
import { TransitionEdge } from './edgeSignals';

export interface MusicGraph {
  readonly nodes: ReadonlyMap<string, ChunkNode>;
  readonly edges: ReadonlyMap<string, readonly TransitionEdge[]>; // keyed by `from` node id
  getOutgoingEdges(nodeId: string): readonly TransitionEdge[];
  getNode(nodeId: string): ChunkNode | undefined;
}
