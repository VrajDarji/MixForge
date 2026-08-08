import { SearchState } from '../core';
import { PlanFailure, PlanResult } from './types';

// Deterministic ordering everywhere a SearchState[] is sorted or deduped:
// higher score first; ties broken by currentNodeId so re-running with
// identical inputs always produces identical output (never insertion order).
export function compareStatesByScoreThenId(a: SearchState, b: SearchState): number {
  if (b.accumulatedScore !== a.accumulatedScore) return b.accumulatedScore - a.accumulatedScore;
  return a.resources.currentNodeId < b.resources.currentNodeId ? -1 : 1;
}

export function isPlanFailure(result: PlanResult): result is PlanFailure {
  return 'failure' in result;
}
