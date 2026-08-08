import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';
import * as wav from 'node-wav';
import { Essentia, EssentiaWASM } from 'essentia.js';
import { ChunkNode, measurement, NodeSignals, SectionType } from '../core';
import { AnalysisParams, DecodedAudio } from './types';
import { computeRms, DETECTOR_VERSION, normalizeConfidence, toCamelotKey } from './utils';

const essentia = new Essentia(EssentiaWASM);

export const DEFAULT_ANALYSIS_PARAMS: AnalysisParams = { barsPerChunk: 8, beatsPerBar: 4 };

// essentia.js's RhythmExtractor2013 'multifeature' confidence and Danceability
// are not naturally 0-1 scales — these ceilings are empirical references for
// normalizing them, not spec constants (see essentia's own docs for typical
// ranges: confidence up to ~5.32, danceability 0-3).
const RHYTHM_CONFIDENCE_CEILING = 5.32;
const DANCEABILITY_CEILING = 3;
const ENERGY_REFERENCE_RMS = 0.3;
const MFCC_COEFFICIENT_COUNT = 13;
const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;
const MIN_CHUNK_DURATION_SEC = 0.5;

// Decodes any ffmpeg-readable audio file to mono 44.1kHz PCM via a temp WAV
// file. Synchronous internally (spawnSync) — acceptable for an offline,
// run-once analysis pipeline (ADR-001), not the online planning path.
export function decodeAudioFile(filePath: string): DecodedAudio {
  const tempWavPath = path.join(os.tmpdir(), `mixforge-decode-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  const result = spawnSync(ffmpegPath, ['-y', '-i', filePath, '-ac', '1', '-ar', '44100', '-f', 'wav', tempWavPath], {
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg decode failed for ${filePath}: ${result.stderr?.toString() ?? 'unknown error'}`);
  }
  try {
    const buffer = fs.readFileSync(tempWavPath);
    const decoded = wav.decode(buffer);
    const samples = decoded.channelData[0];
    return { samples, sampleRate: decoded.sampleRate, durationSec: samples.length / decoded.sampleRate, sourceFilePath: filePath };
  } finally {
    fs.unlinkSync(tempWavPath);
  }
}

// Mean MFCC vector across non-overlapping analysis frames — a lightweight,
// deterministic stand-in for a real pretrained audio embedding (OpenL3/CLAP
// per docs/implementation.md §9.1), which is out of scope for this phase.
function computeChunkEmbedding(samples: Float32Array): Float32Array {
  const frames = essentia.FrameGenerator(samples, FRAME_SIZE, HOP_SIZE);
  const frameCount = frames.size();
  const sums = new Float32Array(MFCC_COEFFICIENT_COUNT);
  if (frameCount === 0) return sums;

  for (let i = 0; i < frameCount; i++) {
    const frame = frames.get(i);
    const windowed = essentia.Windowing(frame, true, FRAME_SIZE, 'hann').frame;
    const spectrum = essentia.Spectrum(windowed).spectrum;
    const mfcc = essentia.vectorToArray(essentia.MFCC(spectrum).mfcc);
    for (let c = 0; c < MFCC_COEFFICIENT_COUNT; c++) sums[c] += mfcc[c] ?? 0;
  }
  for (let c = 0; c < MFCC_COEFFICIENT_COUNT; c++) sums[c] /= frameCount;
  return sums;
}

// Produces one ChunkNode per bar-aligned segment of the decoded song.
// BPM/key are computed once per song (global measurements); energy,
// loudness, danceability, and the embedding proxy are computed per chunk.
export function analyzeSong(
  songId: string,
  decoded: DecodedAudio,
  params: AnalysisParams = DEFAULT_ANALYSIS_PARAMS
): readonly ChunkNode[] {
  const fullVector = essentia.arrayToVector(decoded.samples);

  const rhythm = essentia.RhythmExtractor2013(fullVector, 208, 'multifeature', 40);
  const bpmValue = rhythm.bpm;
  const bpmConfidence = normalizeConfidence(rhythm.confidence, RHYTHM_CONFIDENCE_CEILING);

  const key = essentia.KeyExtractor(fullVector);
  const camelotKey = toCamelotKey(key.key, key.scale);
  const keyConfidence = normalizeConfidence(key.strength, 1);

  const beatIntervalSec = 60 / bpmValue;
  const chunkDurationSec = beatIntervalSec * params.beatsPerBar * params.barsPerChunk;
  const chunkCount = Math.max(Math.floor(decoded.durationSec / chunkDurationSec), 1);

  const nodes: ChunkNode[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const startTimeSec = i * chunkDurationSec;
    const endTimeSec = Math.min(startTimeSec + chunkDurationSec, decoded.durationSec);
    const startSample = Math.round(startTimeSec * decoded.sampleRate);
    const endSample = Math.round(endTimeSec * decoded.sampleRate);
    const chunkSamples = decoded.samples.subarray(startSample, endSample);
    if (chunkSamples.length < decoded.sampleRate * MIN_CHUNK_DURATION_SEC) continue;

    const chunkVector = essentia.arrayToVector(chunkSamples);

    const energyValue = Math.min(computeRms(chunkSamples) / ENERGY_REFERENCE_RMS, 1);

    const loudness = essentia.LoudnessEBUR128(chunkVector, chunkVector, 0.1, decoded.sampleRate, true);
    const loudnessValue = Number.isFinite(loudness.integratedLoudness) ? loudness.integratedLoudness : -70;

    const danceabilityValue = normalizeConfidence(essentia.Danceability(chunkVector).danceability, DANCEABILITY_CEILING);

    const embeddingArray = computeChunkEmbedding(chunkSamples);
    // Rough, low-confidence proxies for instrument presence — no dedicated
    // classifier is wired up (docs/implementation.md §9.1 explicitly allows
    // "an embedding-derived proxy if unavailable"). Derived from MFCC
    // coefficient magnitudes, not a real timbral classifier — the low
    // confidence (0.2) reflects that honestly rather than overstating it.
    const guitarPresenceValue = normalizeConfidence(Math.abs(embeddingArray[2] ?? 0), 50);
    const vocalPresenceValue = normalizeConfidence(Math.abs(embeddingArray[1] ?? 0), 200);

    const signals: NodeSignals = {
      bpm: measurement(bpmValue, bpmConfidence, 'EssentiaRhythmExtractor2013', DETECTOR_VERSION),
      key: measurement(camelotKey, keyConfidence, 'EssentiaKeyExtractor', DETECTOR_VERSION),
      energy: measurement(energyValue, 0.9, 'EssentiaRMS', DETECTOR_VERSION),
      loudnessLufs: measurement(loudnessValue, 0.9, 'EssentiaLoudnessEBUR128', DETECTOR_VERSION),
      guitarPresence: measurement(guitarPresenceValue, 0.2, 'MfccProxy', DETECTOR_VERSION),
      vocalPresence: measurement(vocalPresenceValue, 0.2, 'MfccProxy', DETECTOR_VERSION),
      danceability: measurement(danceabilityValue, 0.7, 'EssentiaDanceability', DETECTOR_VERSION),
      // Structural (verse/chorus) labeling is explicitly deferred past MVP
      // per docs/implementation.md §9.1 — 'unknown' with low confidence is
      // the honest placeholder, not a guess.
      sectionType: measurement<SectionType>('unknown', 0.1, 'Unimplemented', DETECTOR_VERSION),
      embedding: measurement(embeddingArray, 0.95, 'MfccMeanEmbedding', DETECTOR_VERSION),
      genreDistribution: measurement({ unknown: 1 }, 0.1, 'Unimplemented', DETECTOR_VERSION),
    };

    nodes.push({
      id: `${songId}-chunk-${i}`,
      songId,
      startTimeSec,
      endTimeSec,
      bars: params.barsPerChunk,
      signals,
      sourceFilePath: decoded.sourceFilePath,
    });
  }
  return nodes;
}
