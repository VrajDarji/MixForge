# Phase 4 — Generic Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** implement `src/planner/`'s diverse beam search + approximate DP (`planRemix()`) fully working and tested against the Phase 2 synthetic graph (`test-data/synthetic/graph.ts`) and the Phase 3 scoring functions, per `docs/implementation.md` §8.

**Architecture:** `src/planner/` gets the same four-file shape as `src/core/`/`src/graph/`/`src/scorer/` (`types.ts`, `lib.ts`, `utils.ts`, `index.ts`, `__test__/`). `lib.ts` holds the search machinery: `initialState`, `updateResources`, `isValidResources`, `selectDiverseBeam`, `handleDeadEnd`, `toRemixPlan`, `isWithinTargetDuration`, and the top-level `planRemix`. `planRemix` takes a `MusicGraph` (the *interface*, declared in `src/core/types.ts`) directly — never a concrete graph implementation from `src/graph/` — so `src/planner/` never imports `src/graph/` at all, satisfying ADR-006 at the module-boundary level (enforced by the existing `eslint.config.js` zone) even though this phase's `planRemix` is a concrete music driver rather than a fully generic `SearchProblem`-parameterized function (see Global Constraints).

**Tech Stack:** same as Phases 0-3 — TypeScript 5 strict, Jest + ts-jest, ESLint's `import/no-restricted-paths`.

## Global Constraints

- TypeScript `strict: true` for all source and test files.
- `src/planner/` depends on `src/core/` and `src/scorer/` only — enforced by the existing `eslint.config.js` zone (`zone('planner', ['analysis', 'retrieval', 'graph', 'renderer', 'ai'])`); do not add new zones. `MusicGraph` is a `src/core/types.ts` interface, so accepting one as a parameter does **not** require importing `src/graph/`.
- **Deliberate scope decision, not a gap:** `planRemix(graph, startCandidates, config, beamWidth, maxSteps)` consumes a `MusicGraph` and calls `evaluateEdge`/`evaluateNode`/`evaluatePath` directly, matching `docs/implementation.md` §8's own pseudocode signature exactly. It does **not** route through the generic `SearchProblem<TNode,TResource,TEdge>` interface frozen in Phase 1. That interface remains satisfiable (proven by Phase 1's `searchProblem.test.ts` stub) and untouched; wiring a fully generic `runSearch()` on top of it is not required by any Phase 4 acceptance criterion in `implementation.md` §8/§13 and would be speculative generality. Do not add one.
- Deterministic tie-breaking is mandatory everywhere a list of `SearchState` is sorted or deduped: sort by `(accumulatedScore desc, resources.currentNodeId asc)`, never by insertion order alone. Use one shared comparator (`compareStatesByScoreThenId` in `utils.ts`) everywhere this is needed — do not reimplement the comparison inline more than once.
- `mergeKey()` (ADR-007) is imported from `../core` and used as-is — never reimplemented in `src/planner/` (per the comment on `SearchProblem.mergeKey` in `src/core/types.ts`: "must delegate to ./lib's mergeKey() — never reimplement").
- `SearchResources.recentSectionTypes` (Class B, "last N only" per its comment in `src/core/types.ts`) uses a window of **3** — small enough to matter for merge-key compression (ADR-007), large enough to carry short-term narrative context. This value is intentionally chosen in this plan since `models.md`/`design.md` don't pin a number.
- `RemixPlan.diagnostics` is populated minimally and correctly, not comprehensively: `prunedCandidateCount` and `nearFailedConstraints` are left as `0`/`[]` in every `RemixPlan` this phase produces. Full diagnostics wiring (tracking *why* candidates were pruned) is not required by any Phase 4 acceptance criterion — the field exists (per Phase 1's scope note) but populating it is out of scope here. Do not add pruning-reason tracking.
- File convention (`docs/implementation.md` §2): `src/planner/` gets exactly `types.ts`, `lib.ts`, `utils.ts`, `index.ts`, `__test__/` — no freeform file names, present even when empty.
- Cross-module imports go through the target module's barrel (`import { X } from '../core'`, `import { Y } from '../scorer'`).
- No duplicate-identifier imports: when a task adds new imports to a file another task already started, add them as separate `import` statements introducing only names not already imported earlier in the same file — never repeat an already-imported name across two `import` statements from the same module, or TypeScript raises a duplicate-identifier error.
- Commit after every task using the message style `feat(planner): summary`.
- All planner functions are pure — no owned state, no mutation of inputs (`SearchState`/`SearchResources`/`RemixPlan` are all `readonly`-typed already; do not cast away readonness).
- Never use non-null assertions (`!`) on `graph.getNode(...)` — `MusicGraph.getNode` returns `ChunkNode | undefined`; guard with a real check and skip the candidate, since a malformed graph must not crash the planner. This is a deliberate improvement over `implementation.md` §8's literal `graph.getNode(edge.to)!`.

---

## File Structure

```
mixforge/
  src/
    planner/
      types.ts           # PlanFailure, PlanResult
      lib.ts              # initialState, updateResources, isValidResources,
                           # selectDiverseBeam, handleDeadEnd, toRemixPlan,
                           # isWithinTargetDuration, planRemix
      utils.ts            # compareStatesByScoreThenId, isPlanFailure
      __test__/
        lib.test.ts        # all functions, one describe block each
        index.test.ts       # barrel re-export check
      index.ts             # barrel: re-exports types.ts + lib.ts + utils.ts
```

---

### Task 1: `initialState()` + `updateResources()`

**Files:**
- Create: `src/planner/lib.ts`, `src/planner/types.ts` (empty stub for now), `src/planner/utils.ts` (empty stub for now)
- Test: `src/planner/__test__/lib.test.ts`

**Interfaces:**
- Consumes: `ChunkNode`, `SearchState`, `SearchResources`, `TransitionEdge` from `../core` (barrel); `synthNodes`, `synthEdges` from `../../../test-data/synthetic/graph`.
- Produces: `initialState(node: ChunkNode): SearchState`, `updateResources(resources: SearchResources, edge: TransitionEdge, nextNode: ChunkNode): SearchResources` — consumed by `planRemix()` (Task 5).

- [ ] **Step 1: Write the failing test**

```ts
// src/planner/__test__/lib.test.ts
import { initialState, updateResources } from '../lib';
import { ChunkNode, Measurement, SectionType, TransitionEdge } from '../../core';
import { synthEdges, synthNodes } from '../../../test-data/synthetic/graph';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: FAIL — `Cannot find module '../lib'`.

- [ ] **Step 3: Write `src/planner/types.ts` (empty stub)**

```ts
// Populated in Task 4 with PlanFailure/PlanResult.
export {};
```

- [ ] **Step 4: Write `src/planner/utils.ts` (empty stub)**

```ts
// Populated in Task 3 with compareStatesByScoreThenId, Task 4 with isPlanFailure.
export {};
```

- [ ] **Step 5: Write `src/planner/lib.ts`**

```ts
import { ChunkNode, SearchResources, SearchState, TransitionEdge } from '../core';

// ADR-007 Class B: "last N only" per SearchResources.recentSectionTypes's
// comment in core/types.ts — 3 is small enough to matter for merge-key
// compression, large enough to carry short-term narrative context.
const RECENT_SECTION_WINDOW = 3;

export function initialState(node: ChunkNode): SearchState {
  return {
    accumulatedScore: 0,
    resources: {
      elapsedDurationBucket: node.endTimeSec - node.startTimeSec,
      energyBucket: node.signals.energy.value,
      currentKeyBucket: node.signals.key.value,
      currentNodeId: node.id,
      songDiversityCount: 1,
      recentSectionTypes: [node.signals.sectionType.value],
      usedChunkIds: new Set([node.id]),
      usedSongIds: new Set([node.songId]),
      history: [node.id],
    },
  };
}

export function updateResources(
  resources: SearchResources,
  _edge: TransitionEdge,
  nextNode: ChunkNode
): SearchResources {
  const isNewSong = !resources.usedSongIds.has(nextNode.songId);
  return {
    elapsedDurationBucket: resources.elapsedDurationBucket + (nextNode.endTimeSec - nextNode.startTimeSec),
    energyBucket: nextNode.signals.energy.value,
    currentKeyBucket: nextNode.signals.key.value,
    currentNodeId: nextNode.id,
    songDiversityCount: resources.songDiversityCount + (isNewSong ? 1 : 0),
    recentSectionTypes: [...resources.recentSectionTypes, nextNode.signals.sectionType.value].slice(
      -RECENT_SECTION_WINDOW
    ),
    usedChunkIds: new Set([...resources.usedChunkIds, nextNode.id]),
    usedSongIds: new Set([...resources.usedSongIds, nextNode.songId]),
    history: [...resources.history, nextNode.id],
  };
}
```

`_edge` is unused by this function today (only the destination node's own signals drive resource updates) but is kept as a parameter because `planRemix` (Task 5) always has both the edge and the destination node in hand at the call site, and a future resource field derived from the transition itself (e.g. a crossfade-time budget) would need it — prefixed `_` so `noUnusedParameters`-style lint doesn't flag it while documenting the reason it's still part of the signature.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/planner/lib.ts src/planner/types.ts src/planner/utils.ts src/planner/__test__/lib.test.ts
git commit -m "feat(planner): add initialState() and updateResources()"
```

---

### Task 2: `isValidResources()`

**Files:**
- Modify: `src/planner/lib.ts`
- Test: `src/planner/__test__/lib.test.ts`

**Interfaces:**
- Consumes: `calibrate` from `../scorer`; `HardConstraint`, `PlannerConfig`, `SearchResources`, `TransitionEdge` from `../core`.
- Produces: `isValidResources(edge: TransitionEdge, resources: SearchResources, config: PlannerConfig): boolean` — consumed by `planRemix()` (Task 5).

- [ ] **Step 1: Write the failing test**

Add these import lines directly below the existing ones at the top of `src/planner/__test__/lib.test.ts` — as separate `import` statements introducing only new names:

```ts
import { isValidResources } from '../lib';
import { calibrate } from '../../scorer';
import { HardConstraint, PlannerConfig, SearchResources } from '../../core';
```

Then append the following to the end of the file:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: FAIL — `isValidResources is not a function`.

- [ ] **Step 3: Append `isValidResources()` to `src/planner/lib.ts`**

Add these import lines directly below the existing one at the top of `src/planner/lib.ts` — as separate `import` statements introducing only new names:

```ts
import { HardConstraint, PlannerConfig } from '../core';
import { calibrate } from '../scorer';
```

Then append the following to the end of the file:

```ts
export function isValidResources(edge: TransitionEdge, resources: SearchResources, config: PlannerConfig): boolean {
  return config.hardConstraints.every((constraint: HardConstraint) => constraint.check(edge, resources, calibrate));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: PASS, 11 tests (5 from Task 1 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/planner/lib.ts src/planner/__test__/lib.test.ts
git commit -m "feat(planner): add isValidResources()"
```

---

### Task 3: `selectDiverseBeam()`

**Files:**
- Modify: `src/planner/lib.ts`, `src/planner/utils.ts`
- Test: `src/planner/__test__/lib.test.ts`

**Interfaces:**
- Consumes: `mergeKey` from `../core`; `SearchState` from `../core`.
- Produces: `compareStatesByScoreThenId(a: SearchState, b: SearchState): number` (utility), `selectDiverseBeam(candidates: SearchState[], width: number): SearchState[]` — consumed by `planRemix()` (Task 5).

- [ ] **Step 1: Write the failing test**

Add these import lines directly below the existing ones at the top of `src/planner/__test__/lib.test.ts` — as separate `import` statements introducing only new names:

```ts
import { selectDiverseBeam } from '../lib';
import { compareStatesByScoreThenId } from '../utils';
import { SearchState } from '../../core';
```

Then append the following to the end of the file:

```ts
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
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: FAIL — `selectDiverseBeam is not a function`.

- [ ] **Step 3: Write `src/planner/utils.ts`**

```ts
import { SearchState } from '../core';

// Deterministic ordering everywhere a SearchState[] is sorted or deduped:
// higher score first; ties broken by currentNodeId so re-running with
// identical inputs always produces identical output (never insertion order).
export function compareStatesByScoreThenId(a: SearchState, b: SearchState): number {
  if (b.accumulatedScore !== a.accumulatedScore) return b.accumulatedScore - a.accumulatedScore;
  return a.resources.currentNodeId < b.resources.currentNodeId ? -1 : 1;
}
```

- [ ] **Step 4: Append `selectDiverseBeam()` to `src/planner/lib.ts`**

Add this import line directly below the existing ones at the top of `src/planner/lib.ts` — as a separate `import` statement introducing only new names:

```ts
import { mergeKey } from '../core';
import { compareStatesByScoreThenId } from './utils';
```

Then append the following to the end of the file:

```ts
// ADR-007 merge (approximate DP: two states sharing a mergeKey are TREATED as
// equivalent, not proven so — keep only the better-scoring one) + ADR-008
// diversity (reserve beam slots so the beam doesn't collapse onto every
// continuation of the single highest-scoring prefix).
export function selectDiverseBeam(candidates: SearchState[], width: number): SearchState[] {
  const byKey = new Map<string, SearchState>();
  for (const candidate of candidates) {
    const key = mergeKey(candidate.resources);
    const existing = byKey.get(key);
    if (!existing || candidate.accumulatedScore > existing.accumulatedScore) byKey.set(key, candidate);
  }

  const merged = [...byKey.values()].sort(compareStatesByScoreThenId);
  const selected: SearchState[] = [];
  const nodeCounts = new Map<string, number>();
  for (const candidate of merged) {
    if (selected.length >= width) break;
    const count = nodeCounts.get(candidate.resources.currentNodeId) ?? 0;
    if (count >= 1 && selected.length < width - 1) continue;
    selected.push(candidate);
    nodeCounts.set(candidate.resources.currentNodeId, count + 1);
  }
  return selected;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: PASS, 16 tests (11 from Tasks 1-2 + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/planner/lib.ts src/planner/utils.ts src/planner/__test__/lib.test.ts
git commit -m "feat(planner): add selectDiverseBeam() (ADR-007 merge + ADR-008 diversity)"
```

---

### Task 4: `handleDeadEnd()` + `toRemixPlan()` + `isWithinTargetDuration()`

**Files:**
- Modify: `src/planner/lib.ts`, `src/planner/types.ts`, `src/planner/utils.ts`
- Test: `src/planner/__test__/lib.test.ts`

**Interfaces:**
- Consumes: `compareStatesByScoreThenId` (Task 3); `PlannerConfig`, `RemixPlan`, `SearchResources`, `SearchState` from `../core`.
- Produces: `PlanFailure`, `PlanResult`, `isWithinTargetDuration(resources, config): boolean`, `toRemixPlan(state: SearchState): RemixPlan`, `handleDeadEnd(beam: SearchState[], config: PlannerConfig): PlanResult`, `isPlanFailure(result: PlanResult): result is PlanFailure` — consumed by `planRemix()` (Task 5).

- [ ] **Step 1: Write the failing test**

Add these import lines directly below the existing ones at the top of `src/planner/__test__/lib.test.ts` — as separate `import` statements introducing only new names:

```ts
import { handleDeadEnd, isWithinTargetDuration, toRemixPlan } from '../lib';
import { isPlanFailure } from '../utils';
```

Then append the following to the end of the file:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: FAIL — `toRemixPlan is not a function`.

- [ ] **Step 3: Write `src/planner/types.ts`**

```ts
import { RemixPlan } from '../core';

export interface PlanFailure {
  readonly failure: 'no_valid_path';
  readonly bestPartial?: RemixPlan;
}

export type PlanResult = RemixPlan | PlanFailure;
```

- [ ] **Step 4: Append `isPlanFailure()` to `src/planner/utils.ts`**

Add this import line directly below the existing one at the top of `src/planner/utils.ts` — as a separate `import` statement introducing only new names:

```ts
import { PlanFailure, PlanResult } from './types';
```

Then append the following to the end of the file:

```ts
export function isPlanFailure(result: PlanResult): result is PlanFailure {
  return 'failure' in result;
}
```

- [ ] **Step 5: Append `isWithinTargetDuration()`, `toRemixPlan()`, `handleDeadEnd()` to `src/planner/lib.ts`**

Add these import lines directly below the existing ones at the top of `src/planner/lib.ts` — as separate `import` statements introducing only new names:

```ts
import { RemixPlan } from '../core';
import { PlanResult } from './types';
```

Then append the following to the end of the file:

```ts
export function isWithinTargetDuration(resources: SearchResources, config: PlannerConfig): boolean {
  return Math.abs(resources.elapsedDurationBucket - config.targetDurationSec) <= config.durationToleranceSec;
}

export function toRemixPlan(state: SearchState): RemixPlan {
  return {
    chunkIds: state.resources.history,
    totalScore: state.accumulatedScore,
    estimatedDurationSec: state.resources.elapsedDurationBucket,
    diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 },
  };
}

export function handleDeadEnd(beam: SearchState[], config: PlannerConfig): PlanResult {
  const best = [...beam].sort(compareStatesByScoreThenId)[0];
  const relaxedTolerance = config.durationToleranceSec * 3;
  if (Math.abs(best.resources.elapsedDurationBucket - config.targetDurationSec) <= relaxedTolerance) {
    return toRemixPlan(best);
  }
  return { failure: 'no_valid_path', bestPartial: toRemixPlan(best) };
}
```

`handleDeadEnd` assumes `beam` is non-empty — `planRemix` (Task 5) only calls it with the beam surviving the previous successful step, which is never empty by construction.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: PASS, 23 tests (17 from Tasks 1-3, after Task 3's post-review fix added one test, + 6 new).

- [ ] **Step 7: Commit**

```bash
git add src/planner/lib.ts src/planner/types.ts src/planner/utils.ts src/planner/__test__/lib.test.ts
git commit -m "feat(planner): add handleDeadEnd(), toRemixPlan(), isWithinTargetDuration()"
```

---

### Task 5: `planRemix()`

**Files:**
- Modify: `src/planner/lib.ts`
- Test: `src/planner/__test__/lib.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4; `evaluateEdge`, `evaluateNode`, `evaluatePath` from `../scorer`; `MusicGraph`, `ChunkNode` from `../core`; `buildMusicGraph` from `../graph` **in the test file only** (`src/planner/lib.ts` itself never imports `../graph` — only the test wires a concrete graph via `buildMusicGraph` and passes it in as a `MusicGraph`-typed value).
- Produces: `planRemix(graph: MusicGraph, startCandidates: readonly ChunkNode[], config: PlannerConfig, beamWidth: number, maxSteps: number): PlanResult` — the phase's headline deliverable, consumed by Phase 6's renderer (via the CLI wiring in Phase 8) and exercised directly by this task's tests.

- [ ] **Step 1: Write the failing test**

Add these import lines directly below the existing ones at the top of `src/planner/__test__/lib.test.ts` — as separate `import` statements introducing only new names. Note `buildMusicGraph` is imported here from `../../graph` (test-only; `src/planner/lib.ts` itself never imports it, per this task's Interfaces note):

```ts
import { planRemix } from '../lib';
import { buildMusicGraph } from '../../graph';
```

Then append the following to the end of the file. These three tests run against the **real Phase 2 fixture** (`test-data/synthetic/graph.ts`): `A1` has two outgoing edges (`A1->A2` good, `A1->B1` mediocre); `B1` has no outgoing edges at all; `A2->B2` is good; `B2`'s only outgoing edge, `B2->A3`, is the known-bad one Phase 3 already proved `evaluateEdge` marks infeasible. So the only path the planner can ever build beyond two chunks is `A1 -> A2 -> B2`, and it structurally dead-ends there — this fixture naturally exercises both success and dead-end handling without needing an artificial graph:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: FAIL — `planRemix is not a function`.

- [ ] **Step 3: Append `planRemix()` to `src/planner/lib.ts`**

Add this import line directly below the existing ones at the top of `src/planner/lib.ts` — as a separate `import` statement introducing only new names:

```ts
import { MusicGraph } from '../core';
import { evaluateEdge, evaluateNode, evaluatePath } from '../scorer';
```

Then append the following to the end of the file:

```ts
export function planRemix(
  graph: MusicGraph,
  startCandidates: readonly ChunkNode[],
  config: PlannerConfig,
  beamWidth: number,
  maxSteps: number
): PlanResult {
  let beam: SearchState[] = startCandidates.map(initialState).sort(compareStatesByScoreThenId);

  for (let step = 0; step < maxSteps; step++) {
    const candidates: SearchState[] = [];

    for (const currentState of beam) {
      for (const edge of graph.getOutgoingEdges(currentState.resources.currentNodeId)) {
        const evalResult = evaluateEdge(edge, config);
        if (!evalResult.feasible) continue; // ADR-005 stage 1: catastrophic transitions never reach scoring

        const nextNode = graph.getNode(edge.to);
        if (!nextNode) continue; // malformed graph: edge points at a node that doesn't exist — skip, don't crash

        const nextResources = updateResources(currentState.resources, edge, nextNode);
        if (!isValidResources(edge, nextResources, config)) continue;

        const score =
          currentState.accumulatedScore +
          evalResult.qualityScore +
          evaluateNode(nextNode, config) +
          evaluatePath(nextResources, config);

        candidates.push({ accumulatedScore: score, resources: nextResources });
      }
    }

    if (candidates.length === 0) return handleDeadEnd(beam, config);

    beam = selectDiverseBeam(candidates, beamWidth);

    if (beam.some((s) => isWithinTargetDuration(s.resources, config))) break;
  }

  const finished = beam.filter((s) => isWithinTargetDuration(s.resources, config)).sort(compareStatesByScoreThenId);
  if (finished.length > 0) return toRemixPlan(finished[0]);

  const bestOverall = [...beam].sort(compareStatesByScoreThenId)[0];
  return { failure: 'no_valid_path', bestPartial: toRemixPlan(bestOverall) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/planner/__test__/lib.test.ts`
Expected: PASS, 27 tests (23 from Tasks 1-4 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/planner/lib.ts src/planner/__test__/lib.test.ts
git commit -m "feat(planner): add planRemix() diverse beam search + approximate DP"
```

---

### Task 6: Barrel export + Phase 4 sign-off

**Files:**
- Modify: `src/planner/index.ts` (currently the Phase 0 placeholder `export {};`)
- Test: `src/planner/__test__/index.test.ts`

**Interfaces:**
- Consumes: every export from `src/planner/types.ts`, `src/planner/lib.ts`, `src/planner/utils.ts` (Tasks 1-5).
- Produces: the single entry point Phase 8's CLI imports from (`import { planRemix, isPlanFailure } from '../planner'`) — not Phase 6's renderer, which `eslint.config.js`'s `renderer` zone forbids from importing `src/planner`; the renderer only ever consumes `RemixPlan`, a `src/core` type.

- [ ] **Step 1: Write the failing test**

```ts
// src/planner/__test__/index.test.ts
import * as planner from '../index';

describe('src/planner barrel export', () => {
  it('re-exports planRemix, initialState, selectDiverseBeam, handleDeadEnd, isPlanFailure', () => {
    expect(typeof planner.planRemix).toBe('function');
    expect(typeof planner.initialState).toBe('function');
    expect(typeof planner.updateResources).toBe('function');
    expect(typeof planner.isValidResources).toBe('function');
    expect(typeof planner.selectDiverseBeam).toBe('function');
    expect(typeof planner.handleDeadEnd).toBe('function');
    expect(typeof planner.toRemixPlan).toBe('function');
    expect(typeof planner.isWithinTargetDuration).toBe('function');
    expect(typeof planner.isPlanFailure).toBe('function');
    expect(typeof planner.compareStatesByScoreThenId).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/planner/__test__/index.test.ts`
Expected: FAIL — `planner.planRemix is not a function` (current `index.ts` is `export {};`).

- [ ] **Step 3: Replace `src/planner/index.ts`**

```ts
export * from './types';
export * from './lib';
export * from './utils';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/planner/__test__/index.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Run the full suite, lint, and build together**

Run: `npm run lint && npm test && npm run build`
Expected: all exit 0 — every Phase 0-3 test still passes, plus this plan's 30 new tests (29 in `lib.test.ts`, after Task 3's and Task 5's post-review fixes each added tests, + 1 in `index.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/planner/index.ts src/planner/__test__/index.test.ts
git commit -m "feat(planner): add barrel export — Phase 4 generic planner complete"
```

- [ ] **Step 7: Confirm Phase 4 acceptance criteria from `docs/implementation.md` §8 and §13**

Manually verify (no further code changes):
- [ ] On the Phase 2 fixture, the planner reliably avoids `B2 -> A3` (the known-bad edge) in every returned path (Task 5, all 4 tests assert `not.toContain('A3')`).
- [ ] A fixture with no valid continuation from some reachable state exercises `handleDeadEnd` and returns a well-formed failure result rather than throwing or hanging (Task 5, test 3, and Task 4's direct `handleDeadEnd` failure test).
- [ ] Beam collapse is directly testable: a fixture where one prefix dominates by score results in a final beam containing more than one distinct `currentNodeId` (Task 3, "reserves beam slots for diversity" test).
- [ ] Running the same request twice with the same inputs produces identical output (Task 5, "produces identical output" test), backed by deterministic tie-breaking in both merge and diverse-selection sorts (Task 3's `compareStatesByScoreThenId`, used everywhere a `SearchState[]` is sorted).

---

## Plan Self-Review Notes

- **Spec coverage:** `docs/implementation.md` §8's pieces — the main `planRemix` loop, §8.1's hard-constraint evaluation, §8.2's merge + diverse selection, §8.3's dead-end handling — map to Tasks 5, 2, 3, 4 respectively (state construction, a prerequisite for all of them, is Task 1). All four Phase 4 acceptance criteria from §8/§13 are asserted directly, not incidentally.
- **Real fixture reuse over invented ones:** Task 5's dead-end and bad-edge-avoidance tests use the *actual* Phase 2 synthetic graph rather than a bespoke fixture — `B1`'s complete lack of outgoing edges and `B2->A3`'s pre-proven infeasibility (Phase 3) mean the real fixture already contains a natural dead end past `A1->A2->B2`, so no artificial "no continuation" graph needed to be invented. This also means Task 5 doubles as an end-to-end confirmation that Phase 3's `evaluateEdge` and Phase 4's `planRemix` compose correctly.
- **Determinism is structural, not incidental:** `compareStatesByScoreThenId` (Task 3) is the single comparator used in `selectDiverseBeam`'s merge-sort, `handleDeadEnd`'s best-pick, and `planRemix`'s final `finished`/`bestOverall` sorts — introduced once and reused, per this plan's Global Constraints, rather than four ad hoc `.sort((a,b) => b.accumulatedScore - a.accumulatedScore)` calls that could each drift out of sync with each other (and would be non-deterministic on score ties).
- **Documented deliberate deviations from `implementation.md`'s literal pseudocode:** (1) `planRemix` takes a concrete `MusicGraph`, not a `SearchProblem`, matching the doc's own snippet rather than over-generalizing; (2) `graph.getNode(edge.to)!`'s non-null assertion is replaced with a real guard; (3) `updateResources` takes `(resources, edge, nextNode)` — three arguments — rather than the two-argument shape in `SearchProblem.updateResources(resource, edge)`, because computing Class A fields (`energyBucket`, `currentKeyBucket`) requires the destination node's own signals, which the edge alone doesn't carry; this is `planRemix`'s own concrete helper, not an implementation of the generic interface method, so the arity mismatch is not a bug. All three are called out in Global Constraints so a reviewer isn't surprised.
- **Type consistency:** `PlanResult = RemixPlan | PlanFailure` (Task 4) is the return type of both `handleDeadEnd` and `planRemix` (Task 5) — no drift. `toRemixPlan`'s field mapping (`chunkIds` ← `history`, `totalScore` ← `accumulatedScore`, `estimatedDurationSec` ← `elapsedDurationBucket`) is established once in Task 4 and never reimplemented elsewhere.
- **Numeric verification:** every fixture-graph elapsed-duration value in Task 5 (16 after one chunk pair, 24 after `A1->A2->B2`) was hand-traced against `test-data/synthetic/graph.ts`'s actual `chunk()` durations (8 seconds each) and `updateResources`'s accumulation formula before being written into the plan.
