import { ChunkNode } from '../core';

export interface RetrievalParams {
  readonly bpmWindow: number;
  readonly energyWindow: number;
  readonly annTopK: number;
}

// Stage 1 (cheap): candidates within a BPM window.
export interface TempoIndex {
  queryRange(minBpm: number, maxBpm: number): readonly ChunkNode[];
}

// Stage 4 (expensive, run last on the already-shrunk pool): embedding
// nearest-neighbor lookup. Brute-force in this phase — a real ANN library
// (recall/latency tuning) is explicitly Phase 8 (Optimization) scope per
// docs/implementation.md §12, not required for Phase 5's correctness bar.
export interface AnnIndex {
  queryTopK(embedding: Float32Array, k: number): readonly string[]; // ChunkNode ids
}
