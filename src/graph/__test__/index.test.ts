import * as graph from '../index';

describe('src/graph barrel export', () => {
  it('re-exports buildMusicGraph', () => {
    expect(typeof graph.buildMusicGraph).toBe('function');
  });
});
