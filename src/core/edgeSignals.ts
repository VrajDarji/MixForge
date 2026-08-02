// Edge signals — local transition quality between two chunks (ADR-005)
// Derived measurements: compatibility scores propagate confidence from
// the two underlying node measurements they're computed from.

import { Measurement } from './measurement';

export interface EdgeSignals {
  readonly bpmDelta: Measurement<number>;
  readonly keyCompatibility: Measurement<boolean>; // Camelot-wheel compatible or not
  readonly beatAlignment: Measurement<number>; // 0-1, phase alignment quality
  readonly embeddingSimilarity: Measurement<number>; // cosine similarity, 0-1
  readonly loudnessDelta: Measurement<number>;
  readonly estimatedCrossfadeSec: Measurement<number>;
}

export interface TransitionEdge {
  readonly from: string; // ChunkNode id
  readonly to: string; // ChunkNode id
  readonly signals: EdgeSignals;
}
