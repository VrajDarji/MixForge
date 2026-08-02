import { SectionType } from './nodeSignals';

export interface SearchResources {
  readonly elapsedDurationBucket: number;
  readonly energyBucket: number;
  readonly currentKeyBucket: string;
  readonly songDiversityCount: number;
  readonly recentSectionTypes: readonly SectionType[];
  readonly usedChunkIds: ReadonlySet<string>;
  readonly usedSongIds: ReadonlySet<string>;
  readonly history: readonly string[];
}
