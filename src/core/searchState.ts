// Search state / resources — ADR-007
// Class A (exact merge), Class B (approximate/compressed, merge-safe),
// Class C (historical, never part of mergeKey).

import { SectionType } from './nodeSignals';

export interface SearchResources {
  // --- Class A: exact, safe to merge on directly ---
  readonly elapsedDurationBucket: number;
  readonly energyBucket: number;
  readonly currentKeyBucket: string;

  // --- Class B: approximate/compressed summaries, exist to make merging feasible ---
  readonly songDiversityCount: number;
  readonly recentSectionTypes: readonly SectionType[]; // last N only

  // --- Class C: historical, NEVER included in mergeKey ---
  readonly usedChunkIds: ReadonlySet<string>;
  readonly usedSongIds: ReadonlySet<string>;
  readonly history: readonly string[]; // full chunk id sequence, for rendering + penalties
}

export interface SearchState {
  readonly currentNodeId: string;
  readonly accumulatedScore: number;
  readonly resources: SearchResources;
}

/**
 * Builds the merge key from Class A + Class B resources ONLY.
 * Class C (usedChunkIds, usedSongIds, history) must never appear here —
 * seeing them here is a bug, not a stricter merge.
 */
export function mergeKey(resources: SearchResources): string {
  return [
    resources.elapsedDurationBucket,
    resources.energyBucket,
    resources.currentKeyBucket,
    resources.songDiversityCount,
    resources.recentSectionTypes.join(','),
  ].join('|');
}
