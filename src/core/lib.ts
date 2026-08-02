// Core data-shaping functions. Per the Phase 1 scope discipline, this file
// holds the only two runtime functions allowed in src/core/: measurement()
// and mergeKey(). No algorithms, no DSP, no planner/search logic.

import { Measurement, SearchResources } from './types';

// ADR-002 / ADR-009 — builds a Measurement<T> from its four fields exactly
// as passed; see ./types.ts for field semantics.
export function measurement<T>(
  value: T,
  confidence: number,
  detector: string,
  version: string
): Measurement<T> {
  return { value, confidence, detector, version };
}

/**
 * ADR-007 — builds the merge key from Class A + Class B resources ONLY.
 * Class C (usedChunkIds, usedSongIds, history) must never appear here —
 * seeing them here is a bug, not a stricter merge.
 */
export function mergeKey(resources: SearchResources): string {
  return [
    resources.elapsedDurationBucket,
    resources.energyBucket,
    resources.currentKeyBucket,
    resources.currentNodeId,
    resources.songDiversityCount,
    resources.recentSectionTypes.join(','),
  ].join('|');
}
