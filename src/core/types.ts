// Core domain types. No logic — see ./lib.ts.

export interface Measurement<T> {
  readonly value: T;
  /** 0.0-1.0 detector confidence, not a preference. */
  readonly confidence: number;
  readonly detector: string;
  readonly version: string;
}

export type SectionType =
  | 'intro' | 'verse' | 'preChorus' | 'chorus'
  | 'bridge' | 'drop' | 'solo' | 'outro' | 'unknown';

export interface NodeSignals {
  readonly bpm: Measurement<number>;
  readonly key: Measurement<string>; // Camelot notation, e.g. "8A"
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
  /** Optional: path to the original song's audio file, for the renderer (Phase 6) to load real samples from. Undefined for synthetic/test fixtures that are never rendered. Additive field — does not break any existing construction of ChunkNode. */
  readonly sourceFilePath?: string;
}

export interface EdgeSignals {
  readonly bpmDelta: Measurement<number>;
  readonly keyCompatibility: Measurement<boolean>;
  readonly beatAlignment: Measurement<number>; // 0-1
  readonly embeddingSimilarity: Measurement<number>; // cosine, 0-1
  readonly loudnessDelta: Measurement<number>;
  readonly estimatedCrossfadeSec: Measurement<number>;
}

export interface TransitionEdge {
  readonly from: string; // ChunkNode id
  readonly to: string; // ChunkNode id
  readonly signals: EdgeSignals;
}

/** Interface only — implementation lives in src/graph/ (Phase 2). */
export interface MusicGraph {
  readonly nodes: ReadonlyMap<string, ChunkNode>;
  readonly edges: ReadonlyMap<string, readonly TransitionEdge[]>; // keyed by `from`
  getOutgoingEdges(nodeId: string): readonly TransitionEdge[];
  getNode(nodeId: string): ChunkNode | undefined;
}

/** Interface only — implementation lives in src/scorer/ (Phase 3). */
export interface CalibrationFn {
  <T>(m: Measurement<T>, toScalar: (value: T) => number, neutral?: number): number;
}

export interface HardConstraint {
  readonly name: string;
  readonly check: (edge: TransitionEdge, resources: SearchResources, calibrate: CalibrationFn) => boolean;
}

export interface PlannerConfig {
  readonly hardConstraints: readonly HardConstraint[];
  /** embedding/genreDistribution aren't scalar — 0 is the only safe weight until a scorer provides toScalar. */
  readonly nodeWeights: Readonly<Record<keyof NodeSignals, number>>;
  readonly edgeWeights: Readonly<Record<keyof EdgeSignals, number>>;
  readonly pathObjectiveWeights: {
    readonly energyCurveAdherence: number;
    readonly diversity: number;
    readonly durationAdherence: number;
    /** Not currently applied by any scorer or planner code — see src/scorer/lib.ts's evaluatePath comment. */
    readonly repetitionPenalty: number;
  };
  readonly targetDurationSec: number;
  readonly targetEnergyCurve: readonly number[]; // 0-1, sampled over normalized time
  readonly durationToleranceSec: number;
}

/** ADR-007: Class A (exact) + Class B (approximate) are mergeKey inputs. Class C is historical, never merged on. */
export interface SearchResources {
  readonly elapsedDurationBucket: number; // Class A
  readonly energyBucket: number; // Class A
  readonly currentKeyBucket: string; // Class A
  readonly currentNodeId: string; // Class A — design.md §14

  readonly songDiversityCount: number; // Class B
  readonly recentSectionTypes: readonly SectionType[]; // Class B, last N only

  readonly usedChunkIds: ReadonlySet<string>; // Class C
  readonly usedSongIds: ReadonlySet<string>; // Class C
  readonly history: readonly string[]; // Class C
}

export interface SearchState {
  readonly accumulatedScore: number;
  readonly resources: SearchResources; // currentNodeId lives here, not duplicated
}

/** ADR-006: zero audio knowledge — must be satisfiable by any domain. */
export interface SearchProblem<TNode, TResource, TEdge> {
  getOutgoing(node: TNode): readonly TEdge[];
  updateResources(resource: TResource, edge: TEdge): TResource;
  isValid(resource: TResource): boolean;
  /** For MusicSearchProblem, must delegate to ./lib's mergeKey() — never reimplement (ADR-007). */
  mergeKey(resource: TResource): string;
  /** Non-compensatory (ADR-005). */
  edgeScore(edge: TEdge, config: PlannerConfig): number;
  nodeScore(node: TNode, config: PlannerConfig): number;
  /** Compensatory/additive (ADR-005). */
  pathScore(resource: TResource, config: PlannerConfig): number;
}

export type MusicSearchProblem = SearchProblem<ChunkNode, SearchResources, TransitionEdge>;

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

/** Interface only — implementation lives in src/renderer/ (Phase 6). */
export interface Renderer {
  render(plan: RemixPlan, graph: MusicGraph, options: RenderOptions): Promise<RenderedAudio>;
}
