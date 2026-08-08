import { ChunkNode, TransitionEdge } from '../core';

// JSON-safe mirror of ChunkNode: Float32Array embeddings aren't directly
// JSON-serializable (JSON.stringify turns them into {0: x, 1: y, ...}
// objects, not arrays), so persistence stores plain number[] instead.
export interface SerializedChunkNode extends Omit<ChunkNode, 'signals'> {
  readonly signals: Omit<ChunkNode['signals'], 'embedding'> & {
    readonly embedding: Omit<ChunkNode['signals']['embedding'], 'value'> & { readonly value: readonly number[] };
  };
}

export interface SerializedGraph {
  readonly nodes: readonly SerializedChunkNode[];
  readonly edges: readonly TransitionEdge[]; // already fully JSON-safe — no Float32Array fields
}
