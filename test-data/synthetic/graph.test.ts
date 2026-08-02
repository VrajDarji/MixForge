import { synthNodes, synthEdges } from './graph';

describe('synthetic graph fixture', () => {
  it('has the 6 chunks across 2 songs described in implementation.md §6', () => {
    expect(synthNodes.map(n => n.id).sort()).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
    expect(synthNodes.filter(n => n.songId === 'songA')).toHaveLength(3);
    expect(synthNodes.filter(n => n.songId === 'songB')).toHaveLength(3);
  });

  it('has the 4 specified edges with the exact signal values from implementation.md §6', () => {
    const byPair = (from: string, to: string) => synthEdges.find(e => e.from === from && e.to === to);

    const a1a2 = byPair('A1', 'A2')!;
    expect(a1a2.signals.bpmDelta.value).toBe(0);
    expect(a1a2.signals.keyCompatibility.value).toBe(true);
    expect(a1a2.signals.embeddingSimilarity.value).toBe(0.9);

    const a2b2 = byPair('A2', 'B2')!;
    expect(a2b2.signals.bpmDelta.value).toBe(2);
    expect(a2b2.signals.keyCompatibility.value).toBe(true);
    expect(a2b2.signals.embeddingSimilarity.value).toBe(0.7);

    const b2a3 = byPair('B2', 'A3')!;
    expect(b2a3.signals.bpmDelta.value).toBe(25);
    expect(b2a3.signals.keyCompatibility.value).toBe(false);
    expect(b2a3.signals.embeddingSimilarity.value).toBe(0.2);

    const a1b1 = byPair('A1', 'B1')!;
    expect(a1b1.signals.bpmDelta.value).toBe(8);
    expect(a1b1.signals.keyCompatibility.value).toBe(true);
    expect(a1b1.signals.embeddingSimilarity.value).toBe(0.5);
  });

  it('has no edge from B2 elsewhere but the known-bad B2->A3', () => {
    expect(synthEdges.filter(e => e.from === 'B2')).toHaveLength(1);
  });
});
