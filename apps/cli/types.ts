export interface CliOptions {
  readonly songFiles: readonly string[];
  readonly prompt: string;
  readonly outputPath: string;
  readonly targetDurationSec?: number;
  readonly durationToleranceSec?: number;
  readonly beamWidth: number;
  readonly maxSteps: number;
  /** Falls back to process.env.GEMINI_API_KEY if not given. Neither set -> deterministic regex-based prompt interpretation. */
  readonly geminiApiKey?: string;
}

export interface RunResult {
  readonly outputPath: string;
  readonly chunkIds: readonly string[];
  readonly durationSec: number;
  readonly usedFallbackPartialPlan: boolean;
  readonly usedGemini: boolean;
}
