import { SearchResources, TransitionEdge } from '../../core';
import { defaultPlannerConfig, interpretPrompt, NO_REPEAT_CHUNK_CONSTRAINT } from '../lib';

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
