import { buildMusicGraph } from '../lib';
import { synthNodes, synthEdges } from '../../../test-data/synthetic/graph';

describe('buildMusicGraph()', () => {
  it('returns the two outgoing edges of A1 with their exact signal values', () => {
    const graph = buildMusicGraph(synthNodes, synthEdges);
    const outgoing = graph.getOutgoingEdges('A1');

    expect(outgoing.map(e => e.to).sort()).toEqual(['A2', 'B1']);
    const toA2 = outgoing.find(e => e.to === 'A2')!;
    expect(toA2.signals.bpmDelta.value).toBe(0);
    expect(toA2.signals.embeddingSimilarity.value).toBe(0.9);
  });

  it('returns undefined for a node id that does not exist', () => {
    const graph = buildMusicGraph(synthNodes, synthEdges);
    expect(graph.getNode('Z9')).toBeUndefined();
  });

  it('returns an empty array for a node with no outgoing edges', () => {
    const graph = buildMusicGraph(synthNodes, synthEdges);
    expect(graph.getOutgoingEdges('B3')).toEqual([]);
  });

  it('is immutable at the type level — mutating nodes/edges is a compile error', () => {
    const graph = buildMusicGraph(synthNodes, synthEdges);
    // @ts-expect-error ReadonlyMap has no `set` — this must fail to compile.
    graph.nodes.set('X', synthNodes[0]);
  });
});
