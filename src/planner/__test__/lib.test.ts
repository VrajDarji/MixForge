import { initialState, updateResources } from '../lib';
import { ChunkNode, Measurement, SectionType, TransitionEdge } from '../../core';
import { synthEdges, synthNodes } from '../../../test-data/synthetic/graph';
import { isValidResources } from '../lib';
import { calibrate } from '../../scorer';
import { HardConstraint, PlannerConfig, SearchResources } from '../../core';
import { selectDiverseBeam } from '../lib';
import { compareStatesByScoreThenId } from '../utils';
import { SearchState } from '../../core';
import { handleDeadEnd, isWithinTargetDuration, toRemixPlan } from '../lib';
import { isPlanFailure } from '../utils';
import { planRemix } from '../lib';
import { buildMusicGraph } from '../../graph';

function findNode(id: string): ChunkNode {
  return synthNodes.find((n) => n.id === id)!;
}
function findEdge(from: string, to: string): TransitionEdge {
  return synthEdges.find((e) => e.from === from && e.to === to)!;
}

function m<T>(value: T): Measurement<T> {
  return { value, confidence: 1, detector: 'test', version: '1.0.0' };
}

function fakeNode(id: string, songId: string, sectionType: SectionType): ChunkNode {
  const base = findNode('A1');
  return {
    ...base,
    id,
    songId,
    signals: { ...base.signals, sectionType: m(sectionType), energy: m(0.5), key: m('8A') },
  };
}

describe('initialState()', () => {
  it('builds a SearchState seeded from a single starting ChunkNode', () => {
    const a1 = findNode('A1'); // songA, startTimeSec=0, endTimeSec=8, energy=0.3, key='8A', sectionType='intro'
    const state = initialState(a1);

    expect(state.accumulatedScore).toBe(0);
    expect(state.resources.elapsedDurationBucket).toBe(8);
    expect(state.resources.energyBucket).toBe(0.3);
    expect(state.resources.currentKeyBucket).toBe('8A');
    expect(state.resources.currentNodeId).toBe('A1');
    expect(state.resources.songDiversityCount).toBe(1);
    expect(state.resources.recentSectionTypes).toEqual(['intro']);
    expect([...state.resources.usedChunkIds]).toEqual(['A1']);
    expect([...state.resources.usedSongIds]).toEqual(['songA']);
    expect(state.resources.history).toEqual(['A1']);
  });
});

describe('updateResources()', () => {
  it('advances elapsed duration and current-node fields from the destination node', () => {
    const a1 = findNode('A1');
    const a2 = findNode('A2'); // songA, energy=0.5, key='8A', sectionType='verse'
    const start = initialState(a1);

    const next = updateResources(start.resources, findEdge('A1', 'A2'), a2);

    expect(next.elapsedDurationBucket).toBe(16); // 8 (A1) + 8 (A2)
    expect(next.energyBucket).toBe(0.5);
    expect(next.currentKeyBucket).toBe('8A');
    expect(next.currentNodeId).toBe('A2');
    expect(next.history).toEqual(['A1', 'A2']);
    expect([...next.usedChunkIds]).toEqual(['A1', 'A2']);
  });

  it('does not increment songDiversityCount when the destination is the same song', () => {
    const a1 = findNode('A1');
    const a2 = findNode('A2'); // same songId ('songA') as A1
    const start = initialState(a1);

    const next = updateResources(start.resources, findEdge('A1', 'A2'), a2);

    expect(next.songDiversityCount).toBe(1);
    expect([...next.usedSongIds]).toEqual(['songA']);
  });

  it('increments songDiversityCount when the destination introduces a new song', () => {
    const a1 = findNode('A1');
    const a2 = findNode('A2');
    const b2 = findNode('B2'); // songId 'songB'
    const afterA2 = updateResources(initialState(a1).resources, findEdge('A1', 'A2'), a2);

    const afterB2 = updateResources(afterA2, findEdge('A2', 'B2'), b2);

    expect(afterB2.songDiversityCount).toBe(2);
    expect([...afterB2.usedSongIds]).toEqual(['songA', 'songB']);
    expect(afterB2.history).toEqual(['A1', 'A2', 'B2']);
  });

  it('keeps only the last 3 section types in recentSectionTypes', () => {
    const n1 = fakeNode('N1', 'songX', 'intro');
    const n2 = fakeNode('N2', 'songX', 'verse');
    const n3 = fakeNode('N3', 'songX', 'chorus');
    const n4 = fakeNode('N4', 'songX', 'outro');
    const edge: TransitionEdge = { from: 'x', to: 'y', signals: findEdge('A1', 'A2').signals };

    let resources = initialState(n1).resources;
    resources = updateResources(resources, edge, n2);
    resources = updateResources(resources, edge, n3);
    resources = updateResources(resources, edge, n4);

    expect(resources.recentSectionTypes).toEqual(['verse', 'chorus', 'outro']);
  });
});

function baseHardResources(overrides: Partial<SearchResources> = {}): SearchResources {
  const a1 = findNode('A1');
  const resources = updateResources(initialState(a1).resources, findEdge('A1', 'A2'), findNode('A2'));
  return { ...resources, ...overrides };
}

const noRepeatConstraint: HardConstraint = {
  name: 'no-repeat',
  check: (_edge, resources) => resources.history.filter((id) => id === resources.currentNodeId).length <= 1,
};

const maxDurationConstraint: HardConstraint = {
  name: 'max-duration',
  check: (_edge, resources) => resources.elapsedDurationBucket <= 100,
};

function configWith(hardConstraints: HardConstraint[]): PlannerConfig {
  return {
    hardConstraints,
    nodeWeights: {
      bpm: 0, key: 0, energy: 0, loudnessLufs: 0, guitarPresence: 0,
      vocalPresence: 0, danceability: 0, sectionType: 0, embedding: 0, genreDistribution: 0,
    },
    edgeWeights: {
      bpmDelta: 1, keyCompatibility: 1, beatAlignment: 1,
      embeddingSimilarity: 1, loudnessDelta: 1, estimatedCrossfadeSec: 1,
    },
    pathObjectiveWeights: { energyCurveAdherence: 0, diversity: 0, durationAdherence: 0, repetitionPenalty: 0 },
    targetDurationSec: 1800,
    targetEnergyCurve: [0.5],
    durationToleranceSec: 30,
  };
}

describe('isValidResources()', () => {
  it('passes when there are no hard constraints', () => {
    const resources = baseHardResources();
    expect(isValidResources(findEdge('A1', 'A2'), resources, configWith([]))).toBe(true);
  });

  it('rejects when a single hard constraint fails', () => {
    const resources = baseHardResources({ elapsedDurationBucket: 150 });
    expect(isValidResources(findEdge('A1', 'A2'), resources, configWith([maxDurationConstraint]))).toBe(false);
  });

  it('passes when a single hard constraint is satisfied', () => {
    const resources = baseHardResources({ elapsedDurationBucket: 50 });
    expect(isValidResources(findEdge('A1', 'A2'), resources, configWith([maxDurationConstraint]))).toBe(true);
  });

  it('rejects if any one of several constraints fails, even if others pass', () => {
    const resources = baseHardResources({ elapsedDurationBucket: 150 });
    expect(
      isValidResources(findEdge('A1', 'A2'), resources, configWith([noRepeatConstraint, maxDurationConstraint]))
    ).toBe(false);
  });

  it('rejects a genuine repeat via the no-repeat constraint', () => {
    // Simulates a resources snapshot where the current node ('A1') already
    // appeared earlier in history — i.e. this transition revisited it.
    const repeated = baseHardResources({ currentNodeId: 'A1', history: ['A1', 'A2', 'A1'] });
    expect(isValidResources(findEdge('A2', 'A1'), repeated, configWith([noRepeatConstraint]))).toBe(false);
  });

  it('forwards a real calibrate function to the constraint check', () => {
    let receivedCalibrate: typeof calibrate | undefined;
    const capturing: HardConstraint = {
      name: 'capture-calibrate',
      check: (_edge, _resources, calibrateFn) => {
        receivedCalibrate = calibrateFn;
        return true;
      },
    };
    isValidResources(findEdge('A1', 'A2'), baseHardResources(), configWith([capturing]));
    expect(typeof receivedCalibrate).toBe('function');
    expect(receivedCalibrate!({ value: true, confidence: 1, detector: 't', version: '1' }, (v) => (v ? 1 : 0))).toBe(1);
  });
});

function state(currentNodeId: string, accumulatedScore: number, overrides: Partial<SearchResources> = {}): SearchState {
  const base = baseHardResources();
  return {
    accumulatedScore,
    resources: { ...base, currentNodeId, ...overrides },
  };
}

describe('compareStatesByScoreThenId()', () => {
  it('sorts by score descending', () => {
    const states = [state('A', 5), state('B', 10)];
    expect([...states].sort(compareStatesByScoreThenId).map((s) => s.resources.currentNodeId)).toEqual(['B', 'A']);
  });

  it('breaks score ties by currentNodeId ascending, deterministically', () => {
    const states = [state('C', 5), state('A', 5), state('B', 5)];
    expect([...states].sort(compareStatesByScoreThenId).map((s) => s.resources.currentNodeId)).toEqual(['A', 'B', 'C']);
  });
});

describe('selectDiverseBeam()', () => {
  it('merges candidates sharing a mergeKey, keeping only the higher-scoring one', () => {
    const shared: Partial<SearchResources> = { elapsedDurationBucket: 16, energyBucket: 0.5, currentKeyBucket: '8A', songDiversityCount: 1, recentSectionTypes: [] };
    const low = state('A2', 3, shared);
    const high = state('A2', 9, shared);
    const result = selectDiverseBeam([low, high], 5);
    expect(result).toHaveLength(1);
    expect(result[0].accumulatedScore).toBe(9);
  });

  it('keeps all candidates when width exceeds the deduped candidate count', () => {
    const result = selectDiverseBeam([state('A', 1), state('B', 2)], 10);
    expect(result).toHaveLength(2);
  });

  it('reserves beam slots for diversity instead of collapsing onto the single best-scoring node', () => {
    const dominantNode = [
      state('A', 10, { elapsedDurationBucket: 10 }),
      state('A', 9, { elapsedDurationBucket: 11 }),
      state('A', 8, { elapsedDurationBucket: 12 }),
      state('A', 7, { elapsedDurationBucket: 13 }),
      state('A', 6, { elapsedDurationBucket: 14 }),
    ];
    const diverseCandidate = state('B', 5, { elapsedDurationBucket: 99 });

    const result = selectDiverseBeam([...dominantNode, diverseCandidate], 3);

    const distinctNodes = new Set(result.map((s) => s.resources.currentNodeId));
    expect(distinctNodes.size).toBeGreaterThan(1);
    expect(result.some((s) => s.resources.currentNodeId === 'B')).toBe(true);
    // A naive top-3-by-score-alone selection would be [A(10), A(9), A(8)] — prove we didn't do that.
    expect(result.some((s) => s.accumulatedScore === 8)).toBe(false);
    // The diversity reservation must not under-fill the beam: once the
    // reserved slot is satisfied (B(5)), the next-best deferred candidate
    // (A(9)) should backfill the remaining slot up to full width.
    expect(result).toHaveLength(3);
    expect(result.some((s) => s.accumulatedScore === 9)).toBe(true);
  });

  it('returns exactly the available distinct-node candidates when there is nothing left to backfill', () => {
    const result = selectDiverseBeam([state('A', 10), state('B', 5)], 5);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.resources.currentNodeId).sort()).toEqual(['A', 'B']);
  });
});

describe('isWithinTargetDuration()', () => {
  it('is true when elapsed exactly matches target', () => {
    const resources = baseHardResources({ elapsedDurationBucket: 1800 });
    expect(isWithinTargetDuration(resources, configWith([]))).toBe(true);
  });

  it('is true at the exact tolerance boundary (inclusive)', () => {
    const resources = baseHardResources({ elapsedDurationBucket: 1830 }); // 30 over, tolerance is 30
    expect(isWithinTargetDuration(resources, configWith([]))).toBe(true);
  });

  it('is false just past the tolerance boundary', () => {
    const resources = baseHardResources({ elapsedDurationBucket: 1831 });
    expect(isWithinTargetDuration(resources, configWith([]))).toBe(false);
  });
});

describe('toRemixPlan()', () => {
  it('maps a SearchState to a well-formed RemixPlan with empty diagnostics', () => {
    const s = state('A2', 4.5, { history: ['A1', 'A2'], elapsedDurationBucket: 16 });
    const plan = toRemixPlan(s);
    expect(plan.chunkIds).toEqual(['A1', 'A2']);
    expect(plan.totalScore).toBe(4.5);
    expect(plan.estimatedDurationSec).toBe(16);
    expect(plan.diagnostics).toEqual({ nearFailedConstraints: [], prunedCandidateCount: 0 });
  });
});

describe('handleDeadEnd()', () => {
  it('returns a successful RemixPlan for the best state when within 3x tolerance', () => {
    const worse = state('A2', 1, { elapsedDurationBucket: 1700, history: ['A1', 'A2'] });
    const better = state('B2', 2, { elapsedDurationBucket: 1750, history: ['A1', 'B2'] });
    const config = configWith([]); // targetDurationSec 1800, durationToleranceSec 30 -> relaxed 90

    const result = handleDeadEnd([worse, better], config);

    expect(isPlanFailure(result)).toBe(false);
    expect((result as ReturnType<typeof toRemixPlan>).chunkIds).toEqual(['A1', 'B2']);
  });

  it('returns a well-formed failure, not a throw, when even the best state misses the relaxed tolerance', () => {
    const farOff = state('A2', 1, { elapsedDurationBucket: 100, history: ['A1', 'A2'] });
    const config = configWith([]); // target 1800, relaxed tolerance 90 -> 100 is nowhere close

    const result = handleDeadEnd([farOff], config);

    expect(isPlanFailure(result)).toBe(true);
    expect(result).toEqual({
      failure: 'no_valid_path',
      bestPartial: { chunkIds: ['A1', 'A2'], totalScore: 1, estimatedDurationSec: 100, diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 } },
    });
  });
});

const fixtureGraph = buildMusicGraph(synthNodes, synthEdges);

describe('planRemix()', () => {
  it('builds A1 -> A2 -> B2 and never traverses the known-bad B2->A3 edge, when the target is reachable', () => {
    const reachableConfig = { ...configWith([]), targetDurationSec: 24, durationToleranceSec: 4 };

    const result = planRemix(fixtureGraph, [findNode('A1')], reachableConfig, 4, 5);

    expect(isPlanFailure(result)).toBe(false);
    const plan = result as ReturnType<typeof toRemixPlan>;
    expect(plan.chunkIds).toEqual(['A1', 'A2', 'B2']);
    expect(plan.chunkIds).not.toContain('A3');
    expect(plan.estimatedDurationSec).toBe(24);
    expect(Number.isNaN(plan.totalScore)).toBe(false);
  });

  it('returns a successful plan via relaxed dead-end tolerance when the target is somewhat further away', () => {
    const config = { ...configWith([]), targetDurationSec: 32, durationToleranceSec: 4 }; // relaxed tolerance 12; dead-end at 24 is 8 away

    const result = planRemix(fixtureGraph, [findNode('A1')], config, 4, 5);

    expect(isPlanFailure(result)).toBe(false);
    const plan = result as ReturnType<typeof toRemixPlan>;
    expect(plan.chunkIds).toEqual(['A1', 'A2', 'B2']);
    expect(plan.chunkIds).not.toContain('A3');
  });

  it('returns a well-formed failure, not a throw or hang, when the target is unreachable even at relaxed tolerance', () => {
    const config = { ...configWith([]), targetDurationSec: 200, durationToleranceSec: 2 }; // relaxed tolerance 6; dead-end at 24 is nowhere close

    const result = planRemix(fixtureGraph, [findNode('A1')], config, 4, 5);

    expect(isPlanFailure(result)).toBe(true);
    const failure = result as { failure: 'no_valid_path'; bestPartial?: { chunkIds: string[] } };
    expect(failure.failure).toBe('no_valid_path');
    expect(failure.bestPartial?.chunkIds).toEqual(['A1', 'A2', 'B2']);
    expect(failure.bestPartial?.chunkIds).not.toContain('A3');
  });

  it('produces identical output for identical inputs, run twice', () => {
    const config = { ...configWith([]), targetDurationSec: 24, durationToleranceSec: 4 };

    const first = planRemix(fixtureGraph, [findNode('A1')], config, 4, 5);
    const second = planRemix(fixtureGraph, [findNode('A1')], config, 4, 5);

    expect(second).toEqual(first);
  });

  it('returns a well-formed failure instead of throwing when startCandidates is empty', () => {
    const config = { ...configWith([]), targetDurationSec: 24, durationToleranceSec: 4 };
    const result = planRemix(fixtureGraph, [], config, 4, 5);
    expect(isPlanFailure(result)).toBe(true);
    expect((result as { failure: string }).failure).toBe('no_valid_path');
  });

  it('returns a well-formed failure instead of throwing when beamWidth is 0', () => {
    const config = { ...configWith([]), targetDurationSec: 24, durationToleranceSec: 4 };
    const result = planRemix(fixtureGraph, [findNode('A1')], config, 0, 5);
    expect(isPlanFailure(result)).toBe(true);
    expect((result as { failure: string }).failure).toBe('no_valid_path');
  });
});
