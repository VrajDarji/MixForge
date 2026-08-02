import { SearchResources, mergeKey } from '../searchState';

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
