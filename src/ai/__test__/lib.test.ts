import { SearchResources, TransitionEdge } from '../../core';
import { defaultPlannerConfig, interpretPrompt, interpretPromptWithGemini, NO_REPEAT_CHUNK_CONSTRAINT } from '../lib';

function fixtureResources(overrides: Partial<SearchResources> = {}): SearchResources {
  return {
    elapsedDurationBucket: 40,
    energyBucket: 0.5,
    currentKeyBucket: '8A',
    currentNodeId: 'A2',
    songDiversityCount: 1,
    recentSectionTypes: [],
    usedChunkIds: new Set(['A1', 'A2']),
    usedSongIds: new Set(['songA']),
    history: ['A1', 'A2'],
    ...overrides,
  };
}

describe('defaultPlannerConfig()', () => {
  it('produces a well-formed, fully-populated PlannerConfig', () => {
    const config = defaultPlannerConfig();
    expect(config.targetDurationSec).toBeGreaterThan(0);
    expect(config.targetEnergyCurve.length).toBeGreaterThan(0);
  });

  it('includes a no-repeat-chunk hard constraint by default', () => {
    const config = defaultPlannerConfig();
    expect(config.hardConstraints).toContainEqual(NO_REPEAT_CHUNK_CONSTRAINT);
  });
});

describe('NO_REPEAT_CHUNK_CONSTRAINT', () => {
  const dummyCalibrate = ((_m: unknown, _toScalar: unknown, neutral = 0.5) => neutral) as never;
  const dummyEdge = {} as TransitionEdge; // the constraint only reads `resources`

  it('passes when the destination chunk has not appeared before', () => {
    const resources = fixtureResources({ currentNodeId: 'A2', history: ['A1', 'A2'] });
    expect(NO_REPEAT_CHUNK_CONSTRAINT.check(dummyEdge, resources, dummyCalibrate)).toBe(true);
  });

  it('fails when the destination chunk already appeared earlier in history', () => {
    // Simulates a resources snapshot where 'A1' (the current node after this
    // transition) already appeared once before — i.e. a genuine repeat.
    const resources = fixtureResources({ currentNodeId: 'A1', history: ['A1', 'A2', 'A1'] });
    expect(NO_REPEAT_CHUNK_CONSTRAINT.check(dummyEdge, resources, dummyCalibrate)).toBe(false);
  });
});

describe('interpretPrompt() — example prompts produce sensible, valid diffs', () => {
  it('"more guitars" raises guitarPresence weight, nothing else', () => {
    const base = defaultPlannerConfig();
    const result = interpretPrompt('I want more guitars in this mix', base);
    expect(result.nodeWeights.guitarPresence).toBeGreaterThan(base.nodeWeights.guitarPresence);
    expect(result.nodeWeights.vocalPresence).toBe(base.nodeWeights.vocalPresence);
    expect(result.targetDurationSec).toBe(base.targetDurationSec);
  });

  it('"high energy and upbeat" raises the target energy curve', () => {
    const base = defaultPlannerConfig();
    const result = interpretPrompt('make it high energy and upbeat', base);
    for (let i = 0; i < base.targetEnergyCurve.length; i++) {
      expect(result.targetEnergyCurve[i]).toBeGreaterThanOrEqual(base.targetEnergyCurve[i]);
    }
    expect(result.pathObjectiveWeights.energyCurveAdherence).toBeGreaterThanOrEqual(1);
  });

  it('"chill and mellow" lowers the target energy curve', () => {
    const base = defaultPlannerConfig();
    const result = interpretPrompt('keep it chill and mellow', base);
    for (let i = 0; i < base.targetEnergyCurve.length; i++) {
      expect(result.targetEnergyCurve[i]).toBeLessThanOrEqual(base.targetEnergyCurve[i]);
    }
  });

  it('"smooth transitions" raises beatAlignment and embeddingSimilarity edge weights', () => {
    const base = defaultPlannerConfig();
    const result = interpretPrompt('smooth transitions please', base);
    expect(result.edgeWeights.beatAlignment).toBeGreaterThan(base.edgeWeights.beatAlignment);
    expect(result.edgeWeights.embeddingSimilarity).toBeGreaterThan(base.edgeWeights.embeddingSimilarity);
    expect(result.edgeWeights.bpmDelta).toBe(base.edgeWeights.bpmDelta);
  });

  it('"short mix" lowers targetDurationSec, "long mix" raises it', () => {
    const base = defaultPlannerConfig();
    expect(interpretPrompt('give me a quick mix', base).targetDurationSec).toBeLessThan(base.targetDurationSec);
    expect(interpretPrompt('I want an extended set', base).targetDurationSec).toBeGreaterThan(base.targetDurationSec);
  });

  it('composes multiple matching rules additively in one prompt', () => {
    const base = defaultPlannerConfig();
    const result = interpretPrompt('more vocals and more variety please', base);
    expect(result.nodeWeights.vocalPresence).toBeGreaterThan(base.nodeWeights.vocalPresence);
    expect(result.pathObjectiveWeights.diversity).toBeGreaterThan(base.pathObjectiveWeights.diversity);
  });

  it('never touches nodeWeights.sectionType — that lever is a documented no-op in the current scorer', () => {
    const base = defaultPlannerConfig();
    const result = interpretPrompt('avoid long intros, more guitars, high energy, smooth, variety', base);
    expect(result.nodeWeights.sectionType).toBe(base.nodeWeights.sectionType);
  });
});

describe('interpretPrompt() — malformed/unsupported prompts degrade gracefully', () => {
  const base = defaultPlannerConfig();

  it('returns the base config unchanged for an empty string', () => {
    expect(interpretPrompt('', base)).toEqual(base);
  });

  it('returns the base config unchanged for whitespace-only input', () => {
    expect(interpretPrompt('   ', base)).toEqual(base);
  });

  it('returns the base config unchanged for a prompt matching no known rule', () => {
    expect(interpretPrompt('xyzzy plugh frobnicate', base)).toEqual(base);
  });

  it('never throws for non-string input types', () => {
    expect(() => interpretPrompt(null, base)).not.toThrow();
    expect(() => interpretPrompt(undefined, base)).not.toThrow();
    expect(() => interpretPrompt(42, base)).not.toThrow();
    expect(() => interpretPrompt({}, base)).not.toThrow();
    expect(() => interpretPrompt(['guitars'], base)).not.toThrow();
  });

  it('returns the base config unchanged for non-string input', () => {
    expect(interpretPrompt(null, base)).toEqual(base);
    expect(interpretPrompt(undefined, base)).toEqual(base);
    expect(interpretPrompt(42, base)).toEqual(base);
  });

  it('defaults to defaultPlannerConfig() when no base is supplied', () => {
    expect(interpretPrompt('unmatched gibberish')).toEqual(defaultPlannerConfig());
  });
});

describe('interpretPromptWithGemini() — real network never touched (generateContentFn is injected)', () => {
  const originalEnvKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalEnvKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalEnvKey;
  });

  it('falls back to interpretPrompt() when no API key is configured (no options.apiKey, no env var)', async () => {
    delete process.env.GEMINI_API_KEY;
    const base = defaultPlannerConfig();
    const generateContentFn = jest.fn();

    const result = await interpretPromptWithGemini('more guitars please', { generateContentFn }, base);

    expect(generateContentFn).not.toHaveBeenCalled();
    expect(result.usedGemini).toBe(false);
    expect(result.config).toEqual(interpretPrompt('more guitars please', base));
  });

  it('does not call generateContentFn for an empty/non-string prompt, even with an API key configured', async () => {
    const base = defaultPlannerConfig();
    const generateContentFn = jest.fn();

    const emptyResult = await interpretPromptWithGemini('', { apiKey: 'fake-key', generateContentFn }, base);
    const nullResult = await interpretPromptWithGemini(null, { apiKey: 'fake-key', generateContentFn }, base);
    expect(emptyResult).toEqual({ config: base, usedGemini: false });
    expect(nullResult).toEqual({ config: base, usedGemini: false });
    expect(generateContentFn).not.toHaveBeenCalled();
  });

  it('applies a valid intent response with bounded, safe magnitudes, and reports usedGemini: true', async () => {
    const base = defaultPlannerConfig();
    const generateContentFn = jest.fn().mockResolvedValue(
      JSON.stringify({
        guitarPresence: 0.8,
        vocalPresence: 0,
        danceability: 0,
        energyLevel: 0,
        smoothness: 0,
        diversity: 0,
        targetDurationSec: null,
      })
    );

    const result = await interpretPromptWithGemini('something guitar-heavy', { apiKey: 'fake-key', generateContentFn }, base);

    expect(generateContentFn).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'fake-key', prompt: 'something guitar-heavy' }));
    expect(result.usedGemini).toBe(true);
    expect(result.config.nodeWeights.guitarPresence).toBeCloseTo(base.nodeWeights.guitarPresence + 0.8 * 1.5);
    expect(result.config.nodeWeights.vocalPresence).toBe(base.nodeWeights.vocalPresence);
    expect(result.config.targetDurationSec).toBe(base.targetDurationSec);
  });

  it('clamps out-of-range values instead of trusting the schema alone', async () => {
    const base = defaultPlannerConfig();
    const generateContentFn = jest.fn().mockResolvedValue(
      JSON.stringify({
        guitarPresence: 50, // way outside the documented -1..1 range
        vocalPresence: -50,
        danceability: 0,
        energyLevel: 0,
        smoothness: 5, // outside 0..1
        diversity: 0,
        targetDurationSec: -100, // invalid, must be ignored
      })
    );

    const result = await interpretPromptWithGemini('anything', { apiKey: 'fake-key', generateContentFn }, base);

    // Clamped to 1 (not 50) before the *1.5 magnitude is applied.
    expect(result.config.nodeWeights.guitarPresence).toBeCloseTo(base.nodeWeights.guitarPresence + 1 * 1.5);
    expect(result.config.nodeWeights.vocalPresence).toBeCloseTo(base.nodeWeights.vocalPresence + -1 * 1.5);
    expect(result.config.edgeWeights.beatAlignment).toBeCloseTo(base.edgeWeights.beatAlignment + 1); // smoothness clamped to 1
    expect(result.config.targetDurationSec).toBe(base.targetDurationSec); // invalid duration ignored, not applied
  });

  it('applies an explicit targetDurationSec from the intent', async () => {
    const base = defaultPlannerConfig();
    const generateContentFn = jest.fn().mockResolvedValue(
      JSON.stringify({ guitarPresence: 0, vocalPresence: 0, danceability: 0, energyLevel: 0, smoothness: 0, diversity: 0, targetDurationSec: 300 })
    );

    const result = await interpretPromptWithGemini('a 5 minute mix', { apiKey: 'fake-key', generateContentFn }, base);
    expect(result.config.targetDurationSec).toBe(300);
  });

  it('falls back to interpretPrompt() and reports usedGemini: false when the response is not valid JSON', async () => {
    const base = defaultPlannerConfig();
    const generateContentFn = jest.fn().mockResolvedValue('not json at all');

    const result = await interpretPromptWithGemini('more guitars', { apiKey: 'fake-key', generateContentFn }, base);
    expect(result.usedGemini).toBe(false);
    expect(result.config).toEqual(interpretPrompt('more guitars', base));
  });

  it('falls back to interpretPrompt() when the response is empty', async () => {
    const base = defaultPlannerConfig();
    const generateContentFn = jest.fn().mockResolvedValue(undefined);

    const result = await interpretPromptWithGemini('more guitars', { apiKey: 'fake-key', generateContentFn }, base);
    expect(result.usedGemini).toBe(false);
    expect(result.config).toEqual(interpretPrompt('more guitars', base));
  });

  it('falls back to interpretPrompt() when generateContentFn rejects (network/API error)', async () => {
    const base = defaultPlannerConfig();
    const generateContentFn = jest.fn().mockRejectedValue(new Error('simulated network failure'));

    const result = await interpretPromptWithGemini('more guitars', { apiKey: 'fake-key', generateContentFn }, base);
    expect(result.usedGemini).toBe(false);
    expect(result.config).toEqual(interpretPrompt('more guitars', base));
  });

  it('reads the API key from process.env.GEMINI_API_KEY when options.apiKey is not given', async () => {
    process.env.GEMINI_API_KEY = 'env-key';
    const base = defaultPlannerConfig();
    const generateContentFn = jest.fn().mockResolvedValue(
      JSON.stringify({ guitarPresence: 0, vocalPresence: 0, danceability: 0, energyLevel: 0, smoothness: 0, diversity: 0, targetDurationSec: null })
    );

    await interpretPromptWithGemini('anything', { generateContentFn }, base);
    expect(generateContentFn).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'env-key' }));
  });
});
