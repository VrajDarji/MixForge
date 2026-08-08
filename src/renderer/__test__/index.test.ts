import * as renderer from '../index';

describe('src/renderer barrel export', () => {
  it('re-exports createRenderer and the crossfade/loudness utilities', () => {
    expect(typeof renderer.createRenderer).toBe('function');
    expect(typeof renderer.equalPowerFadeIn).toBe('function');
    expect(typeof renderer.equalPowerFadeOut).toBe('function');
    expect(typeof renderer.resampleLinear).toBe('function');
    expect(typeof renderer.boundedStretchRatio).toBe('function');
    expect(typeof renderer.approximateLufs).toBe('function');
  });
});
