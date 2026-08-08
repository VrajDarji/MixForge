import { calibrate } from '../lib';
import { measurement } from '../../core';
import { evaluateEdge } from '../lib';
import { EdgeSignals, PlannerConfig, TransitionEdge } from '../../core';
import { synthEdges } from '../../../test-data/synthetic/graph';
import { evaluateNode } from '../lib';
import { synthNodes } from '../../../test-data/synthetic/graph';

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
});
