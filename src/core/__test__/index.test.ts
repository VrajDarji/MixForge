import * as core from '../index';

describe('src/core barrel export', () => {
  it('re-exports the measurement factory', () => {
    expect(typeof core.measurement).toBe('function');
  });

  it('re-exports mergeKey', () => {
    expect(typeof core.mergeKey).toBe('function');
  });
});
