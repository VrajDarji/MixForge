// Node signals — intrinsic, per-chunk properties (ADR-004)

import { Measurement } from './measurement';

export type SectionType =
  | 'intro' | 'verse' | 'preChorus' | 'chorus'
  | 'bridge' | 'drop' | 'solo' | 'outro' | 'unknown';

export interface NodeSignals {
  readonly bpm: Measurement<number>;
  readonly key: Measurement<string>; // e.g. "8A" (Camelot notation)
  readonly energy: Measurement<number>; // 0-1
  readonly loudnessLufs: Measurement<number>;
  readonly guitarPresence: Measurement<number>; // 0-1
  readonly vocalPresence: Measurement<number>; // 0-1
  readonly danceability: Measurement<number>; // 0-1
  readonly sectionType: Measurement<SectionType>;
  readonly embedding: Measurement<Float32Array>;
  readonly genreDistribution: Measurement<Record<string, number>>;
}

export interface ChunkNode {
  readonly id: string;
  readonly songId: string;
  readonly startTimeSec: number;
  readonly endTimeSec: number;
  readonly bars: number;
  readonly signals: NodeSignals;
}
