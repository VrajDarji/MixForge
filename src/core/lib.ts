import { Measurement, SearchResources } from './types';

export function measurement<T>(
  value: T,
  confidence: number,
  detector: string,
  version: string
): Measurement<T> {
  return { value, confidence, detector, version };
}

/** ADR-007: Class A + Class B fields only. Never add Class C (usedChunkIds/usedSongIds/history) here. */
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
