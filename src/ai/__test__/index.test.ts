import * as ai from '../index';

describe('src/ai barrel export', () => {
  it('re-exports defaultPlannerConfig and interpretPrompt', () => {
    expect(typeof ai.defaultPlannerConfig).toBe('function');
    expect(typeof ai.interpretPrompt).toBe('function');
    expect(Array.isArray(ai.PROMPT_RULES)).toBe(true);
  });
});
