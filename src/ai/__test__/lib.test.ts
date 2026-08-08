import { defaultPlannerConfig, interpretPrompt } from '../lib';

describe('defaultPlannerConfig()', () => {
  it('produces a well-formed, fully-populated PlannerConfig', () => {
    const config = defaultPlannerConfig();
    expect(config.hardConstraints).toEqual([]);
    expect(config.targetDurationSec).toBeGreaterThan(0);
    expect(config.targetEnergyCurve.length).toBeGreaterThan(0);
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
