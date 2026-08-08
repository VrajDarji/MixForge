import * as scorer from '../index';

describe('src/scorer barrel export', () => {
  it('re-exports calibrate, evaluateEdge, evaluateNode, evaluatePath, sampleEnergyCurve', () => {
    expect(typeof scorer.calibrate).toBe('function');
    expect(typeof scorer.evaluateEdge).toBe('function');
    expect(typeof scorer.evaluateNode).toBe('function');
    expect(typeof scorer.evaluatePath).toBe('function');
    expect(typeof scorer.sampleEnergyCurve).toBe('function');
  });
});
