import { calibrate } from '../lib';
import { measurement } from '../../core';
import { evaluateEdge } from '../lib';
import { EdgeSignals, PlannerConfig, TransitionEdge } from '../../core';
import { synthEdges } from '../../../test-data/synthetic/graph';
import { evaluateNode } from '../lib';
import { synthNodes } from '../../../test-data/synthetic/graph';
import { evaluatePath } from '../lib';
import { SearchResources } from '../../core';
import { sampleEnergyCurve } from '../utils';

describe('calibrate()', () => {
  it('passes the raw value through unchanged at confidence 1.0', () => {
    const m = measurement(0.8, 1.0, 'test', '1.0.0');
    expect(calibrate(m, (v) => v)).toBeCloseTo(0.8);
  });

  it('fully replaces the raw value with neutral at confidence 0.0', () => {
    const m = measurement(0.8, 0.0, 'test', '1.0.0');
    expect(calibrate(m, (v) => v)).toBeCloseTo(0.5);
  });

  it('lerps proportionally at partial confidence', () => {
    const m = measurement(1.0, 0.5, 'test', '1.0.0');
    // neutral(0.5) + 0.5 * (1.0 - 0.5) = 0.75
    expect(calibrate(m, (v) => v)).toBeCloseTo(0.75);
  });

  it('respects a custom neutral point', () => {
    const m = measurement(0, 0.0, 'test', '1.0.0');
    expect(calibrate(m, (v) => v, 0.2)).toBeCloseTo(0.2);
  });

  it('lerps boolean-derived signals via toScalar', () => {
    const m = measurement(false, 0.1, 'test', '1.0.0');
    // neutral(0.5) + 0.1 * (0 - 0.5) = 0.45
    expect(calibrate(m, (v) => (v ? 1 : 0))).toBeCloseTo(0.45);
  });
});

function baseEdgeWeights(overrides: Partial<Record<keyof EdgeSignals, number>> = {}): Record<keyof EdgeSignals, number> {
  return {
    bpmDelta: 1, keyCompatibility: 1, beatAlignment: 1,
    embeddingSimilarity: 1, loudnessDelta: 1, estimatedCrossfadeSec: 1,
    ...overrides,
  };
}

function baseConfig(overrides: Partial<PlannerConfig> = {}): PlannerConfig {
  return {
    hardConstraints: [],
    nodeWeights: {
      bpm: 0, key: 0, energy: 0, loudnessLufs: 0, guitarPresence: 0,
      vocalPresence: 0, danceability: 0, sectionType: 0, embedding: 0, genreDistribution: 0,
    },
    edgeWeights: baseEdgeWeights(),
    pathObjectiveWeights: { energyCurveAdherence: 1, diversity: 1, durationAdherence: 1, repetitionPenalty: 1 },
    targetDurationSec: 1800,
    targetEnergyCurve: [0.3, 0.6, 0.9, 0.5],
    durationToleranceSec: 30,
    ...overrides,
  };
}

function byPair(from: string, to: string): TransitionEdge {
  return synthEdges.find((e) => e.from === from && e.to === to)!;
}

function edgeWithKeyCompat(confidence: number): TransitionEdge {
  return {
    from: 'X1',
    to: 'X2',
    signals: {
      bpmDelta: measurement(0, 1, 'test', '1.0.0'),
      keyCompatibility: measurement(false, confidence, 'test', '1.0.0'),
      beatAlignment: measurement(1, 1, 'test', '1.0.0'),
      embeddingSimilarity: measurement(1, 1, 'test', '1.0.0'),
      loudnessDelta: measurement(0, 1, 'test', '1.0.0'),
      estimatedCrossfadeSec: measurement(4, 1, 'test', '1.0.0'),
    },
  };
}

describe('evaluateEdge()', () => {
  it('marks the known-bad B2->A3 fixture edge infeasible, not merely low-scoring', () => {
    const result = evaluateEdge(byPair('B2', 'A3'), baseConfig());
    expect(result.feasible).toBe(false);
    expect(result.qualityScore).toBe(0);
  });

  it('marks the known-good A1->A2 fixture edge feasible with a high quality score', () => {
    const result = evaluateEdge(byPair('A1', 'A2'), baseConfig());
    expect(result.feasible).toBe(true);
    expect(result.qualityScore).toBeGreaterThan(0.9);
  });

  it('ranks the known-good A1->A2 edge above the mediocre A1->B1 edge', () => {
    const good = evaluateEdge(byPair('A1', 'A2'), baseConfig());
    const mediocre = evaluateEdge(byPair('A1', 'B1'), baseConfig());
    expect(good.feasible).toBe(true);
    expect(mediocre.feasible).toBe(true);
    expect(good.qualityScore).toBeGreaterThan(mediocre.qualityScore);
  });

  it('lets a low-confidence bad keyCompatibility reading pass feasibility', () => {
    const result = evaluateEdge(edgeWithKeyCompat(0.1), baseConfig());
    expect(result.feasible).toBe(true);
  });

  it('lets the same bad keyCompatibility reading fail feasibility at high confidence', () => {
    const result = evaluateEdge(edgeWithKeyCompat(0.95), baseConfig());
    expect(result.feasible).toBe(false);
    expect(result.qualityScore).toBe(0);
  });

  it('changes qualityScore when edgeWeights change, without changing feasibility', () => {
    const defaultWeights = evaluateEdge(byPair('A1', 'A2'), baseConfig());
    const harsherEmbedding = evaluateEdge(
      byPair('A1', 'A2'),
      baseConfig({ edgeWeights: baseEdgeWeights({ embeddingSimilarity: 5 }) })
    );
    expect(defaultWeights.feasible).toBe(true);
    expect(harsherEmbedding.feasible).toBe(true);
    expect(harsherEmbedding.qualityScore).toBeLessThan(defaultWeights.qualityScore);
  });

  it('excludes a zero-weighted dimension from the geometric mean root, rather than counting it as a perfect score against a fixed root', () => {
    const excludedEmbedding = evaluateEdge(
      byPair('A1', 'A2'),
      baseConfig({ edgeWeights: baseEdgeWeights({ embeddingSimilarity: 0 }) })
    );
    // A1->A2 calibrated (confidence=1, so raw passes through unchanged):
    // bpmDelta=1, keyCompatibility=1, beatAlignment=0.95, loudnessDelta=0.95.
    // embeddingSimilarity is excluded (weight 0), so the correct root is
    // 1/totalWeight == 1/4 (the four remaining dimensions), not the old
    // fixed 1/5 that counted embeddingSimilarity's v^0=1 term toward the mean.
    const expected = Math.pow(1 * 1 * 0.95 * 0.95, 1 / 4);
    expect(excludedEmbedding.qualityScore).toBeCloseTo(expected);
    // Sanity: this must differ from what the old buggy fixed-root-of-5 formula
    // would have produced for the same weights.
    const oldBuggyValue = Math.pow(1 * 1 * 0.95 * 1 * 0.95, 1 / 5);
    expect(excludedEmbedding.qualityScore).not.toBeCloseTo(oldBuggyValue, 3);
  });

  it('is scale-invariant: uniformly scaling all edgeWeights does not change qualityScore', () => {
    const base = evaluateEdge(byPair('A1', 'A2'), baseConfig());
    const scaled = evaluateEdge(
      byPair('A1', 'A2'),
      baseConfig({
        edgeWeights: baseEdgeWeights({
          bpmDelta: 3, keyCompatibility: 3, beatAlignment: 3, embeddingSimilarity: 3, loudnessDelta: 3,
        }),
      })
    );
    expect(scaled.qualityScore).toBeCloseTo(base.qualityScore);
  });
});

function nodeWeights(overrides: Partial<Record<string, number>> = {}) {
  return {
    bpm: 0, key: 0, energy: 0, loudnessLufs: 0, guitarPresence: 0,
    vocalPresence: 0, danceability: 0, sectionType: 0, embedding: 0, genreDistribution: 0,
    ...overrides,
  };
}

describe('evaluateNode()', () => {
  const a2 = synthNodes.find((n) => n.id === 'A2')!; // energy 0.5, confidence 1

  it('produces different scores for the same node under two different configs', () => {
    const lowWeight = baseConfig({ nodeWeights: nodeWeights({ energy: 1 }) });
    const highWeight = baseConfig({ nodeWeights: nodeWeights({ energy: 2 }) });
    const scoreLow = evaluateNode(a2, lowWeight);
    const scoreHigh = evaluateNode(a2, highWeight);
    expect(scoreLow).toBeCloseTo(0.5); // calibrate(energy=0.5, confidence=1) * weight 1
    expect(scoreHigh).toBeCloseTo(1.0);
    expect(scoreLow).not.toBe(scoreHigh);
  });

  it('returns 0 for an all-zero-weight config', () => {
    const config = baseConfig({ nodeWeights: nodeWeights() });
    expect(evaluateNode(a2, config)).toBe(0);
  });

  it('contributes 0, not NaN, for a nonzero weight on a non-scalar signal', () => {
    const config = baseConfig({ nodeWeights: nodeWeights({ sectionType: 5, embedding: 3 }) });
    const score = evaluateNode(a2, config);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(0);
  });

  it('sums contributions across multiple weighted scalar signals', () => {
    const config = baseConfig({ nodeWeights: nodeWeights({ energy: 1, danceability: 1 }) });
    // A2: energy=0.5, danceability=0.6, both confidence 1 -> calibrated == raw
    expect(evaluateNode(a2, config)).toBeCloseTo(0.5 + 0.6);
  });

  it('normalizes bpm and loudnessLufs to a bounded [0,1] range before scoring', () => {
    const bpmConfig = baseConfig({ nodeWeights: nodeWeights({ bpm: 1 }) });
    const loudnessConfig = baseConfig({ nodeWeights: nodeWeights({ loudnessLufs: 1 }) });
    // A2 fixture: bpm=124, loudnessLufs=-14, confidence=1 (calibrate is identity at confidence 1)
    expect(evaluateNode(a2, bpmConfig)).toBeCloseTo(124 / 200);
    expect(evaluateNode(a2, loudnessConfig)).toBeCloseTo((-14 + 30) / 30);
    expect(evaluateNode(a2, bpmConfig)).toBeLessThanOrEqual(1);
    expect(evaluateNode(a2, loudnessConfig)).toBeLessThanOrEqual(1);
  });
});

function baseResources(overrides: Partial<SearchResources> = {}): SearchResources {
  return {
    elapsedDurationBucket: 900,
    energyBucket: 0.5,
    currentKeyBucket: '8A',
    currentNodeId: 'A2',
    songDiversityCount: 2,
    recentSectionTypes: [],
    usedChunkIds: new Set(['A1', 'A2']),
    usedSongIds: new Set(['songA']),
    history: ['A1', 'A2', 'B2', 'A3'],
    ...overrides,
  };
}

describe('sampleEnergyCurve()', () => {
  it('samples the nearest point on the curve for a given normalized time', () => {
    const curve = [0.2, 0.5, 0.8];
    expect(sampleEnergyCurve(curve, 0)).toBe(0.2);
    expect(sampleEnergyCurve(curve, 0.5)).toBe(0.5);
    expect(sampleEnergyCurve(curve, 1)).toBe(0.8);
  });

  it('clamps out-of-range t to [0, 1]', () => {
    const curve = [0.2, 0.5, 0.8];
    expect(sampleEnergyCurve(curve, -1)).toBe(0.2);
    expect(sampleEnergyCurve(curve, 2)).toBe(0.8);
  });
});

describe('sampleEnergyCurve() edge cases', () => {
  it('returns a neutral fallback for an empty curve instead of NaN', () => {
    expect(sampleEnergyCurve([], 0.5)).toBe(0.5);
    expect(Number.isNaN(sampleEnergyCurve([], 0.5))).toBe(false);
  });
});

describe('evaluatePath()', () => {
  it('scores full duration adherence as 1 when elapsed matches target exactly', () => {
    const resources = baseResources({ elapsedDurationBucket: 1800 });
    const config = baseConfig({
      targetDurationSec: 1800,
      durationToleranceSec: 30,
      targetEnergyCurve: [0.5],
      pathObjectiveWeights: { durationAdherence: 1, energyCurveAdherence: 0, diversity: 0, repetitionPenalty: 0 },
    });
    expect(evaluatePath(resources, config)).toBeCloseTo(1);
  });

  it('combines duration, energy, and diversity terms per pathObjectiveWeights', () => {
    const resources = baseResources({
      elapsedDurationBucket: 900,
      energyBucket: 0.5,
      songDiversityCount: 2,
      history: ['A1', 'A2', 'B2', 'A3'],
    });
    const config = baseConfig({
      targetDurationSec: 1800,
      durationToleranceSec: 30,
      targetEnergyCurve: [0.2, 0.5, 0.8],
      pathObjectiveWeights: { durationAdherence: 1, energyCurveAdherence: 1, diversity: 1, repetitionPenalty: 1 },
    });
    // duration: elapsed(900) is 900s off target(1800), clamped -> durationScore = 0
    // energy: t=900/1800=0.5 -> curve sample = 0.5; energyBucket=0.5 -> energyScore = 1
    // diversity: 2 / 4 = 0.5
    expect(evaluatePath(resources, config)).toBeCloseTo(0 + 1 + 0.5);
  });

  it('produces two different scores for two different pathObjectiveWeights, same resources', () => {
    const resources = baseResources();
    const configA = baseConfig({
      targetDurationSec: 1800,
      durationToleranceSec: 900,
      targetEnergyCurve: [0.5],
      pathObjectiveWeights: { durationAdherence: 1, energyCurveAdherence: 0, diversity: 0, repetitionPenalty: 0 },
    });
    const configB = baseConfig({
      targetDurationSec: 1800,
      durationToleranceSec: 900,
      targetEnergyCurve: [0.5],
      pathObjectiveWeights: { durationAdherence: 0, energyCurveAdherence: 0, diversity: 1, repetitionPenalty: 0 },
    });
    expect(evaluatePath(resources, configA)).not.toBeCloseTo(evaluatePath(resources, configB));
  });
});

describe('evaluatePath() edge cases', () => {
  it('does not produce NaN when durationToleranceSec is 0 and elapsed matches target exactly', () => {
    const resources = baseResources({ elapsedDurationBucket: 1800 });
    const config = baseConfig({ targetDurationSec: 1800, durationToleranceSec: 0, targetEnergyCurve: [0.5] });
    expect(Number.isNaN(evaluatePath(resources, config))).toBe(false);
  });

  it('does not produce NaN when durationToleranceSec is 0 and elapsed misses target', () => {
    const resources = baseResources({ elapsedDurationBucket: 900 });
    const config = baseConfig({ targetDurationSec: 1800, durationToleranceSec: 0, targetEnergyCurve: [0.5] });
    expect(Number.isNaN(evaluatePath(resources, config))).toBe(false);
  });
});
