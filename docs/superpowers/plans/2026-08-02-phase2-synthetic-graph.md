# Phase 2 — Synthetic Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** prove the `MusicGraph` interface from `src/core/` actually works — an in-memory implementation plus a hand-written fixture graph small enough to reason about by hand, exercised with zero dependency on audio, FFmpeg, or DSP.

**Architecture:** `src/graph/` gets the same four-file shape as `src/core/` (`types.ts`, `lib.ts`, `utils.ts`, `index.ts`, `__test__/`). The fixture data itself lives outside `src/` in `test-data/synthetic/`, since it's test data every later phase (3, 4) will import, not production source. `src/graph/lib.ts` provides one function, `buildMusicGraph()`, that turns arrays of `ChunkNode`/`TransitionEdge` into an object satisfying `MusicGraph` — no algorithms, no persistence (that's Phase 5).

**Tech Stack:** same as Phase 0/1 — TypeScript 5 strict, Jest + ts-jest, ESLint's `import/no-restricted-paths`.

## Global Constraints

- TypeScript `strict: true` for all source and test files.
- Every returned graph structure is immutable at the type level (ADR-002) — `MusicGraph.nodes`/`.edges` are `ReadonlyMap`s already in `src/core/types.ts`; nothing in this plan may weaken that.
- File convention (established for `src/core/`, documented in `docs/implementation.md` §2): every module folder gets exactly `types.ts`, `lib.ts`, `utils.ts`, `index.ts`, and a `__test__/` folder — present even when a category is empty (`export {};`). No freeform file names.
- Comment convention (established this session): comments only where the code isn't self-explanatory — sharp, short, no restating what the type/name already says.
- `src/graph/` depends on `src/core/` only — enforced by the existing `eslint.config.js` zone; do not add new zones.
- Cross-module imports go through the target module's barrel (`import { X } from '../core'`), never reaching into a sibling module's `types.ts`/`lib.ts` directly.
- Commit after every task using the message style `feat(scope): summary`.
- The synthetic fixture's signal values must match `docs/implementation.md` §6 exactly (the known-good/known-bad/known-mediocre edges) — Phase 3 and Phase 4 validate against this fixture, so its correctness matters as much as production code.

---

## File Structure

```
mixforge/
  test-data/
    synthetic/
      graph.ts          # hand-written ChunkNode[]/TransitionEdge[] fixture
      graph.test.ts      # asserts the fixture's own shape/values are correct
  src/
    graph/
      types.ts           # empty for Phase 2 — no new types needed yet
      lib.ts              # buildMusicGraph(nodes, edges): MusicGraph
      utils.ts            # empty for Phase 2
      __test__/
        lib.test.ts        # buildMusicGraph() behavior + immutability
        index.test.ts       # barrel re-export check
      index.ts             # barrel: re-exports types.ts + lib.ts + utils.ts
```

---

### Task 1: Synthetic graph fixture

**Files:**
- Create: `test-data/synthetic/graph.ts`
- Test: `test-data/synthetic/graph.test.ts`

**Interfaces:**
- Consumes: `ChunkNode`, `TransitionEdge`, `NodeSignals`, `EdgeSignals`, `Measurement` — all from `../../src/core` (the barrel).
- Produces: `synthNodes: readonly ChunkNode[]` (6 chunks: `A1`,`A2`,`A3`,`B1`,`B2`,`B3`), `synthEdges: readonly TransitionEdge[]` (4 edges: `A1->A2`, `A2->B2`, `B2->A3`, `A1->B1`) — consumed by Task 2's tests and by Phase 3/4 later.

Every `Measurement` in this fixture uses `detector: 'synthetic'`, `version: '1.0.0'`, `confidence: 1` — it's hand-authored ground truth, not real detector output, so a single tag makes that obvious rather than inventing fake detector names.

- [ ] **Step 1: Write the failing test**

```ts
// test-data/synthetic/graph.test.ts
import { synthNodes, synthEdges } from './graph';

describe('synthetic graph fixture', () => {
  it('has the 6 chunks across 2 songs described in implementation.md §6', () => {
    expect(synthNodes.map(n => n.id).sort()).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
    expect(synthNodes.filter(n => n.songId === 'songA')).toHaveLength(3);
    expect(synthNodes.filter(n => n.songId === 'songB')).toHaveLength(3);
  });

  it('has the 4 specified edges with the exact signal values from implementation.md §6', () => {
    const byPair = (from: string, to: string) => synthEdges.find(e => e.from === from && e.to === to);

    const a1a2 = byPair('A1', 'A2')!;
    expect(a1a2.signals.bpmDelta.value).toBe(0);
    expect(a1a2.signals.keyCompatibility.value).toBe(true);
    expect(a1a2.signals.embeddingSimilarity.value).toBe(0.9);

    const a2b2 = byPair('A2', 'B2')!;
    expect(a2b2.signals.bpmDelta.value).toBe(2);
    expect(a2b2.signals.keyCompatibility.value).toBe(true);
    expect(a2b2.signals.embeddingSimilarity.value).toBe(0.7);

    const b2a3 = byPair('B2', 'A3')!;
    expect(b2a3.signals.bpmDelta.value).toBe(25);
    expect(b2a3.signals.keyCompatibility.value).toBe(false);
    expect(b2a3.signals.embeddingSimilarity.value).toBe(0.2);

    const a1b1 = byPair('A1', 'B1')!;
    expect(a1b1.signals.bpmDelta.value).toBe(8);
    expect(a1b1.signals.keyCompatibility.value).toBe(true);
    expect(a1b1.signals.embeddingSimilarity.value).toBe(0.5);
  });

  it('has no edge from B2 elsewhere but the known-bad B2->A3', () => {
    expect(synthEdges.filter(e => e.from === 'B2')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test-data/synthetic/graph.test.ts`
Expected: FAIL — `Cannot find module './graph'`.

(This requires `jest.config.js`'s `testMatch` to also see files outside `src/`. Widen it in this step before writing the fixture:)

```js
// jest.config.js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/test-data/**/*.test.ts'],
};
```

- [ ] **Step 3: Write `test-data/synthetic/graph.ts`**

```ts
import { ChunkNode, Measurement, TransitionEdge } from '../../src/core';

function m<T>(value: T): Measurement<T> {
  return { value, confidence: 1, detector: 'synthetic', version: '1.0.0' };
}

function chunk(
  id: string,
  songId: string,
  startTimeSec: number,
  bpm: number,
  key: string,
  sectionType: 'intro' | 'verse' | 'chorus' | 'drop' | 'outro',
  energy: number
): ChunkNode {
  return {
    id,
    songId,
    startTimeSec,
    endTimeSec: startTimeSec + 8,
    bars: 4,
    signals: {
      bpm: m(bpm),
      key: m(key),
      energy: m(energy),
      loudnessLufs: m(-14),
      guitarPresence: m(0.3),
      vocalPresence: m(0.7),
      danceability: m(0.6),
      sectionType: m(sectionType),
      embedding: m(new Float32Array([energy, bpm / 200])),
      genreDistribution: m({ edm: 0.6, pop: 0.4 }),
    },
  };
}

function edge(
  from: string,
  to: string,
  bpmDelta: number,
  keyCompatible: boolean,
  beatAlignment: number,
  embeddingSimilarity: number,
  loudnessDelta: number,
  estimatedCrossfadeSec: number
): TransitionEdge {
  return {
    from,
    to,
    signals: {
      bpmDelta: m(bpmDelta),
      keyCompatibility: m(keyCompatible),
      beatAlignment: m(beatAlignment),
      embeddingSimilarity: m(embeddingSimilarity),
      loudnessDelta: m(loudnessDelta),
      estimatedCrossfadeSec: m(estimatedCrossfadeSec),
    },
  };
}

export const synthNodes: readonly ChunkNode[] = [
  chunk('A1', 'songA', 0, 124, '8A', 'intro', 0.3),
  chunk('A2', 'songA', 8, 124, '8A', 'verse', 0.5),
  chunk('A3', 'songA', 16, 101, '3A', 'chorus', 0.8),
  chunk('B1', 'songB', 0, 132, '8B', 'intro', 0.3),
  chunk('B2', 'songB', 8, 126, '9A', 'drop', 0.9),
  chunk('B3', 'songB', 16, 130, '9A', 'outro', 0.3),
];

export const synthEdges: readonly TransitionEdge[] = [
  edge('A1', 'A2', 0, true, 0.95, 0.9, 0.3, 4),   // good
  edge('A2', 'B2', 2, true, 0.85, 0.7, 0.8, 4),   // good
  edge('B2', 'A3', 25, false, 0.3, 0.2, 3.5, 8),  // bad
  edge('A1', 'B1', 8, true, 0.6, 0.5, 1.5, 6),     // mediocre
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test-data/synthetic/graph.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add jest.config.js test-data/synthetic/graph.ts test-data/synthetic/graph.test.ts
git commit -m "feat(test-data): add Phase 2 synthetic graph fixture"
```

---

### Task 2: `buildMusicGraph()`

**Files:**
- Create: `src/graph/types.ts`, `src/graph/lib.ts`, `src/graph/utils.ts`
- Test: `src/graph/__test__/lib.test.ts`

**Interfaces:**
- Consumes: `ChunkNode`, `TransitionEdge`, `MusicGraph` from `../core` (barrel); `synthNodes`, `synthEdges` from `../../../test-data/synthetic/graph` (Task 1).
- Produces: `buildMusicGraph(nodes: readonly ChunkNode[], edges: readonly TransitionEdge[]): MusicGraph` — consumed by Phase 3's scorer tests and Phase 4's planner tests against this same fixture.

- [ ] **Step 1: Write the failing test**

```ts
// src/graph/__test__/lib.test.ts
import { buildMusicGraph } from '../lib';
import { synthNodes, synthEdges } from '../../../test-data/synthetic/graph';

describe('buildMusicGraph()', () => {
  it('returns the two outgoing edges of A1 with their exact signal values', () => {
    const graph = buildMusicGraph(synthNodes, synthEdges);
    const outgoing = graph.getOutgoingEdges('A1');

    expect(outgoing.map(e => e.to).sort()).toEqual(['A2', 'B1']);
    const toA2 = outgoing.find(e => e.to === 'A2')!;
    expect(toA2.signals.bpmDelta.value).toBe(0);
    expect(toA2.signals.embeddingSimilarity.value).toBe(0.9);
  });

  it('returns undefined for a node id that does not exist', () => {
    const graph = buildMusicGraph(synthNodes, synthEdges);
    expect(graph.getNode('Z9')).toBeUndefined();
  });

  it('returns an empty array for a node with no outgoing edges', () => {
    const graph = buildMusicGraph(synthNodes, synthEdges);
    expect(graph.getOutgoingEdges('B3')).toEqual([]);
  });

  it('is immutable at the type level — mutating nodes/edges is a compile error', () => {
    const graph = buildMusicGraph(synthNodes, synthEdges);
    // @ts-expect-error ReadonlyMap has no `set` — this must fail to compile.
    graph.nodes.set('X', synthNodes[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/graph/__test__/lib.test.ts`
Expected: FAIL — `Cannot find module '../lib'`.

- [ ] **Step 3: Write `src/graph/types.ts`**

```ts
// No new types for Phase 2 — buildMusicGraph() only consumes/returns core types.
export {};
```

- [ ] **Step 4: Write `src/graph/lib.ts`**

```ts
import { ChunkNode, MusicGraph, TransitionEdge } from '../core';

export function buildMusicGraph(nodes: readonly ChunkNode[], edges: readonly TransitionEdge[]): MusicGraph {
  const nodeMap = new Map(nodes.map(node => [node.id, node] as const));

  const edgeMap = new Map<string, TransitionEdge[]>();
  for (const edge of edges) {
    const outgoing = edgeMap.get(edge.from) ?? [];
    outgoing.push(edge);
    edgeMap.set(edge.from, outgoing);
  }

  return {
    nodes: nodeMap,
    edges: edgeMap,
    getOutgoingEdges: (nodeId) => edgeMap.get(nodeId) ?? [],
    getNode: (nodeId) => nodeMap.get(nodeId),
  };
}
```

- [ ] **Step 5: Write `src/graph/utils.ts`**

```ts
// No helpers yet.
export {};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/graph/__test__/lib.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add src/graph/types.ts src/graph/lib.ts src/graph/utils.ts src/graph/__test__/lib.test.ts
git commit -m "feat(graph): add buildMusicGraph()"
```

---

### Task 3: Barrel export

**Files:**
- Modify: `src/graph/index.ts` (currently the Phase 0 placeholder `export {};`)
- Test: `src/graph/__test__/index.test.ts`

**Interfaces:**
- Consumes: every export from `src/graph/types.ts`, `src/graph/lib.ts`, `src/graph/utils.ts` (Task 2).
- Produces: the single entry point later phases import from (`import { buildMusicGraph } from '../graph'`).

- [ ] **Step 1: Write the failing test**

```ts
// src/graph/__test__/index.test.ts
import * as graph from '../index';

describe('src/graph barrel export', () => {
  it('re-exports buildMusicGraph', () => {
    expect(typeof graph.buildMusicGraph).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/graph/__test__/index.test.ts`
Expected: FAIL — `graph.buildMusicGraph is not a function` (current `index.ts` is `export {};`).

- [ ] **Step 3: Replace `src/graph/index.ts`**

```ts
export * from './types';
export * from './lib';
export * from './utils';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/graph/__test__/index.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Run the full suite and lint together**

Run: `npm run lint && npm test && npm run build`
Expected: all exit 0 — every Phase 0/1 test still passes, plus this plan's 8 new tests (3 fixture + 4 lib + 1 barrel).

- [ ] **Step 6: Commit**

```bash
git add src/graph/index.ts src/graph/__test__/index.test.ts
git commit -m "feat(graph): add barrel export — Phase 2 synthetic graph complete"
```

**Phase 2 acceptance check (from `docs/implementation.md` §6):** `buildMusicGraph(synthNodes, synthEdges).getOutgoingEdges('A1')` returns exactly the two expected edges with correct signal values (Task 2, Step 1's first test) — confirmed. The graph is immutable at the type level, verified by a `@ts-expect-error` compile check, not just a lint rule (Task 2, Step 1's fourth test) — confirmed.

---

## Plan Self-Review Notes

- **Spec coverage:** `docs/implementation.md` §6's two deliverables — the hand-written fixture and the `MusicGraph` implementation — map to Task 1 and Task 2 respectively; the acceptance criteria (outgoing edges of A1, immutability as a type error) are both asserted directly in Task 2's test.
- **File convention adherence:** `src/graph/` gets `types.ts`/`lib.ts`/`utils.ts`/`index.ts` + `__test__/`, matching `docs/implementation.md` §2's convention exactly, including empty-but-present `types.ts`/`utils.ts` for this phase.
- **Type consistency:** `buildMusicGraph`'s parameter names (`nodes`, `edges`) and return type (`MusicGraph`) are used identically across Task 2's test and Task 3's barrel — no drift.
- **Fixture-first ordering:** Task 1 produces `synthNodes`/`synthEdges` before Task 2 needs them, avoiding the kind of forward-reference stub Phase 1's Task 8/9 needed.
