import { CalibrationFn } from '../core';
import { EdgeSignals, PlannerConfig, TransitionEdge } from '../core';
import { EdgeEvalResult } from './types';
import { ChunkNode, Measurement, NodeSignals } from '../core';
import { SearchResources } from '../core';
import { sampleEnergyCurve } from './utils';

// ADR-009: pulls low-confidence values toward neutral before harsh
// non-compensatory composition, rather than letting one noisy detector
// dominate. confidence 1.0 -> raw passes through; confidence 0.0 -> raw is
// fully replaced by neutral.
export const calibrate: CalibrationFn = (m, toScalar, neutral = 0.5) => {
  const raw = toScalar(m.value);
  return neutral + m.confidence * (raw - neutral);
};

// ADR-005 feasibility stage: below this per-dimension calibrated floor, a
// transition is rejected outright, not merely scored low. This is what
// keeps a catastrophic transition from ever reaching the compensatory path
// score (design.md §11's edge score is intentionally non-compensatory).
const MIN_ACCEPTABLE = 0.3;

export function evaluateEdge(edge: TransitionEdge, config: PlannerConfig): EdgeEvalResult {
  const calibrated: Record<keyof Omit<EdgeSignals, 'estimatedCrossfadeSec'>, number> = {
    bpmDelta: calibrate(edge.signals.bpmDelta, (v) => 1 - Math.min(Math.abs(v) / 20, 1)),
    keyCompatibility: calibrate(edge.signals.keyCompatibility, (v) => (v ? 1 : 0)),
    beatAlignment: calibrate(edge.signals.beatAlignment, (v) => v),
    embeddingSimilarity: calibrate(edge.signals.embeddingSimilarity, (v) => v),
    loudnessDelta: calibrate(edge.signals.loudnessDelta, (v) => 1 - Math.min(Math.abs(v) / 6, 1)),
  };

  const feasible = Object.values(calibrated).every((v) => v >= MIN_ACCEPTABLE);
  if (!feasible) return { feasible: false, qualityScore: 0 };

  // Quality ranking among survivors only: harsh geometric mean, so a
  // weak-but-still-feasible dimension drags the score down without being
  // an outright rejection (ADR-005 stage 2).
  const weighted = Object.entries(calibrated).map(([key, v]) =>
    Math.pow(v, config.edgeWeights[key as keyof EdgeSignals] ?? 1)
  );
  const product = weighted.reduce((a, b) => a * b, 1);
  // Root by total weight, not dimension count: a weight of 0 must truly
  // exclude a dimension (rather than counting its v^0=1 term against a
  // fixed root, which would inflate the score), and uniformly scaling all
  // weights must be a no-op.
  const totalWeight = Object.entries(calibrated).reduce(
    (sum, [key]) => sum + (config.edgeWeights[key as keyof EdgeSignals] ?? 1),
    0
  );
  const qualityScore = totalWeight > 0 ? Math.pow(product, 1 / totalWeight) : 1;
  return { feasible: true, qualityScore };
}

// Only signals with a real linear 0-1-ish numeric scale are scored here
// (ADR-004). key/sectionType/embedding/genreDistribution aren't linearly
// scalar; a nonzero nodeWeight on one of them contributes 0, never NaN —
// see docs/superpowers/plans/2026-08-08-phase3-scoring-engine.md's Global
// Constraints for why this deviates from implementation.md §7.3's literal
// snippet. bpm (~60-200) and loudnessLufs (~-30..0) are NOT naturally 0-1,
// so they are explicitly normalized to [0,1] here (rather than passed
// through raw) to keep calibrate()'s neutral=0.5 lerp meaningful and to
// keep node weights comparable across signals.
const NODE_TO_SCALAR: Partial<Record<keyof NodeSignals, (value: number) => number>> = {
  bpm: (v) => Math.min(Math.max(v / 200, 0), 1),
  energy: (v) => v,
  loudnessLufs: (v) => Math.min(Math.max((v + 30) / 30, 0), 1),
  guitarPresence: (v) => v,
  vocalPresence: (v) => v,
  danceability: (v) => v,
};

export function evaluateNode(node: ChunkNode, config: PlannerConfig): number {
  let score = 0;
  for (const [key, weight] of Object.entries(config.nodeWeights) as [keyof NodeSignals, number][]) {
    if (weight === 0) continue;
    const toScalar = NODE_TO_SCALAR[key];
    if (!toScalar) continue;
    score += weight * calibrate(node.signals[key] as Measurement<number>, toScalar);
  }
  return score;
}

export function evaluatePath(resources: SearchResources, config: PlannerConfig): number {
  const durationDelta = Math.abs(resources.elapsedDurationBucket - config.targetDurationSec);
  // durationToleranceSec === 0 would otherwise divide by zero (and 0/0 -> NaN
  // when durationDelta is also 0); an exact match still scores 1, anything
  // else scores 0 since there's no tolerance window to fall inside of.
  const durationScore = config.durationToleranceSec > 0
    ? 1 - Math.min(durationDelta / config.durationToleranceSec, 1)
    : (durationDelta === 0 ? 1 : 0);

  const targetEnergy = sampleEnergyCurve(
    config.targetEnergyCurve,
    resources.elapsedDurationBucket / config.targetDurationSec
  );
  const energyScore = 1 - Math.abs(resources.energyBucket - targetEnergy);
  const diversityScore = resources.songDiversityCount / Math.max(resources.history.length, 1);

  const w = config.pathObjectiveWeights;
  return (
    w.durationAdherence * durationScore +
    w.energyCurveAdherence * energyScore +
    w.diversity * diversityScore
  );
  // repetitionPenalty is applied by the planner (Phase 4) from
  // usedChunkIds/usedSongIds — out of scope here, per implementation.md §7.4.
}
