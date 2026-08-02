// Generic planner interface — ADR-006
// Zero knowledge of audio. TNode/TResource/TEdge are supplied by MixForge;
// this interface must be satisfiable by an entirely different domain too.

import { PlannerConfig } from './plannerConfig';
import { ChunkNode } from './nodeSignals';
import { TransitionEdge } from './edgeSignals';
import { SearchResources } from './searchState';

export interface SearchProblem<TNode, TResource, TEdge> {
  getOutgoing(node: TNode): readonly TEdge[];
  updateResources(resource: TResource, edge: TEdge): TResource;
  isValid(resource: TResource): boolean;
  mergeKey(resource: TResource): string;

  /** Non-compensatory (ADR-005): implementers should use product/geomean/min-style composition. */
  edgeScore(edge: TEdge, config: PlannerConfig): number;
  /** Intrinsic content score (ADR-004). */
  nodeScore(node: TNode, config: PlannerConfig): number;
  /** Compensatory/additive (ADR-005): energy curve, diversity, duration, repetition. */
  pathScore(resource: TResource, config: PlannerConfig): number;
}

export type MusicSearchProblem = SearchProblem<ChunkNode, SearchResources, TransitionEdge>;
