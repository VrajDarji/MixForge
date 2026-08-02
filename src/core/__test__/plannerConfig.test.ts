import { CalibrationFn } from '../calibration';
import { HardConstraint, PlannerConfig } from '../plannerConfig';
import { measurement } from '../measurement';
import { TransitionEdge } from '../edgeSignals';
import { SearchResources } from '../searchState';

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
