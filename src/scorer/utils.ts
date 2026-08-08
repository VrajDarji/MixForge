// Small pure helpers — no domain types, no scoring semantics of their own.

// Nearest-sample lookup into a curve sampled 0-1 over normalized time.
// t is clamped to [0, 1] before rounding to the nearest sample index.
export function sampleEnergyCurve(curve: readonly number[], t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  const index = Math.round(clamped * (curve.length - 1));
  return curve[index];
}
