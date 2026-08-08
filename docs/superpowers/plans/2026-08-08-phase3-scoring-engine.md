# Phase 3 — Scoring Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** implement node/edge/path scoring (`src/scorer/`) fully working and tested against the Phase 2 synthetic graph fixture (`test-data/synthetic/graph.ts`) — still zero DSP dependency, per `docs/implementation.md` §7.

**Architecture:** `src/scorer/` gets the same four-file shape as `src/core/`/`src/graph/` (`types.ts`, `lib.ts`, `utils.ts`, `index.ts`, `__test__/`). Four pure functions live in `lib.ts`: `calibrate` (ADR-009 confidence lerp), `evaluateEdge` (ADR-005 two-stage feasibility + harsh quality composition), `evaluateNode` (ADR-004 compensatory intrinsic score), `evaluatePath` (compensatory path objectives). All four consume only `src/core/` types and the Phase 2 fixture; none touch the graph, DSP, or planner internals, per `docs/implementation.md` §3's ownership table ("scorer owns: score computation (pure functions, no owned state)").

**Tech Stack:** same as Phase 0/1/2 — TypeScript 5 strict, Jest + ts-jest, ESLint's `import/no-restricted-paths`.

## Global Constraints

- TypeScript `strict: true` for all source and test files.
- `calibrate()` implements ADR-009's lerp-toward-neutral formula exactly: `neutral + confidence * (raw - neutral)`, default `neutral = 0.5`.
- `evaluateEdge()` implements the two-stage ADR-005 pipeline: any calibrated dimension below `MIN_ACCEPTABLE = 0.3` hard-rejects the edge (`{ feasible: false, qualityScore: 0 }`); otherwise a harsh geometric-mean composition scores the survivors.
- **Deviation from `docs/implementation.md` §7.2's literal snippet:** that snippet's `calibrated` object uses shorthand keys (`bpm`, `key`, `beat`, `embedding`, `loudness`) that never match `keyof EdgeSignals` (`bpmDelta`, `keyCompatibility`, `beatAlignment`, `embeddingSimilarity`, `loudnessDelta`), so `config.edgeWeights[k as keyof EdgeSignals]` always misses and silently falls back to the default weight of `1` — every `edgeWeights` entry would be a no-op. This plan uses the real `EdgeSignals` key names throughout so `edgeWeights` actually takes effect.
- **Deviation from `docs/implementation.md` §7.3's literal snippet:** looping over every `nodeWeights` entry and calibrating it with `v => v` produces `NaN` for non-numeric signals (`key: string`, `sectionType: SectionType`, `embedding: Float32Array`, `genreDistribution: Record<string,number>`) — and `NaN` propagates through `+=` regardless of weight, including weight `0`. This plan restricts `evaluateNode()` to the six signals with a real linear numeric scale (`bpm`, `energy`, `loudnessLufs`, `guitarPresence`, `vocalPresence`, `danceability`); a nonzero weight on any other signal contributes `0`, never `NaN`.
- `evaluatePath()` implements exactly the three weighted terms from `docs/implementation.md` §7.4 (duration adherence, energy-curve adherence, diversity). `repetitionPenalty` is explicitly out of scope — the doc itself defers it to the planner (Phase 4), computed from `usedChunkIds`/`usedSongIds`, which `evaluatePath`'s inputs don't carry meaningfully on their own.
- File convention (`docs/implementation.md` §2): `src/scorer/` gets exactly `types.ts`, `lib.ts`, `utils.ts`, `index.ts`, `__test__/` — no freeform file names, present even when empty.
- `src/scorer/` depends on `src/core/` only — enforced by the existing `eslint.config.js` zone; do not add new zones.
- Cross-module imports go through the target module's barrel (`import { X } from '../core'`).
- Commit after every task using the message style `feat(scorer): summary`.
- All scoring functions are pure — no owned state, no mutation of inputs.

---

## File Structure

```
mixforge/
  src/
    scorer/
      types.ts           # EdgeEvalResult
      lib.ts              # calibrate(), evaluateEdge(), evaluateNode(), evaluatePath()
      utils.ts            # sampleEnergyCurve()
      __test__/
        lib.test.ts        # all four functions, one describe block each
        index.test.ts       # barrel re-export check
      index.ts             # barrel: re-exports types.ts + lib.ts + utils.ts
```

---

### Task 1: `calibrate()`

**Files:**
- Create: `src/scorer/lib.ts`, `src/scorer/types.ts` (empty stub for now), `src/scorer/utils.ts` (empty stub for now)
- Test: `src/scorer/__test__/lib.test.ts`

**Interfaces:**
- Consumes: `CalibrationFn`, `measurement` from `../../core` (barrel).
- Produces: `calibrate: CalibrationFn` — consumed by `evaluateEdge()` (Task 2) and `evaluateNode()` (Task 3) later in this same file.

- [ ] **Step 1: Write the failing test**

```ts
// src/scorer/__test__/lib.test.ts
import { calibrate } from '../lib';
import { measurement } from '../../core';

describe('calibrate()', () => {
  it('passes the raw value through unchanged at confidence 1.0', () => {
    const m = measurement(0.8, 1.0, 'test', '1.0.0');
    expect(calibrate(m, (v) => v)).toBeCloseTo(0.8);
  });

  it('fully replaces the raw value with neutral at confidence 0.0', () => {
    const m = measurement(0.8, 0.0, 'test', '1.0.0');
    expect(calibrate(m, (v) => v)).toBeCloseTo(0.5);
  });

  it('lerps proportionally at partial confidence', () => {
    const m = measurement(1.0, 0.5, 'test', '1.0.0');
    // neutral(0.5) + 0.5 * (1.0 - 0.5) = 0.75
    expect(calibrate(m, (v) => v)).toBeCloseTo(0.75);
  });

  it('respects a custom neutral point', () => {
    const m = measurement(0, 0.0, 'test', '1.0.0');
    expect(calibrate(m, (v) => v, 0.2)).toBeCloseTo(0.2);
  });

  it('lerps boolean-derived signals via toScalar', () => {
    const m = measurement(false, 0.1, 'test', '1.0.0');
    // neutral(0.5) + 0.1 * (0 - 0.5) = 0.45
    expect(calibrate(m, (v) => (v ? 1 : 0))).toBeCloseTo(0.45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/scorer/__test__/lib.test.ts`
Expected: FAIL — `Cannot find module '../lib'`.

- [ ] **Step 3: Write `src/scorer/types.ts` (empty stub)**

```ts
// Populated in Task 2 with EdgeEvalResult.
export {};
```

- [ ] **Step 4: Write `src/scorer/utils.ts` (empty stub)**

```ts
// Populated in Task 4 with sampleEnergyCurve().
export {};
```

- [ ] **Step 5: Write `src/scorer/lib.ts`**

```ts
import { CalibrationFn } from '../core';

// ADR-009: pulls low-confidence values toward neutral before harsh
// non-compensatory composition, rather than letting one noisy detector
// dominate. confidence 1.0 -> raw passes through; confidence 0.0 -> raw is
// fully replaced by neutral.
export const calibrate: CalibrationFn = (m, toScalar, neutral = 0.5) => {
  const raw = toScalar(m.value);
  return neutral + m.confidence * (raw - neutral);
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/scorer/__test__/lib.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/scorer/lib.ts src/scorer/types.ts src/scorer/utils.ts src/scorer/__test__/lib.test.ts
git commit -m "feat(scorer): add calibrate() (ADR-009)"
```

---

### Task 2: `evaluateEdge()`

**Files:**
- Modify: `src/scorer/types.ts`, `src/scorer/lib.ts`
- Test: `src/scorer/__test__/lib.test.ts`

**Interfaces:**
- Consumes: `calibrate` (Task 1); `EdgeSignals`, `PlannerConfig`, `TransitionEdge` from `../../core`; `synthEdges` from `../../../test-data/synthetic/graph` (Phase 2 fixture).
- Produces: `EdgeEvalResult { feasible: boolean; qualityScore: number }`, `evaluateEdge(edge, config): EdgeEvalResult` — consumed by Phase 4's planner.

- [ ] **Step 1: Write the failing test**

Add these import lines directly below the two existing ones at the top of `src/scorer/__test__/lib.test.ts` (from Task 1) — as separate `import` statements introducing only new names. Do not add `calibrate` or `measurement` again in these new lines; TypeScript raises a duplicate-identifier error if the same imported name appears twice in one file, even across separate `import` statements from the same module:

```ts
import { evaluateEdge } from '../lib';
import { EdgeSignals, PlannerConfig, TransitionEdge } from '../../core';
import { synthEdges } from '../../../test-data/synthetic/graph';
```

Then append the following to the end of the file (the existing `describe('calibrate()', ...)` block from Task 1 stays unchanged above it):

```ts
function baseEdgeWeights(overrides: Partial<Record<keyof EdgeSignals, number>> = {}): Record<keyof EdgeSignals, number> {
  return {
    bpmDelta: 1, keyCompatibility: 1, beatAlignment: 1,
    embeddingSimilarity: 1, loudnessDelta: 1, estimatedCrossfadeSec: 1,
    ...overrides,
  };
}

function baseConfig(overrides: Partial<PlannerConfig> = {}): PlannerConfig {
  return {
    hardConstraints: [],
    nodeWeights: {
      bpm: 0, key: 0, energy: 0, loudnessLufs: 0, guitarPresence: 0,
      vocalPresence: 0, danceability: 0, sectionType: 0, embedding: 0, genreDistribution: 0,
    },
    edgeWeights: baseEdgeWeights(),
    pathObjectiveWeights: { energyCurveAdherence: 1, diversity: 1, durationAdherence: 1, repetitionPenalty: 1 },
    targetDurationSec: 1800,
    targetEnergyCurve: [0.3, 0.6, 0.9, 0.5],
    durationToleranceSec: 30,
    ...overrides,
  };
}

function byPair(from: string, to: string): TransitionEdge {
  return synthEdges.find((e) => e.from === from && e.to === to)!;
}

function edgeWithKeyCompat(confidence: number): TransitionEdge {
  return {
    from: 'X1',
    to: 'X2',
    signals: {
      bpmDelta: measurement(0, 1, 'test', '1.0.0'),
      keyCompatibility: measurement(false, confidence, 'test', '1.0.0'),
      beatAlignment: measurement(1, 1, 'test', '1.0.0'),
      embeddingSimilarity: measurement(1, 1, 'test', '1.0.0'),
      loudnessDelta: measurement(0, 1, 'test', '1.0.0'),
      estimatedCrossfadeSec: measurement(4, 1, 'test', '1.0.0'),
    },
  };
}

describe('evaluateEdge()', () => {
  it('marks the known-bad B2->A3 fixture edge infeasible, not merely low-scoring', () => {
    const result = evaluateEdge(byPair('B2', 'A3'), baseConfig());
    expect(result.feasible).toBe(false);
    expect(result.qualityScore).toBe(0);
  });

  it('marks the known-good A1->A2 fixture edge feasible with a high quality score', () => {
    const result = evaluateEdge(byPair('A1', 'A2'), baseConfig());
    expect(result.feasible).toBe(true);
    expect(result.qualityScore).toBeGreaterThan(0.9);
  });

  it('ranks the known-good A1->A2 edge above the mediocre A1->B1 edge', () => {
    const good = evaluateEdge(byPair('A1', 'A2'), baseConfig());
    const mediocre = evaluateEdge(byPair('A1', 'B1'), baseConfig());
    expect(good.feasible).toBe(true);
    expect(mediocre.feasible).toBe(true);
    expect(good.qualityScore).toBeGreaterThan(mediocre.qualityScore);
  });

  it('lets a low-confidence bad keyCompatibility reading pass feasibility', () => {
    const result = evaluateEdge(edgeWithKeyCompat(0.1), baseConfig());
    expect(result.feasible).toBe(true);
  });

  it('lets the same bad keyCompatibility reading fail feasibility at high confidence', () => {
    const result = evaluateEdge(edgeWithKeyCompat(0.95), baseConfig());
    expect(result.feasible).toBe(false);
    expect(result.qualityScore).toBe(0);
  });

  it('changes qualityScore when edgeWeights change, without changing feasibility', () => {
    const defaultWeights = evaluateEdge(byPair('A1', 'A2'), baseConfig());
    const harsherEmbedding = evaluateEdge(
      byPair('A1', 'A2'),
      baseConfig({ edgeWeights: baseEdgeWeights({ embeddingSimilarity: 5 }) })
    );
    expect(defaultWeights.feasible).toBe(true);
    expect(harsherEmbedding.feasible).toBe(true);
    expect(harsherEmbedding.qualityScore).toBeLessThan(defaultWeights.qualityScore);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/scorer/__test__/lib.test.ts`
Expected: FAIL — `evaluateEdge is not a function`.

- [ ] **Step 3: Write `src/scorer/types.ts`**

```ts
// Scorer-only types. No logic — see ./lib.ts.

export interface EdgeEvalResult {
  readonly feasible: boolean;
  readonly qualityScore: number;
}
```

- [ ] **Step 4: Append `evaluateEdge()` to `src/scorer/lib.ts`**

Add these import lines directly below the existing `import { CalibrationFn } from '../core';` at the top of `src/scorer/lib.ts` (from Task 1) — as separate `import` statements introducing only new names. Do not add `CalibrationFn` again; TypeScript raises a duplicate-identifier error if the same imported name appears twice in one file, even across separate `import` statements from the same module:

```ts
import { EdgeSignals, PlannerConfig, TransitionEdge } from '../core';
import { EdgeEvalResult } from './types';
```

Then append the following to the end of the file (the existing `calibrate` declaration from Task 1 stays unchanged above it):

```ts
// ADR-005 feasibility stage: below this per-dimension calibrated floor, a
// transition is rejected outright, not merely scored low. This is what
// keeps a catastrophic transition from ever reaching the compensatory path
// score (design.md §11's edge score is intentionally non-compensatory).
const MIN_ACCEPTABLE = 0.3;

export function evaluateEdge(edge: TransitionEdge, config: PlannerConfig): EdgeEvalResult {
  const calibrated: Record<keyof Omit<EdgeSignals, 'estimatedCrossfadeSec'>, number> = {
    bpmDelta: calibrate(edge.signals.bpmDelta, (v) => 1 - Math.min(Math.abs(v) / 20, 1)),
    keyCompatibility: calibrate(edge.signals.keyCompatibility, (v) => (v ? 1 : 0)),
    beatAlignment: calibrate(edge.signals.beatAlignment, (v) => v),
    embeddingSimilarity: calibrate(edge.signals.embeddingSimilarity, (v) => v),
    loudnessDelta: calibrate(edge.signals.loudnessDelta, (v) => 1 - Math.min(Math.abs(v) / 6, 1)),
  };

  const feasible = Object.values(calibrated).every((v) => v >= MIN_ACCEPTABLE);
  if (!feasible) return { feasible: false, qualityScore: 0 };

  // Quality ranking among survivors only: harsh geometric mean, so a
  // weak-but-still-feasible dimension drags the score down without being
  // an outright rejection (ADR-005 stage 2).
  const weighted = Object.entries(calibrated).map(([key, v]) =>
    Math.pow(v, config.edgeWeights[key as keyof EdgeSignals] ?? 1)
  );
  const product = weighted.reduce((a, b) => a * b, 1);
  return { feasible: true, qualityScore: Math.pow(product, 1 / weighted.length) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/scorer/__test__/lib.test.ts`
Expected: PASS, 11 tests (5 from Task 1 + 6 new).

- [ ] **Step 6: Commit**

```bash
git add src/scorer/types.ts src/scorer/lib.ts src/scorer/__test__/lib.test.ts
git commit -m "feat(scorer): add evaluateEdge() two-stage feasibility + quality (ADR-005)"
```

---

### Task 3: `evaluateNode()`

**Files:**
- Modify: `src/scorer/lib.ts`
- Test: `src/scorer/__test__/lib.test.ts`

**Interfaces:**
- Consumes: `calibrate` (Task 1); `ChunkNode`, `Measurement`, `NodeSignals`, `PlannerConfig` from `../../core`; `synthNodes` from `../../../test-data/synthetic/graph`.
- Produces: `evaluateNode(node, config): number` — consumed by Phase 4's planner.

- [ ] **Step 1: Write the failing test**

Add these import lines directly below the existing ones at the top of `src/scorer/__test__/lib.test.ts` — as separate `import` statements introducing only new names:

```ts
import { evaluateNode } from '../lib';
import { synthNodes } from '../../../test-data/synthetic/graph';
```

Then append the following to the end of the file:

```ts
function nodeWeights(overrides: Partial<Record<string, number>> = {}) {
  return {
    bpm: 0, key: 0, energy: 0, loudnessLufs: 0, guitarPresence: 0,
    vocalPresence: 0, danceability: 0, sectionType: 0, embedding: 0, genreDistribution: 0,
    ...overrides,
  };
}

describe('evaluateNode()', () => {
  const a2 = synthNodes.find((n) => n.id === 'A2')!; // energy 0.5, confidence 1

  it('produces different scores for the same node under two different configs', () => {
    const lowWeight = baseConfig({ nodeWeights: nodeWeights({ energy: 1 }) });
    const highWeight = baseConfig({ nodeWeights: nodeWeights({ energy: 2 }) });
    const scoreLow = evaluateNode(a2, lowWeight);
    const scoreHigh = evaluateNode(a2, highWeight);
    expect(scoreLow).toBeCloseTo(0.5); // calibrate(energy=0.5, confidence=1) * weight 1
    expect(scoreHigh).toBeCloseTo(1.0);
    expect(scoreLow).not.toBe(scoreHigh);
  });

  it('returns 0 for an all-zero-weight config', () => {
    const config = baseConfig({ nodeWeights: nodeWeights() });
    expect(evaluateNode(a2, config)).toBe(0);
  });

  it('contributes 0, not NaN, for a nonzero weight on a non-scalar signal', () => {
    const config = baseConfig({ nodeWeights: nodeWeights({ sectionType: 5, embedding: 3 }) });
    const score = evaluateNode(a2, config);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(0);
  });

  it('sums contributions across multiple weighted scalar signals', () => {
    const config = baseConfig({ nodeWeights: nodeWeights({ energy: 1, danceability: 1 }) });
    // A2: energy=0.5, danceability=0.6, both confidence 1 -> calibrated == raw
    expect(evaluateNode(a2, config)).toBeCloseTo(0.5 + 0.6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/scorer/__test__/lib.test.ts`
Expected: FAIL — `evaluateNode is not a function`.

- [ ] **Step 3: Append `evaluateNode()` to `src/scorer/lib.ts`**

Add this import line directly below the existing `from '../core'` line at the top of `src/scorer/lib.ts` — as a separate `import` statement introducing only new names:

```ts
import { ChunkNode, Measurement, NodeSignals } from '../core';
```

Then append the following to the end of the file:

```ts
// Only signals with a real linear 0-1-ish numeric scale are scored here
// (ADR-004). key/sectionType/embedding/genreDistribution aren't linearly
// scalar; a nonzero nodeWeight on one of them contributes 0, never NaN —
// see docs/superpowers/plans/2026-08-08-phase3-scoring-engine.md's Global
// Constraints for why this deviates from implementation.md §7.3's literal
// snippet.
const NODE_TO_SCALAR: Partial<Record<keyof NodeSignals, (value: number) => number>> = {
  bpm: (v) => v,
  energy: (v) => v,
  loudnessLufs: (v) => v,
  guitarPresence: (v) => v,
  vocalPresence: (v) => v,
  danceability: (v) => v,
};

export function evaluateNode(node: ChunkNode, config: PlannerConfig): number {
  let score = 0;
  for (const [key, weight] of Object.entries(config.nodeWeights) as [keyof NodeSignals, number][]) {
    if (weight === 0) continue;
    const toScalar = NODE_TO_SCALAR[key];
    if (!toScalar) continue;
    score += weight * calibrate(node.signals[key] as Measurement<number>, toScalar);
  }
  return score;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/scorer/__test__/lib.test.ts`
Expected: PASS, 15 tests (11 from Tasks 1-2 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/scorer/lib.ts src/scorer/__test__/lib.test.ts
git commit -m "feat(scorer): add evaluateNode() (ADR-004)"
```

---

### Task 4: `sampleEnergyCurve()` + `evaluatePath()`

**Files:**
- Modify: `src/scorer/utils.ts`, `src/scorer/lib.ts`
- Test: `src/scorer/__test__/lib.test.ts`

**Interfaces:**
- Consumes: `PlannerConfig`, `SearchResources` from `../../core`.
- Produces: `sampleEnergyCurve(curve, t): number` (utility), `evaluatePath(resources, config): number` — consumed by Phase 4's planner.

- [ ] **Step 1: Write the failing test**

Add these import lines directly below the existing ones at the top of `src/scorer/__test__/lib.test.ts` — as separate `import` statements introducing only new names:

```ts
import { evaluatePath } from '../lib';
import { SearchResources } from '../../core';
import { sampleEnergyCurve } from '../utils';
```

Then append the following to the end of the file:

```ts
function baseResources(overrides: Partial<SearchResources> = {}): SearchResources {
  return {
    elapsedDurationBucket: 900,
    energyBucket: 0.5,
    currentKeyBucket: '8A',
    currentNodeId: 'A2',
    songDiversityCount: 2,
    recentSectionTypes: [],
    usedChunkIds: new Set(['A1', 'A2']),
    usedSongIds: new Set(['songA']),
    history: ['A1', 'A2', 'B2', 'A3'],
    ...overrides,
  };
}

describe('sampleEnergyCurve()', () => {
  it('samples the nearest point on the curve for a given normalized time', () => {
    const curve = [0.2, 0.5, 0.8];
    expect(sampleEnergyCurve(curve, 0)).toBe(0.2);
    expect(sampleEnergyCurve(curve, 0.5)).toBe(0.5);
    expect(sampleEnergyCurve(curve, 1)).toBe(0.8);
  });

  it('clamps out-of-range t to [0, 1]', () => {
    const curve = [0.2, 0.5, 0.8];
    expect(sampleEnergyCurve(curve, -1)).toBe(0.2);
    expect(sampleEnergyCurve(curve, 2)).toBe(0.8);
  });
});

describe('evaluatePath()', () => {
  it('scores full duration adherence as 1 when elapsed matches target exactly', () => {
    const resources = baseResources({ elapsedDurationBucket: 1800 });
    const config = baseConfig({
      targetDurationSec: 1800,
      durationToleranceSec: 30,
      targetEnergyCurve: [0.5],
      pathObjectiveWeights: { durationAdherence: 1, energyCurveAdherence: 0, diversity: 0, repetitionPenalty: 0 },
    });
    expect(evaluatePath(resources, config)).toBeCloseTo(1);
  });

  it('combines duration, energy, and diversity terms per pathObjectiveWeights', () => {
    const resources = baseResources({
      elapsedDurationBucket: 900,
      energyBucket: 0.5,
      songDiversityCount: 2,
      history: ['A1', 'A2', 'B2', 'A3'],
    });
    const config = baseConfig({
      targetDurationSec: 1800,
      durationToleranceSec: 30,
      targetEnergyCurve: [0.2, 0.5, 0.8],
      pathObjectiveWeights: { durationAdherence: 1, energyCurveAdherence: 1, diversity: 1, repetitionPenalty: 1 },
    });
    // duration: elapsed(900) is 900s off target(1800), clamped -> durationScore = 0
    // energy: t=900/1800=0.5 -> curve sample = 0.5; energyBucket=0.5 -> energyScore = 1
    // diversity: 2 / 4 = 0.5
    expect(evaluatePath(resources, config)).toBeCloseTo(0 + 1 + 0.5);
  });

  it('produces two different scores for two different pathObjectiveWeights, same resources', () => {
    const resources = baseResources();
    const configA = baseConfig({
      targetDurationSec: 1800,
      durationToleranceSec: 900,
      targetEnergyCurve: [0.5],
      pathObjectiveWeights: { durationAdherence: 1, energyCurveAdherence: 0, diversity: 0, repetitionPenalty: 0 },
    });
    const configB = baseConfig({
      targetDurationSec: 1800,
      durationToleranceSec: 900,
      targetEnergyCurve: [0.5],
      pathObjectiveWeights: { durationAdherence: 0, energyCurveAdherence: 0, diversity: 1, repetitionPenalty: 0 },
    });
    expect(evaluatePath(resources, configA)).not.toBeCloseTo(evaluatePath(resources, configB));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/scorer/__test__/lib.test.ts`
Expected: FAIL — `sampleEnergyCurve is not a function`.

- [ ] **Step 3: Write `src/scorer/utils.ts`**

```ts
// Small pure helpers — no domain types, no scoring semantics of their own.

// Nearest-sample lookup into a curve sampled 0-1 over normalized time.
// t is clamped to [0, 1] before rounding to the nearest sample index.
export function sampleEnergyCurve(curve: readonly number[], t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  const index = Math.round(clamped * (curve.length - 1));
  return curve[index];
}
```

- [ ] **Step 4: Append `evaluatePath()` to `src/scorer/lib.ts`**

Add these import lines directly below the existing ones at the top of `src/scorer/lib.ts` — as separate `import` statements introducing only new names:

```ts
import { SearchResources } from '../core';
import { sampleEnergyCurve } from './utils';
```

Then append the following to the end of the file:

```ts
export function evaluatePath(resources: SearchResources, config: PlannerConfig): number {
  const durationDelta = Math.abs(resources.elapsedDurationBucket - config.targetDurationSec);
  const durationScore = 1 - Math.min(durationDelta / config.durationToleranceSec, 1);

  const targetEnergy = sampleEnergyCurve(
    config.targetEnergyCurve,
    resources.elapsedDurationBucket / config.targetDurationSec
  );
  const energyScore = 1 - Math.abs(resources.energyBucket - targetEnergy);
  const diversityScore = resources.songDiversityCount / Math.max(resources.history.length, 1);

  const w = config.pathObjectiveWeights;
  return (
    w.durationAdherence * durationScore +
    w.energyCurveAdherence * energyScore +
    w.diversity * diversityScore
  );
  // repetitionPenalty is applied by the planner (Phase 4) from
  // usedChunkIds/usedSongIds — out of scope here, per implementation.md §7.4.
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/scorer/__test__/lib.test.ts`
Expected: PASS, 20 tests (15 from Tasks 1-3 + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/scorer/utils.ts src/scorer/lib.ts src/scorer/__test__/lib.test.ts
git commit -m "feat(scorer): add sampleEnergyCurve() and evaluatePath()"
```

---

### Task 5: Barrel export + Phase 3 sign-off

**Files:**
- Modify: `src/scorer/index.ts` (currently the Phase 0 placeholder `export {};`)
- Test: `src/scorer/__test__/index.test.ts`

**Interfaces:**
- Consumes: every export from `src/scorer/types.ts`, `src/scorer/lib.ts`, `src/scorer/utils.ts` (Tasks 1-4).
- Produces: the single entry point Phase 4's planner imports from (`import { evaluateEdge, evaluateNode, evaluatePath, calibrate } from '../scorer'`).

- [ ] **Step 1: Write the failing test**

```ts
// src/scorer/__test__/index.test.ts
import * as scorer from '../index';

describe('src/scorer barrel export', () => {
  it('re-exports calibrate, evaluateEdge, evaluateNode, evaluatePath, sampleEnergyCurve', () => {
    expect(typeof scorer.calibrate).toBe('function');
    expect(typeof scorer.evaluateEdge).toBe('function');
    expect(typeof scorer.evaluateNode).toBe('function');
    expect(typeof scorer.evaluatePath).toBe('function');
    expect(typeof scorer.sampleEnergyCurve).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/scorer/__test__/index.test.ts`
Expected: FAIL — `scorer.calibrate is not a function` (current `index.ts` is `export {};`).

- [ ] **Step 3: Replace `src/scorer/index.ts`**

```ts
export * from './types';
export * from './lib';
export * from './utils';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/scorer/__test__/index.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Run the full suite, lint, and build together**

Run: `npm run lint && npm test && npm run build`
Expected: all exit 0 — every Phase 0/1/2 test still passes, plus this plan's 21 new tests (20 in `lib.test.ts` + 1 in `index.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/scorer/index.ts src/scorer/__test__/index.test.ts
git commit -m "feat(scorer): add barrel export — Phase 3 scoring engine complete"
```

- [ ] **Step 7: Confirm Phase 3 acceptance criteria from `docs/implementation.md` §7 and §13**

Manually verify (no further code changes):
- [ ] The known-bad edge from the Phase 2 fixture (`B2 -> A3`) is marked infeasible, not merely low-scoring (Task 2, test 1).
- [ ] A synthetic low-confidence bad reading (`keyCompatible: false, confidence: 0.1`) is calibrated toward neutral and passes feasibility, while the same reading at `confidence: 0.95` fails it (Task 2, tests 4-5).
- [ ] Two different `PlannerConfig`s produce two different `nodeScore` results for the same node, with zero changes to the graph (Task 3, test 1).

---

## Plan Self-Review Notes

- **Spec coverage:** `docs/implementation.md` §7's four deliverables — calibration (§7.1), edge evaluation (§7.2), node evaluation (§7.3), path evaluation (§7.4) — map to Tasks 1-4 respectively. The three explicit Phase 3 acceptance criteria (§7's bulleted list, mirrored in §13's table) are each asserted directly: `B2->A3` infeasibility (Task 2), confidence-dependent feasibility flip (Task 2), config-dependent `nodeScore` (Task 3).
- **Corrected bugs, not blind transcription:** two literal snippets in `implementation.md` (§7.2's mismatched `calibrated` object keys, §7.3's unguarded `NaN` propagation for non-scalar signals) were identified as bugs during planning and fixed rather than copied verbatim — documented explicitly in Global Constraints so a reviewer isn't surprised by the deviation from the doc's literal code.
- **File convention adherence:** `src/scorer/` gets `types.ts`/`lib.ts`/`utils.ts`/`index.ts` + `__test__/`, matching `docs/implementation.md` §2 and the precedent set by `src/graph/` in Phase 2, including empty-but-present stubs in Task 1 for categories not yet populated.
- **Type consistency:** `EdgeEvalResult { feasible, qualityScore }` (Task 2) is used identically in every subsequent test; `calibrate`'s signature `(m, toScalar, neutral?)` from Task 1 is reused unchanged by `evaluateEdge` and `evaluateNode` — no drift.
- **Fixture reuse:** Tasks 2-3 reuse the Phase 2 `test-data/synthetic/graph.ts` fixture (`synthEdges`, `synthNodes`) directly rather than inventing parallel fixtures, so Phase 3's tests validate the same known-good/known-bad/known-mediocre data Phase 4 will also search over.
- **Numeric verification:** every score asserted in this plan (e.g. `A1->A2` quality ≈0.96 vs `A1->B1` ≈0.67, `evaluatePath` combined score `0 + 1 + 0.5`) was hand-computed against the exact fixture values and formulas above before being written into the plan, not guessed.
