// Ambient type declarations for third-party packages that ship no TypeScript
// types of their own (essentia.js, ffmpeg-static, node-wav). Not owned by any
// single module folder — shared infrastructure, deliberately outside the
// types.ts/lib.ts/utils.ts/index.ts convention.

declare module 'essentia.js' {
  export const EssentiaWASM: unknown;

  export class Essentia {
    constructor(wasmModule: unknown, isDebug?: boolean);
    readonly version: string;
    arrayToVector(input: Float32Array): unknown;
    vectorToArray(vector: unknown): Float32Array;
    FrameGenerator(input: Float32Array, frameSize?: number, hopSize?: number): {
      size(): number;
      get(index: number): unknown;
    };
    Windowing(frame: unknown, normalized?: boolean, size?: number, type?: string): { frame: unknown };
    Spectrum(frame: unknown): { spectrum: unknown };
    MFCC(spectrum: unknown): { mfcc: unknown };
    RMS(array: unknown): { rms: number };
    RhythmExtractor2013(
      signal: unknown,
      maxTempo?: number,
      method?: string,
      minTempo?: number
    ): { bpm: number; confidence: number; beats_position: unknown };
    KeyExtractor(audio: unknown): { key: string; scale: string; strength: number };
    LoudnessEBUR128(
      leftSignal: unknown,
      rightSignal: unknown,
      hopSize?: number,
      sampleRate?: number,
      startAtZero?: boolean
    ): { integratedLoudness: number; momentaryLoudness: unknown; shortTermLoudness: unknown; loudnessRange: number };
    Danceability(signal: unknown, maxTau?: number, minTau?: number, sampleRate?: number): { danceability: number };
  }
}

declare module 'ffmpeg-static' {
  const ffmpegPath: string;
  export default ffmpegPath;
}

declare module 'node-wav' {
  export interface DecodedWav {
    sampleRate: number;
    channelData: Float32Array[];
  }
  export function decode(buffer: Buffer): DecodedWav;
  export function encode(
    channelData: Float32Array[],
    options: { sampleRate: number; float?: boolean; bitDepth?: number }
  ): Buffer;
}
