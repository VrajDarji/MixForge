// Calibration — ADR-009
// Confidence-aware adjustment, independent of PlannerConfig. Turns a raw
// Measurement into a calibrated scalar signal ready for scoring.
// Interface only — the real implementation belongs to Phase 3 (src/scorer/).

import { Measurement } from './measurement';

export interface CalibrationFn {
  /**
   * Pulls low-confidence values toward a neutral point rather than letting
   * them dominate downstream harsh (non-compensatory) composition.
   */
  <T>(m: Measurement<T>, toScalar: (value: T) => number, neutral?: number): number;
}
