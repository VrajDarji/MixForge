// Measurements — ADR-002 / ADR-009
// The graph stores observations, not ground truth. Every value extracted
// from audio carries confidence and provenance.

export interface Measurement<T> {
  readonly value: T;
  /** 0.0 (no confidence) – 1.0 (certain). Never a preference; purely detector reliability. */
  readonly confidence: number;
  /** Which detector produced this, e.g. "KeyDetectorV2". Enables regression testing. */
  readonly detector: string;
  /** Detector version, so graphs can be selectively re-scored when a detector improves. */
  readonly version: string;
}

export function measurement<T>(
  value: T,
  confidence: number,
  detector: string,
  version: string
): Measurement<T> {
  return { value, confidence, detector, version };
}
