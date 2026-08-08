import { SearchState } from '../core';
import { PlanFailure, PlanResult } from './types';

// Deterministic ordering everywhere a SearchState[] is sorted or deduped:
// higher score first; ties broken by currentNodeId, then elapsedDurationBucket,
// then history, so re-running with identical inputs always produces identical
// output (never insertion order) and the comparator is a valid total order —
// compare(a,b) and compare(b,a) never both return the same nonzero sign.
export function compareStatesByScoreThenId(a: SearchState, b: SearchState): number {
  if (b.accumulatedScore !== a.accumulatedScore) return b.accumulatedScore - a.accumulatedScore;
  if (a.resources.currentNodeId !== b.resources.currentNodeId) {
    return a.resources.currentNodeId < b.resources.currentNodeId ? -1 : 1;
  }
  if (a.resources.elapsedDurationBucket !== b.resources.elapsedDurationBucket) {
    return a.resources.elapsedDurationBucket - b.resources.elapsedDurationBucket;
  }
  const aHistory = a.resources.history.join('>');
  const bHistory = b.resources.history.join('>');
  return aHistory < bHistory ? -1 : aHistory > bHistory ? 1 : 0;
}

export function isPlanFailure(result: PlanResult): result is PlanFailure {
  return 'failure' in result;
}
