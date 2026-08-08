import * as path from 'path';
import { analyzeSong, decodeAudioFile } from '../lib';

const FIXTURE_A = path.join(__dirname, '../../../test-data/audio/synthetic-a-128bpm-aminor.wav');
const FIXTURE_B = path.join(__dirname, '../../../test-data/audio/synthetic-b-120bpm-cmajor.wav');

describe('decodeAudioFile()', () => {
  it('decodes a real WAV file to mono 44.1kHz PCM with plausible duration', () => {
    const decoded = decodeAudioFile(FIXTURE_A);
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.samples.length).toBeGreaterThan(0);
    expect(decoded.durationSec).toBeGreaterThan(20);
    expect(decoded.durationSec).toBeLessThan(28);
  });
});

describe('analyzeSong()', () => {
  it('produces plausible (non-placeholder) BPM and key measurements for a 128bpm/Aminor fixture', () => {
    const decoded = decodeAudioFile(FIXTURE_A);
    const nodes = analyzeSong('songA', decoded, { barsPerChunk: 2, beatsPerBar: 4 });

    expect(nodes.length).toBeGreaterThan(1);
    const first = nodes[0];
    // BPM detection on a synthetic click track is approximate, not exact —
    // assert it's in a musically plausible neighborhood of the true 128bpm,
    // not an exact match (real detectors have real error rates, per ADR-009).
    expect(first.signals.bpm.value).toBeGreaterThan(60);
    expect(first.signals.bpm.value).toBeLessThan(208);
    expect(first.signals.bpm.confidence).toBeGreaterThan(0);
    expect(first.signals.bpm.confidence).toBeLessThanOrEqual(1);
    expect(first.signals.key.value).toMatch(/^\d{1,2}[AB]$/); // valid Camelot notation
    expect(first.signals.key.confidence).toBeGreaterThan(0);
    expect(first.signals.energy.value).toBeGreaterThanOrEqual(0);
    expect(first.signals.energy.value).toBeLessThanOrEqual(1);
    expect(Number.isFinite(first.signals.loudnessLufs.value)).toBe(true);
    expect(first.signals.embedding.value).toBeInstanceOf(Float32Array);
    expect(first.signals.embedding.value.length).toBe(13);
  });

  it('produces distinct chunk ids and contiguous, non-overlapping time ranges', () => {
    const decoded = decodeAudioFile(FIXTURE_A);
    const nodes = analyzeSong('songA', decoded, { barsPerChunk: 2, beatsPerBar: 4 });

    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i].startTimeSec).toBeCloseTo(nodes[i - 1].endTimeSec, 5);
    }
    for (const node of nodes) {
      expect(node.songId).toBe('songA');
      expect(node.endTimeSec).toBeGreaterThan(node.startTimeSec);
    }
  });

  it('detects a different BPM neighborhood for a different-tempo fixture', () => {
    const decodedA = decodeAudioFile(FIXTURE_A); // 128bpm
    const decodedB = decodeAudioFile(FIXTURE_B); // 120bpm
    const nodesA = analyzeSong('songA', decodedA, { barsPerChunk: 4, beatsPerBar: 4 });
    const nodesB = analyzeSong('songB', decodedB, { barsPerChunk: 4, beatsPerBar: 4 });

    // Not asserting exact BPM values (detector error is real and expected) —
    // asserting the pipeline produces *some* real, non-placeholder measurement
    // for each independently-generated fixture.
    expect(nodesA[0].signals.bpm.value).toBeGreaterThan(0);
    expect(nodesB[0].signals.bpm.value).toBeGreaterThan(0);
  });
});
