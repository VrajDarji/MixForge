import { measurement } from './measurement';
import { ChunkNode } from './nodeSignals';
import { TransitionEdge } from './edgeSignals';

describe('signal types', () => {
  it('constructs a well-formed ChunkNode', () => {
    const node: ChunkNode = {
      id: 'A1',
      songId: 'songA',
      startTimeSec: 0,
      endTimeSec: 8,
      bars: 4,
      signals: {
        bpm: measurement(120, 0.9, 'BpmDetectorV1', '1.0.0'),
        key: measurement('8A', 0.8, 'KeyDetectorV2', '2.0.0'),
        energy: measurement(0.7, 0.85, 'EnergyDetectorV1', '1.0.0'),
        loudnessLufs: measurement(-14, 1.0, 'LoudnessDetectorV1', '1.0.0'),
        guitarPresence: measurement(0.1, 0.6, 'InstrumentClassifierV1', '1.0.0'),
        vocalPresence: measurement(0.9, 0.6, 'InstrumentClassifierV1', '1.0.0'),
        danceability: measurement(0.8, 0.7, 'DanceabilityV1', '1.0.0'),
        sectionType: measurement('verse', 0.75, 'SectionClassifierV1', '1.0.0'),
        embedding: measurement(new Float32Array([0.1, 0.2]), 0.95, 'EmbeddingV1', '1.0.0'),
        genreDistribution: measurement({ pop: 0.6, rock: 0.4 }, 0.5, 'GenreClassifierV1', '1.0.0'),
      },
    };
    expect(node.id).toBe('A1');
    expect(node.signals.bpm.value).toBe(120);
    expect(node.signals.sectionType.value).toBe('verse');
  });

  it('constructs a well-formed TransitionEdge', () => {
    const edge: TransitionEdge = {
      from: 'A1',
      to: 'A2',
      signals: {
        bpmDelta: measurement(0, 0.9, 'BpmDetectorV1', '1.0.0'),
        keyCompatibility: measurement(true, 0.8, 'KeyCompatV1', '1.0.0'),
        beatAlignment: measurement(0.95, 0.85, 'BeatAlignV1', '1.0.0'),
        embeddingSimilarity: measurement(0.9, 0.95, 'EmbeddingV1', '1.0.0'),
        loudnessDelta: measurement(0.5, 1.0, 'LoudnessDetectorV1', '1.0.0'),
        estimatedCrossfadeSec: measurement(4, 0.7, 'CrossfadeEstimatorV1', '1.0.0'),
      },
    };
    expect(edge.from).toBe('A1');
    expect(edge.to).toBe('A2');
    expect(edge.signals.keyCompatibility.value).toBe(true);
  });
});
