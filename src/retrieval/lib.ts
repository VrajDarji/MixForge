import { ChunkNode, EdgeSignals, measurement, TransitionEdge } from '../core';
import { AnnIndex, RetrievalParams, TempoIndex } from './types';
import { areCamelotKeysCompatible, cosineSimilarity } from './utils';

export function buildTempoIndex(nodes: readonly ChunkNode[]): TempoIndex {
  return {
    queryRange: (minBpm, maxBpm) => nodes.filter((n) => n.signals.bpm.value >= minBpm && n.signals.bpm.value <= maxBpm),
  };
}

// Brute-force cosine-similarity top-K — see types.ts's note on why this
// isn't a real ANN library in this phase.
export function buildAnnIndex(nodes: readonly ChunkNode[]): AnnIndex {
  return {
    queryTopK: (embedding, k) =>
      [...nodes]
        .sort((a, b) => cosineSimilarity(b.signals.embedding.value, embedding) - cosineSimilarity(a.signals.embedding.value, embedding))
        .slice(0, k)
        .map((n) => n.id),
  };
}

// ADR-003: layered funnel of increasing cost, each stage shrinking the pool
// before the next (more expensive) one runs.
export function retrieveCandidates(
  from: ChunkNode,
  indices: { tempoIndex: TempoIndex; ann: AnnIndex },
  params: RetrievalParams
): readonly ChunkNode[] {
  let pool = indices.tempoIndex.queryRange(from.signals.bpm.value - params.bpmWindow, from.signals.bpm.value + params.bpmWindow); // Stage 1: cheap
  pool = pool.filter((c) => c.id !== from.id);
  pool = pool.filter((c) => areCamelotKeysCompatible(from.signals.key.value, c.signals.key.value)); // Stage 2: cheap
  pool = pool.filter((c) => Math.abs(c.signals.energy.value - from.signals.energy.value) <= params.energyWindow); // Stage 3: cheap

  const annIds = new Set(indices.ann.queryTopK(from.signals.embedding.value, params.annTopK)); // Stage 4: expensive, on the shrunk pool only
  pool = pool.filter((c) => annIds.has(c.id));
  return pool;
}

// Derived-measurement confidence combines the two source measurements —
// min(from.confidence, to.confidence), per docs/implementation.md §9.3.
function combinedConfidence(from: number, to: number): number {
  return Math.min(from, to);
}

export function computeEdgeSignals(from: ChunkNode, to: ChunkNode): EdgeSignals {
  const bpmConfidence = combinedConfidence(from.signals.bpm.confidence, to.signals.bpm.confidence);
  const keyConfidence = combinedConfidence(from.signals.key.confidence, to.signals.key.confidence);
  const embeddingConfidence = combinedConfidence(from.signals.embedding.confidence, to.signals.embedding.confidence);
  const loudnessConfidence = combinedConfidence(from.signals.loudnessLufs.confidence, to.signals.loudnessLufs.confidence);

  const bpmDeltaValue = to.signals.bpm.value - from.signals.bpm.value;
  // Beat-phase alignment isn't available without persisting per-chunk beat
  // grids from analysis (out of scope for this phase) — approximated from
  // BPM closeness, with a deliberately low confidence (0.4) so the harsh
  // non-compensatory edge scoring (ADR-005/ADR-009) doesn't over-trust it.
  const beatAlignmentValue = 1 - Math.min(Math.abs(bpmDeltaValue) / 20, 1);
  const avgBpm = (from.signals.bpm.value + to.signals.bpm.value) / 2;

  return {
    bpmDelta: measurement(bpmDeltaValue, bpmConfidence, 'RetrievalBpmDelta', '1.0.0'),
    keyCompatibility: measurement(
      areCamelotKeysCompatible(from.signals.key.value, to.signals.key.value),
      keyConfidence,
      'RetrievalCamelotCompatibility',
      '1.0.0'
    ),
    beatAlignment: measurement(beatAlignmentValue, 0.4, 'RetrievalBeatAlignmentProxy', '1.0.0'),
    embeddingSimilarity: measurement(
      (cosineSimilarity(from.signals.embedding.value, to.signals.embedding.value) + 1) / 2,
      embeddingConfidence,
      'RetrievalCosineSimilarity',
      '1.0.0'
    ),
    loudnessDelta: measurement(
      to.signals.loudnessLufs.value - from.signals.loudnessLufs.value,
      loudnessConfidence,
      'RetrievalLoudnessDelta',
      '1.0.0'
    ),
    estimatedCrossfadeSec: measurement((60 / avgBpm) * 8, bpmConfidence, 'RetrievalCrossfadeEstimate', '1.0.0'),
  };
}

export function buildTransitionEdges(nodes: readonly ChunkNode[], params: RetrievalParams): readonly TransitionEdge[] {
  const tempoIndex = buildTempoIndex(nodes);
  const ann = buildAnnIndex(nodes);
  const edges: TransitionEdge[] = [];

  for (const from of nodes) {
    const candidates = retrieveCandidates(from, { tempoIndex, ann }, params);
    for (const to of candidates) {
      edges.push({ from: from.id, to: to.id, signals: computeEdgeSignals(from, to) });
    }
  }
  return edges;
}
