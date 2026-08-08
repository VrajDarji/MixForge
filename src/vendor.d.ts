// Ambient type declarations for third-party packages that ship no TypeScript
// types of their own (essentia.js, ffmpeg-static, node-wav). Not owned by any
// single module folder — shared infrastructure, deliberately outside the
// types.ts/lib.ts/utils.ts/index.ts convention.

declare module 'essentia.js' {
  // essentia.js's WASM (embind) vectors are manually-managed C++ objects
  // under the hood — JS garbage collection does NOT free their WASM heap
  // allocation. Every EssentiaVector returned by any call below MUST have
  // .delete() called on it once its value has been extracted, or the fixed
  // WASM heap fills up and the module aborts (observed in practice: fine on
  // short clips, but a hard abort partway through analyzing several
  // full-length real songs' worth of per-frame MFCC vectors).
  export interface EssentiaVector {
    delete(): void;
    size(): number;
    get(index: number): unknown;
    push_back(value: unknown): void;
    resize(size: number): void;
    set(index: number, value: unknown): void;
  }

  export const EssentiaWASM: unknown;

  export class Essentia {
    constructor(wasmModule: unknown, isDebug?: boolean);
    readonly version: string;
    arrayToVector(input: Float32Array): EssentiaVector;
    vectorToArray(vector: EssentiaVector): Float32Array;
    FrameGenerator(input: Float32Array, frameSize?: number, hopSize?: number): EssentiaVector; // VectorVectorFloat: .get(i) also returns an EssentiaVector needing its own delete()
    Windowing(frame: EssentiaVector, normalized?: boolean, size?: number, type?: string): { frame: EssentiaVector };
    Spectrum(frame: EssentiaVector): { spectrum: EssentiaVector };
    MFCC(spectrum: EssentiaVector): { bands: EssentiaVector; mfcc: EssentiaVector };
    RMS(array: EssentiaVector): { rms: number };
    RhythmExtractor2013(
      signal: EssentiaVector,
      maxTempo?: number,
      method?: string,
      minTempo?: number
    ): { bpm: number; confidence: number; ticks: EssentiaVector; estimates: EssentiaVector; bpmIntervals: EssentiaVector };
    KeyExtractor(audio: EssentiaVector): { key: string; scale: string; strength: number }; // no vector fields
    LoudnessEBUR128(
      leftSignal: EssentiaVector,
      rightSignal: EssentiaVector,
      hopSize?: number,
      sampleRate?: number,
      startAtZero?: boolean
    ): { integratedLoudness: number; momentaryLoudness: EssentiaVector; shortTermLoudness: EssentiaVector; loudnessRange: number };
    Danceability(signal: EssentiaVector, maxTau?: number, minTau?: number, sampleRate?: number): { danceability: number; dfa: EssentiaVector };
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
