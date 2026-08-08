// Small pure helpers — no domain types, no scoring semantics of their own.

// Nearest-sample lookup into a curve sampled 0-1 over normalized time.
// t is clamped to [0, 1] before rounding to the nearest sample index.
export function sampleEnergyCurve(curve: readonly number[], t: number): number {
  if (curve.length === 0) return 0.5; // no curve data — neutral fallback, consistent with calibrate()'s neutral point
  const clamped = Math.min(Math.max(t, 0), 1);
  const index = Math.round(clamped * (curve.length - 1));
  return curve[index];
}
