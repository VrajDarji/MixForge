import { MusicSearchProblem } from './searchProblem';
import { ChunkNode } from './nodeSignals';
import { TransitionEdge } from './edgeSignals';
import { SearchResources } from './searchState';
import { PlannerConfig } from './plannerConfig';
import { measurement } from './measurement';

function fixtureNode(id: string): ChunkNode {
  return {
    id,
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
      embedding: measurement(new Float32Array([0.1]), 0.95, 'EmbeddingV1', '1.0.0'),
      genreDistribution: measurement({ pop: 1 }, 0.5, 'GenreClassifierV1', '1.0.0'),
    },
  };
}

function fixtureResources(): SearchResources {
  return {
    elapsedDurationBucket: 0,
    energyBucket: 0,
    currentKeyBucket: '8A',
    currentNodeId: 'A1',
    songDiversityCount: 1,
    recentSectionTypes: [],
    usedChunkIds: new Set(),
    usedSongIds: new Set(),
    history: [],
  };
}

const stubProblem: MusicSearchProblem = {
  getOutgoing: () => [],
  updateResources: (resource) => resource,
  isValid: () => true,
  mergeKey: () => 'k',
  edgeScore: () => 1,
  nodeScore: () => 1,
  pathScore: () => 1,
};

describe('MusicSearchProblem', () => {
  it('is satisfiable by a stub implementation and callable with real domain types', () => {
    const node = fixtureNode('A1');
    const resources = fixtureResources();
    const config = {} as PlannerConfig;
    expect(stubProblem.getOutgoing(node)).toEqual([]);
    expect(stubProblem.updateResources(resources, {} as TransitionEdge)).toBe(resources);
    expect(stubProblem.isValid(resources)).toBe(true);
    expect(stubProblem.nodeScore(node, config)).toBe(1);
  });
});
