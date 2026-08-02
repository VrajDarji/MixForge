// Output of planning — consumed by the Renderer.
// Named RemixPlan (not Path) and carries planner diagnostics from day one:
// retrofitting diagnostics into a planner that doesn't already thread them
// through is far more painful than carrying an empty/optional field.

export interface PlannerDiagnostics {
  readonly nearFailedConstraints: readonly { readonly constraintName: string; readonly atChunkId: string }[];
  readonly prunedCandidateCount: number;
}

export interface RemixPlan {
  readonly chunkIds: readonly string[];
  readonly totalScore: number;
  readonly estimatedDurationSec: number;
  readonly diagnostics: PlannerDiagnostics;
}
