import { initialState, updateResources } from '../lib';
import { ChunkNode, Measurement, SectionType, TransitionEdge } from '../../core';
import { synthEdges, synthNodes } from '../../../test-data/synthetic/graph';
import { isValidResources } from '../lib';
import { calibrate } from '../../scorer';
import { HardConstraint, PlannerConfig, SearchResources } from '../../core';

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
