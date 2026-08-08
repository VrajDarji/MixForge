import { initialState, updateResources } from '../lib';
import { ChunkNode, Measurement, SectionType, TransitionEdge } from '../../core';
import { synthEdges, synthNodes } from '../../../test-data/synthetic/graph';

function findNode(id: string): ChunkNode {
  return synthNodes.find((n) => n.id === id)!;
}
function findEdge(from: string, to: string): TransitionEdge {
  return synthEdges.find((e) => e.from === from && e.to === to)!;
}

function m<T>(value: T): Measurement<T> {
  return { value, confidence: 1, detector: 'test', version: '1.0.0' };
}

function fakeNode(id: string, songId: string, sectionType: SectionType): ChunkNode {
  const base = findNode('A1');
  return {
    ...base,
    id,
    songId,
    signals: { ...base.signals, sectionType: m(sectionType), energy: m(0.5), key: m('8A') },
  };
}

describe('initialState()', () => {
  it('builds a SearchState seeded from a single starting ChunkNode', () => {
    const a1 = findNode('A1'); // songA, startTimeSec=0, endTimeSec=8, energy=0.3, key='8A', sectionType='intro'
    const state = initialState(a1);

    expect(state.accumulatedScore).toBe(0);
    expect(state.resources.elapsedDurationBucket).toBe(8);
    expect(state.resources.energyBucket).toBe(0.3);
    expect(state.resources.currentKeyBucket).toBe('8A');
    expect(state.resources.currentNodeId).toBe('A1');
    expect(state.resources.songDiversityCount).toBe(1);
    expect(state.resources.recentSectionTypes).toEqual(['intro']);
    expect([...state.resources.usedChunkIds]).toEqual(['A1']);
    expect([...state.resources.usedSongIds]).toEqual(['songA']);
    expect(state.resources.history).toEqual(['A1']);
  });
});

describe('updateResources()', () => {
  it('advances elapsed duration and current-node fields from the destination node', () => {
    const a1 = findNode('A1');
    const a2 = findNode('A2'); // songA, energy=0.5, key='8A', sectionType='verse'
    const start = initialState(a1);

    const next = updateResources(start.resources, findEdge('A1', 'A2'), a2);

    expect(next.elapsedDurationBucket).toBe(16); // 8 (A1) + 8 (A2)
    expect(next.energyBucket).toBe(0.5);
    expect(next.currentKeyBucket).toBe('8A');
    expect(next.currentNodeId).toBe('A2');
    expect(next.history).toEqual(['A1', 'A2']);
    expect([...next.usedChunkIds]).toEqual(['A1', 'A2']);
  });

  it('does not increment songDiversityCount when the destination is the same song', () => {
    const a1 = findNode('A1');
    const a2 = findNode('A2'); // same songId ('songA') as A1
    const start = initialState(a1);

    const next = updateResources(start.resources, findEdge('A1', 'A2'), a2);

    expect(next.songDiversityCount).toBe(1);
    expect([...next.usedSongIds]).toEqual(['songA']);
  });

  it('increments songDiversityCount when the destination introduces a new song', () => {
    const a1 = findNode('A1');
    const a2 = findNode('A2');
    const b2 = findNode('B2'); // songId 'songB'
    const afterA2 = updateResources(initialState(a1).resources, findEdge('A1', 'A2'), a2);

    const afterB2 = updateResources(afterA2, findEdge('A2', 'B2'), b2);

    expect(afterB2.songDiversityCount).toBe(2);
    expect([...afterB2.usedSongIds]).toEqual(['songA', 'songB']);
    expect(afterB2.history).toEqual(['A1', 'A2', 'B2']);
  });

  it('keeps only the last 3 section types in recentSectionTypes', () => {
    const n1 = fakeNode('N1', 'songX', 'intro');
    const n2 = fakeNode('N2', 'songX', 'verse');
    const n3 = fakeNode('N3', 'songX', 'chorus');
    const n4 = fakeNode('N4', 'songX', 'outro');
    const edge: TransitionEdge = { from: 'x', to: 'y', signals: findEdge('A1', 'A2').signals };

    let resources = initialState(n1).resources;
    resources = updateResources(resources, edge, n2);
    resources = updateResources(resources, edge, n3);
    resources = updateResources(resources, edge, n4);

    expect(resources.recentSectionTypes).toEqual(['verse', 'chorus', 'outro']);
  });
});
