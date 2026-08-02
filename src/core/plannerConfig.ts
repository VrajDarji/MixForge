// PlannerConfig — dynamic, per-request preferences (ADR-002, ADR-004, ADR-005)
// This is the ONLY thing AI is allowed to configure. It never touches the
// Graph, the Planner's algorithm, or the Renderer.

import { NodeSignals } from './nodeSignals';
import { EdgeSignals } from './edgeSignals';
import { TransitionEdge } from './edgeSignals';
import { SearchResources } from './searchState';
import { CalibrationFn } from './calibration';

export interface HardConstraint {
  readonly name: string;
  /**
   * Receives the candidate edge, the resources the search state would have
   * *after* traversing it, and the calibration function — sufficient to
   * express edge-only constraints (invalid harmonic transition) as well as
   * resource-dependent constraints (duration tolerance, repetition) in a
   * single mechanism.
   */
  readonly check: (edge: TransitionEdge, resources: SearchResources, calibrate: CalibrationFn) => boolean;
}

export interface PlannerConfig {
  readonly hardConstraints: readonly HardConstraint[];
  /**
   * Weight per NodeSignals key. Most signals are scalar (or trivially reducible
   * to one) and can take any meaningful weight. `embedding` (Measurement<Float32Array>)
   * and `genreDistribution` (Measurement<Record<string, number>>) are NOT scalar-valued —
   * they require an explicit `toScalar` function in the future scorer implementation
   * before a weight can be meaningfully applied. Until that scorer exists, `0` is the
   * only safe default for these two keys.
   */
  readonly nodeWeights: Readonly<Record<keyof NodeSignals, number>>;
  readonly edgeWeights: Readonly<Record<keyof EdgeSignals, number>>;
  readonly pathObjectiveWeights: {
    readonly energyCurveAdherence: number;
    readonly diversity: number;
    readonly durationAdherence: number;
    readonly repetitionPenalty: number;
  };
  readonly targetDurationSec: number;
  readonly targetEnergyCurve: readonly number[]; // sampled 0-1 over normalized time
  readonly durationToleranceSec: number;
}
