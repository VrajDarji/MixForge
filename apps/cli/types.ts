export interface CliOptions {
  readonly songFiles: readonly string[];
  readonly prompt: string;
  readonly outputPath: string;
  readonly targetDurationSec?: number;
  readonly durationToleranceSec?: number;
  readonly beamWidth: number;
  readonly maxSteps: number;
}

export interface RunResult {
  readonly outputPath: string;
  readonly chunkIds: readonly string[];
  readonly durationSec: number;
  readonly usedFallbackPartialPlan: boolean;
}
