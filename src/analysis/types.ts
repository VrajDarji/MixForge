// Analysis-only types. No logic — see ./lib.ts.

export interface DecodedAudio {
  readonly samples: Float32Array; // mono, downmixed
  readonly sampleRate: number;
  readonly durationSec: number;
}

export interface AnalysisParams {
  readonly barsPerChunk: number;
  readonly beatsPerBar: number;
}
