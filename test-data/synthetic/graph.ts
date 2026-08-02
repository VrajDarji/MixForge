import { ChunkNode, Measurement, TransitionEdge } from '../../src/core';

function m<T>(value: T): Measurement<T> {
  return { value, confidence: 1, detector: 'synthetic', version: '1.0.0' };
}

function chunk(
  id: string,
  songId: string,
  startTimeSec: number,
  bpm: number,
  key: string,
  sectionType: 'intro' | 'verse' | 'chorus' | 'drop' | 'outro',
  energy: number
): ChunkNode {
  return {
    id,
    songId,
    startTimeSec,
    endTimeSec: startTimeSec + 8,
    bars: 4,
    signals: {
      bpm: m(bpm),
      key: m(key),
      energy: m(energy),
      loudnessLufs: m(-14),
      guitarPresence: m(0.3),
      vocalPresence: m(0.7),
      danceability: m(0.6),
      sectionType: m(sectionType),
      embedding: m(new Float32Array([energy, bpm / 200])),
      genreDistribution: m({ edm: 0.6, pop: 0.4 }),
    },
  };
}

function edge(
  from: string,
  to: string,
  bpmDelta: number,
  keyCompatible: boolean,
  beatAlignment: number,
  embeddingSimilarity: number,
  loudnessDelta: number,
  estimatedCrossfadeSec: number
): TransitionEdge {
  return {
    from,
    to,
    signals: {
      bpmDelta: m(bpmDelta),
      keyCompatibility: m(keyCompatible),
      beatAlignment: m(beatAlignment),
      embeddingSimilarity: m(embeddingSimilarity),
      loudnessDelta: m(loudnessDelta),
      estimatedCrossfadeSec: m(estimatedCrossfadeSec),
    },
  };
}

export const synthNodes: readonly ChunkNode[] = [
  chunk('A1', 'songA', 0, 124, '8A', 'intro', 0.3),
  chunk('A2', 'songA', 8, 124, '8A', 'verse', 0.5),
  chunk('A3', 'songA', 16, 101, '3A', 'chorus', 0.8),
  chunk('B1', 'songB', 0, 132, '8B', 'intro', 0.3),
  chunk('B2', 'songB', 8, 126, '9A', 'drop', 0.9),
  chunk('B3', 'songB', 16, 130, '9A', 'outro', 0.3),
];

export const synthEdges: readonly TransitionEdge[] = [
  edge('A1', 'A2', 0, true, 0.95, 0.9, 0.3, 4),   // good
  edge('A2', 'B2', 2, true, 0.85, 0.7, 0.8, 4),   // good
  edge('B2', 'A3', 25, false, 0.3, 0.2, 3.5, 8),  // bad
  edge('A1', 'B1', 8, true, 0.6, 0.5, 1.5, 6),     // mediocre
];
