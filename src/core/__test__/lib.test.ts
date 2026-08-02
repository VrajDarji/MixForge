import { measurement, mergeKey } from '../lib';
import { Measurement, SearchResources } from '../types';

describe('measurement()', () => {
  it('builds a Measurement with all four fields set exactly as passed', () => {
    const m: Measurement<number> = measurement(120, 0.83, 'BpmDetectorV1', '1.0.0');
    expect(m.value).toBe(120);
    expect(m.confidence).toBe(0.83);
    expect(m.detector).toBe('BpmDetectorV1');
    expect(m.version).toBe('1.0.0');
  });

  it('preserves non-numeric value types generically', () => {
    const m: Measurement<string> = measurement('G Minor', 0.6, 'KeyDetectorV2', '2.1.0');
    expect(m.value).toBe('G Minor');
  });
});

function baseResources(overrides: Partial<SearchResources> = {}): SearchResources {
  return {
    elapsedDurationBucket: 120,
    energyBucket: 3,
    currentKeyBucket: '8A',
    currentNodeId: 'A2',
    songDiversityCount: 2,
    recentSectionTypes: ['verse', 'chorus'],
    usedChunkIds: new Set(['A1', 'A2']),
    usedSongIds: new Set(['songA']),
    history: ['A1', 'A2'],
    ...overrides,
  };
}

describe('mergeKey()', () => {
  it('produces an identical key when only Class C fields (history) differ', () => {
    const a = baseResources({ usedChunkIds: new Set(['A1']), usedSongIds: new Set(['songA']), history: ['A1'] });
    const b = baseResources({ usedChunkIds: new Set(['B1', 'B2', 'B3']), usedSongIds: new Set(['songB']), history: ['B1', 'B2', 'B3'] });
    expect(mergeKey(a)).toBe(mergeKey(b));
  });

  it('produces a different key when a Class A field (elapsedDurationBucket) differs', () => {
    const a = baseResources({ elapsedDurationBucket: 120 });
    const b = baseResources({ elapsedDurationBucket: 180 });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });

  it('produces a different key when a Class A field (energyBucket) differs', () => {
    const a = baseResources({ energyBucket: 3 });
    const b = baseResources({ energyBucket: 4 });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });

  it('produces a different key when a Class A field (currentKeyBucket) differs', () => {
    const a = baseResources({ currentKeyBucket: '8A' });
    const b = baseResources({ currentKeyBucket: '9A' });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });

  it('produces a different key when a Class A field (currentNodeId) differs', () => {
    const a = baseResources({ currentNodeId: 'A2' });
    const b = baseResources({ currentNodeId: 'B7' });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });

  it('produces a different key when a Class B field (songDiversityCount) differs', () => {
    const a = baseResources({ songDiversityCount: 2 });
    const b = baseResources({ songDiversityCount: 3 });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });

  it('produces a different key when a Class B field (recentSectionTypes) differs', () => {
    const a = baseResources({ recentSectionTypes: ['verse'] });
    const b = baseResources({ recentSectionTypes: ['chorus'] });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });
});
