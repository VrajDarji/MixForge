// Analysis-only types. No logic — see ./lib.ts.

export interface DecodedAudio {
  readonly samples: Float32Array; // mono, downmixed
  readonly sampleRate: number;
  readonly durationSec: number;
  readonly sourceFilePath: string;
}

export interface AnalysisParams {
  readonly barsPerChunk: number;
  readonly beatsPerBar: number;
}
