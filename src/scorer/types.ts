// Scorer-only types. No logic — see ./lib.ts.

export interface EdgeEvalResult {
  readonly feasible: boolean;
  readonly qualityScore: number;
}
