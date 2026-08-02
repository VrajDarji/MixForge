import { measurement } from '../lib';
import {
  CalibrationFn,
  ChunkNode,
  HardConstraint,
  MusicGraph,
  MusicSearchProblem,
  PlannerConfig,
  RemixPlan,
  RenderOptions,
  Renderer,
  RenderedAudio,
  SearchResources,
  TransitionEdge,
} from '../types';

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

describe('MusicGraph interface', () => {
  it('is satisfied by a minimal stub object', () => {
    const stub: MusicGraph = {
      nodes: new Map(),
      edges: new Map(),
      getOutgoingEdges: () => [],
      getNode: () => undefined,
    };
    expect(stub.getOutgoingEdges('A1')).toEqual([]);
    expect(stub.getNode('A1')).toBeUndefined();
  });
});

const dummyCalibrate: CalibrationFn = (_m, _toScalar, neutral = 0.5) => neutral;

function fixtureEdge(): TransitionEdge {
  return {
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

describe('PlannerConfig / HardConstraint', () => {
  it('lets a HardConstraint inspect both the edge and the resulting resources', () => {
    const constraint: HardConstraint = {
      name: 'max-duration',
      check: (edge, resources) => resources.elapsedDurationBucket < 300 && edge.to !== '',
    };
    expect(constraint.check(fixtureEdge(), fixtureResources(), dummyCalibrate)).toBe(true);
  });

  it('constructs a well-formed PlannerConfig with weights for every signal', () => {
    const config: PlannerConfig = {
      hardConstraints: [],
      nodeWeights: {
        bpm: 0, key: 0, energy: 1, loudnessLufs: 0, guitarPresence: 1.5,
        vocalPresence: 0.5, danceability: 1, sectionType: 0, embedding: 0, genreDistribution: 0,
      },
      edgeWeights: {
        bpmDelta: 1, keyCompatibility: 1, beatAlignment: 1,
        embeddingSimilarity: 0.5, loudnessDelta: 0.5, estimatedCrossfadeSec: 0,
      },
      pathObjectiveWeights: {
        energyCurveAdherence: 1, diversity: 1, durationAdherence: 1, repetitionPenalty: 1,
      },
      targetDurationSec: 1800,
      targetEnergyCurve: [0.3, 0.6, 0.9, 0.5],
      durationToleranceSec: 30,
    };
    expect(config.nodeWeights.guitarPresence).toBe(1.5);
    expect(config.targetEnergyCurve).toHaveLength(4);
  });
});

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

describe('RemixPlan', () => {
  it('constructs a well-formed plan including diagnostics', () => {
    const plan: RemixPlan = {
      chunkIds: ['A1', 'A2', 'B2'],
      totalScore: 12.4,
      estimatedDurationSec: 24,
      diagnostics: {
        nearFailedConstraints: [{ constraintName: 'max-bpm-jump', atChunkId: 'A2' }],
        prunedCandidateCount: 7,
      },
    };
    expect(plan.chunkIds).toHaveLength(3);
    expect(plan.diagnostics.prunedCandidateCount).toBe(7);
    expect(plan.diagnostics.nearFailedConstraints[0].constraintName).toBe('max-bpm-jump');
  });

  it('allows empty diagnostics for a plan with no near-misses', () => {
    const plan: RemixPlan = {
      chunkIds: ['A1'],
      totalScore: 1,
      estimatedDurationSec: 8,
      diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 },
    };
    expect(plan.diagnostics.nearFailedConstraints).toEqual([]);
  });
});

describe('Renderer interface', () => {
  it('is satisfied by a stub async implementation', async () => {
    const stub: Renderer = {
      render: async (_plan, _graph, _options): Promise<RenderedAudio> => ({
        sampleRate: 44100,
        channels: 2,
        durationSec: 24,
        filePath: '/tmp/out.wav',
      }),
    };

    const plan: RemixPlan = {
      chunkIds: ['A1'],
      totalScore: 1,
      estimatedDurationSec: 24,
      diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 },
    };
    const graph: MusicGraph = { nodes: new Map(), edges: new Map(), getOutgoingEdges: () => [], getNode: () => undefined };
    const options: RenderOptions = { crossfadeCurve: 'equalPower', normalizeLoudnessLufs: -14 };

    const result = await stub.render(plan, graph, options);
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(2);
  });
});
