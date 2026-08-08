// Small pure helpers — no domain types, no algorithm orchestration of their own.

export const DETECTOR_VERSION = '1.0.0';

// Standard Camelot wheel. essentia.js's KeyExtractor can emit either sharp or
// flat spellings for black keys depending on the profile, so both spellings
// map to the same code.
const CAMELOT_MAJOR: Record<string, string> = {
  C: '8B', 'C#': '3B', Db: '3B', D: '10B', 'D#': '5B', Eb: '5B', E: '12B',
  F: '7B', 'F#': '2B', Gb: '2B', G: '9B', 'G#': '4B', Ab: '4B', A: '11B',
  'A#': '6B', Bb: '6B', B: '1B',
};

const CAMELOT_MINOR: Record<string, string> = {
  A: '8A', 'A#': '3A', Bb: '3A', B: '10A', C: '5A', 'C#': '12A', Db: '12A',
  D: '7A', 'D#': '2A', Eb: '2A', E: '9A', F: '4A', 'F#': '11A', Gb: '11A',
  G: '6A', 'G#': '1A', Ab: '1A',
};

export function toCamelotKey(key: string, scale: string): string {
  const table = scale === 'minor' ? CAMELOT_MINOR : CAMELOT_MAJOR;
  return table[key] ?? '8B'; // unrecognized spelling: fall back to a neutral default rather than throw
}

export function computeRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / Math.max(samples.length, 1));
}

// Maps a raw detector confidence/strength value onto [0,1] via a chosen
// reference ceiling — detector confidence scales are not naturally 0-1.
export function normalizeConfidence(raw: number, ceiling: number): number {
  if (!Number.isFinite(raw) || ceiling <= 0) return 0;
  return Math.min(Math.max(raw / ceiling, 0), 1);
}
