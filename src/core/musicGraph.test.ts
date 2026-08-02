import { MusicGraph } from './musicGraph';

describe('MusicGraph interface', () => {
  it('is satisfied by a minimal stub object', () => {
    const stub: MusicGraph = {
      nodes: new Map(),
      edges: new Map(),
      getOutgoingEdges: () => [],
      getNode: () => undefined,
    };
    expect(stub.getOutgoingEdges('A1')).toEqual([]);
    expect(stub.getNode('A1')).toBeUndefined();
  });
});
