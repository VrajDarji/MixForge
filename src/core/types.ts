// Type declarations for the core domain model. No logic lives here — see
// ./lib.ts for the two data-shaping functions (measurement(), mergeKey()).

// ============================================================================
// Measurements — ADR-002 / ADR-009
// The graph stores observations, not ground truth. Every value extracted
// from audio carries confidence and provenance.
// ============================================================================

export interface Measurement<T> {
  readonly value: T;
  /** 0.0 (no confidence) – 1.0 (certain). Never a preference; purely detector reliability. */
  readonly confidence: number;
  /** Which detector produced this, e.g. "KeyDetectorV2". Enables regression testing. */
  readonly detector: string;
  /** Detector version, so graphs can be selectively re-scored when a detector improves. */
  readonly version: string;
}

// ============================================================================
// Node signals — intrinsic, per-chunk properties (ADR-004)
// ============================================================================

export type SectionType =
  | 'intro' | 'verse' | 'preChorus' | 'chorus'
  | 'bridge' | 'drop' | 'solo' | 'outro' | 'unknown';

export interface NodeSignals {
  readonly bpm: Measurement<number>;
  readonly key: Measurement<string>; // e.g. "8A" (Camelot notation)
  readonly energy: Measurement<number>; // 0-1
  readonly loudnessLufs: Measurement<number>;
  readonly guitarPresence: Measurement<number>; // 0-1
  readonly vocalPresence: Measurement<number>; // 0-1
  readonly danceability: Measurement<number>; // 0-1
  readonly sectionType: Measurement<SectionType>;
  readonly embedding: Measurement<Float32Array>;
  readonly genreDistribution: Measurement<Record<string, number>>;
}

export interface ChunkNode {
  readonly id: string;
  readonly songId: string;
  readonly startTimeSec: number;
  readonly endTimeSec: number;
  readonly bars: number;
  readonly signals: NodeSignals;
}

// ============================================================================
// Edge signals — local transition quality between two chunks (ADR-005)
// Derived measurements: compatibility scores propagate confidence from
// the two underlying node measurements they're computed from.
// ============================================================================

export interface EdgeSignals {
  readonly bpmDelta: Measurement<number>;
  readonly keyCompatibility: Measurement<boolean>; // Camelot-wheel compatible or not
  readonly beatAlignment: Measurement<number>; // 0-1, phase alignment quality
  readonly embeddingSimilarity: Measurement<number>; // cosine similarity, 0-1
  readonly loudnessDelta: Measurement<number>;
  readonly estimatedCrossfadeSec: Measurement<number>;
}

export interface TransitionEdge {
  readonly from: string; // ChunkNode id
  readonly to: string; // ChunkNode id
  readonly signals: EdgeSignals;
}

// ============================================================================
// Graph — static, immutable, offline-built (ADR-001, ADR-002)
// Interface only. The in-memory / persisted implementation lives in
// src/graph/ (Phase 2) and must satisfy this contract exactly.
// ============================================================================

export interface MusicGraph {
  readonly nodes: ReadonlyMap<string, ChunkNode>;
  readonly edges: ReadonlyMap<string, readonly TransitionEdge[]>; // keyed by `from` node id
  getOutgoingEdges(nodeId: string): readonly TransitionEdge[];
  getNode(nodeId: string): ChunkNode | undefined;
}

// ============================================================================
// Calibration — ADR-009
// Confidence-aware adjustment, independent of PlannerConfig. Turns a raw
// Measurement into a calibrated scalar signal ready for scoring.
// Interface only — the real implementation belongs to Phase 3 (src/scorer/).
// ============================================================================

export interface CalibrationFn {
  /**
   * Pulls low-confidence values toward a neutral point rather than letting
   * them dominate downstream harsh (non-compensatory) composition.
   */
  <T>(m: Measurement<T>, toScalar: (value: T) => number, neutral?: number): number;
}

// ============================================================================
// PlannerConfig — dynamic, per-request preferences (ADR-002, ADR-004, ADR-005)
// This is the ONLY thing AI is allowed to configure. It never touches the
// Graph, the Planner's algorithm, or the Renderer.
// ============================================================================

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

// ============================================================================
// Search state / resources — ADR-007
// Class A (exact merge), Class B (approximate/compressed, merge-safe),
// Class C (historical, never part of mergeKey).
// ============================================================================

export interface SearchResources {
  // --- Class A: exact, safe to merge on directly ---
  readonly elapsedDurationBucket: number;
  readonly energyBucket: number;
  readonly currentKeyBucket: string;
  /** Class A per ADR-007 ("current node" is listed as an exact resource in design.md §14). */
  readonly currentNodeId: string;

  // --- Class B: approximate/compressed summaries, exist to make merging feasible ---
  readonly songDiversityCount: number;
  readonly recentSectionTypes: readonly SectionType[]; // last N only

  // --- Class C: historical, NEVER included in mergeKey ---
  readonly usedChunkIds: ReadonlySet<string>;
  readonly usedSongIds: ReadonlySet<string>;
  readonly history: readonly string[]; // full chunk id sequence, for rendering + penalties
}

export interface SearchState {
  // currentNodeId lives on `resources` (it's Class A per ADR-007) — do not
  // duplicate it here; reference `resources.currentNodeId` instead.
  readonly accumulatedScore: number;
  readonly resources: SearchResources;
}

// ============================================================================
// Generic planner interface — ADR-006
// Zero knowledge of audio. TNode/TResource/TEdge are supplied by MixForge;
// this interface must be satisfiable by an entirely different domain too.
// ============================================================================

export interface SearchProblem<TNode, TResource, TEdge> {
  getOutgoing(node: TNode): readonly TEdge[];
  updateResources(resource: TResource, edge: TEdge): TResource;
  isValid(resource: TResource): boolean;
  /**
   * Must preserve the ADR-007 Class A/B-only merge invariant. For the concrete
   * `MusicSearchProblem` instantiation, this MUST delegate to the standalone
   * `mergeKey()` function exported from `./lib` — do not reimplement key
   * construction here, or Class C fields could silently leak back in.
   */
  mergeKey(resource: TResource): string;

  /** Non-compensatory (ADR-005): implementers should use product/geomean/min-style composition. */
  edgeScore(edge: TEdge, config: PlannerConfig): number;
  /** Intrinsic content score (ADR-004). */
  nodeScore(node: TNode, config: PlannerConfig): number;
  /** Compensatory/additive (ADR-005): energy curve, diversity, duration, repetition. */
  pathScore(resource: TResource, config: PlannerConfig): number;
}

export type MusicSearchProblem = SearchProblem<ChunkNode, SearchResources, TransitionEdge>;

// ============================================================================
// Output of planning — consumed by the Renderer.
// Named RemixPlan (not Path) and carries planner diagnostics from day one:
// retrofitting diagnostics into a planner that doesn't already thread them
// through is far more painful than carrying an empty/optional field.
// ============================================================================

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

// ============================================================================
// Renderer — deterministic execution, no scoring logic.
// Interface only. The real implementation lives in src/renderer/ (Phase 6).
// ============================================================================

export interface RenderOptions {
  readonly crossfadeCurve: 'linear' | 'equalPower';
  readonly normalizeLoudnessLufs: number;
}

export interface RenderedAudio {
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSec: number;
  readonly filePath: string;
}

export interface Renderer {
  render(plan: RemixPlan, graph: MusicGraph, options: RenderOptions): Promise<RenderedAudio>;
}
