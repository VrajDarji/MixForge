import { CalibrationFn } from '../core';

// ADR-009: pulls low-confidence values toward neutral before harsh
// non-compensatory composition, rather than letting one noisy detector
// dominate. confidence 1.0 -> raw passes through; confidence 0.0 -> raw is
// fully replaced by neutral.
export const calibrate: CalibrationFn = (m, toScalar, neutral = 0.5) => {
  const raw = toScalar(m.value);
  return neutral + m.confidence * (raw - neutral);
};
