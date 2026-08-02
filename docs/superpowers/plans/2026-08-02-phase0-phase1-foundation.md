# Phase 0 + Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the MixForge repository's tooling foundation (Phase 0) and freeze the core domain model in `src/core/` (Phase 1), exactly as specified in `docs/design.md`, `docs/implementation.md`, and `docs/models.md`.

**Architecture:** A single npm package (not a workspace monorepo yet) with strict folder-boundary enforcement via ESLint's `import/no-restricted-paths`, mirroring the dependency directions documented in `implementation.md` §2's repository layout. `src/core/` contains only type declarations plus two small pure functions (`measurement()`, `mergeKey()`) — no algorithms, no DSP, no planner logic, per the Phase 1 scope discipline in `implementation.md` §5.

**Tech Stack:** TypeScript 5 (strict mode), Jest + ts-jest for tests, ESLint 9 flat config + `eslint-plugin-import` for the boundary rule, GitHub Actions for CI, npm as the package manager.

## Global Constraints

- TypeScript `strict: true` for all source and test files.
- Every domain type in `src/core/` is `readonly`/immutable at the type level (per ADR-002).
- `src/core/` must not contain algorithms, DSP calls, or planner/search logic — only type declarations and the two data-shaping functions specified in `models.md` (`measurement()` factory, `mergeKey()`).
- The import-boundary rule must fail `npm run lint` (not just warn) on a violation — this is the acceptance bar from `implementation.md` Phase 0.
- Commit after every task using the message style `feat(scope): summary` (e.g. `feat(core): add Measurement<T> primitive`).
- No other module besides `src/core/` may be started during this plan — that is Phase 1's explicit acceptance criterion in `implementation.md` §5.

---

## File Structure

```
mixforge/
  package.json
  tsconfig.json
  jest.config.js
  eslint.config.js
  .gitignore
  .github/workflows/ci.yml
  src/
    core/
      measurement.ts       # Measurement<T>, measurement()
      nodeSignals.ts       # SectionType, NodeSignals, ChunkNode
      edgeSignals.ts       # EdgeSignals, TransitionEdge
      musicGraph.ts        # MusicGraph (interface only)
      calibration.ts       # CalibrationFn
      plannerConfig.ts     # HardConstraint, PlannerConfig
      searchState.ts       # SearchResources, SearchState, mergeKey()
      searchProblem.ts     # SearchProblem<TNode,TResource,TEdge>, MusicSearchProblem
      remixPlan.ts         # PlannerDiagnostics, RemixPlan
      renderer.ts          # RenderOptions, Renderer, RenderedAudio
      index.ts             # barrel re-export
      measurement.test.ts
      signals.test.ts
      musicGraph.test.ts
      plannerConfig.test.ts
      searchState.test.ts
      searchProblem.test.ts
      remixPlan.test.ts
      renderer.test.ts
      index.test.ts
    graph/index.ts          # placeholder (export {};) — Phase 2
    scorer/index.ts         # placeholder — Phase 3
    planner/index.ts        # placeholder — Phase 4
    analysis/index.ts       # placeholder — Phase 5
    retrieval/index.ts      # placeholder — Phase 5
    renderer/index.ts       # placeholder — Phase 6
    ai/index.ts             # placeholder — Phase 7
  apps/cli/.gitkeep         # Phase 8
  test-data/synthetic/.gitkeep  # Phase 2
  test-data/audio/.gitkeep      # Phase 5
```

Each `src/core/*.ts` file owns exactly one group of related types from `models.md`, in dependency order (later files import earlier ones, never the reverse — verified by the task order below matching import order).

---

### Task 1: Repository bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `src/graph/index.ts`, `src/scorer/index.ts`, `src/planner/index.ts`, `src/analysis/index.ts`, `src/retrieval/index.ts`, `src/renderer/index.ts`, `src/ai/index.ts`
- Create: `apps/cli/.gitkeep`, `test-data/synthetic/.gitkeep`, `test-data/audio/.gitkeep`

**Interfaces:**
- Produces: an installable npm project (`npm install` succeeds), a git repository with the full folder layout committed (git does not track empty directories, so every currently-empty folder needs a placeholder file to survive the initial commit).

- [ ] **Step 1: Initialize git**

```bash
git init
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "mixforge",
  "version": "0.1.0",
  "private": true,
  "description": "AI-assisted automatic DJ & remix planning engine",
  "scripts": {
    "build": "tsc --noEmit",
    "lint": "eslint .",
    "test": "jest"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.0",
    "@typescript-eslint/parser": "^8.18.0",
    "eslint": "^9.17.0",
    "eslint-import-resolver-typescript": "^3.7.0",
    "eslint-plugin-import": "^2.31.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
dist/
coverage/
*.log
```

- [ ] **Step 5: Create placeholder files for not-yet-started modules**

```bash
echo 'export {};' > src/graph/index.ts
echo 'export {};' > src/scorer/index.ts
echo 'export {};' > src/planner/index.ts
echo 'export {};' > src/analysis/index.ts
echo 'export {};' > src/retrieval/index.ts
echo 'export {};' > src/renderer/index.ts
echo 'export {};' > src/ai/index.ts
touch apps/cli/.gitkeep test-data/synthetic/.gitkeep test-data/audio/.gitkeep
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes with no errors, `node_modules/` and `package-lock.json` created.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(repo): bootstrap package.json, tsconfig, folder layout"
```

---

### Task 2: ESLint import-boundary enforcement

**Files:**
- Create: `eslint.config.js`

**Interfaces:**
- Consumes: the `src/*/index.ts` placeholder files from Task 1 (used to prove the rule fires).
- Produces: `npm run lint` exit code 0 on a clean tree; exit code 1 when any folder imports from a folder outside its allowed dependency direction (per `implementation.md` §2's per-folder "Depends on ..." comments).

- [ ] **Step 1: Write `eslint.config.js`**

```js
const tsParser = require('@typescript-eslint/parser');
const importPlugin = require('eslint-plugin-import');

function zone(target, from) {
  return {
    target: `./src/${target}/**/*`,
    from: from.map((f) => `./src/${f}/**/*`),
  };
}

module.exports = [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': { typescript: true, node: true },
    },
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // core depends on nothing else in src/
            zone('core', ['graph', 'scorer', 'planner', 'analysis', 'retrieval', 'renderer', 'ai']),
            // graph depends on core only
            zone('graph', ['analysis', 'retrieval', 'scorer', 'planner', 'renderer', 'ai']),
            // scorer depends on core only
            zone('scorer', ['graph', 'analysis', 'retrieval', 'planner', 'renderer', 'ai']),
            // planner depends on core + scorer, NEVER analysis/retrieval/graph (ADR-006)
            zone('planner', ['analysis', 'retrieval', 'graph', 'renderer', 'ai']),
            // analysis depends on core only
            zone('analysis', ['graph', 'scorer', 'planner', 'retrieval', 'renderer', 'ai']),
            // retrieval depends on core + analysis outputs
            zone('retrieval', ['graph', 'scorer', 'planner', 'renderer', 'ai']),
            // renderer depends on core + graph, NEVER planner internals
            zone('renderer', ['scorer', 'planner', 'analysis', 'retrieval', 'ai']),
            // ai depends on core only
            zone('ai', ['graph', 'scorer', 'planner', 'analysis', 'retrieval', 'renderer']),
          ],
        },
      ],
    },
  },
];
```

- [ ] **Step 2: Verify lint passes on the clean tree**

Run: `npm run lint`
Expected: exit code 0, no output.

- [ ] **Step 3: Prove the rule fails the build (red)**

Temporarily append to `src/planner/index.ts`:

```ts
export {};
import '../analysis/index';
```

Run: `npm run lint`
Expected: fails with an `import/no-restricted-paths` error pointing at `src/planner/index.ts`.

- [ ] **Step 4: Revert the temporary violation (green)**

```bash
git checkout -- src/planner/index.ts
```

Run: `npm run lint`
Expected: exit code 0 again — confirms the rule is live, not a false failure.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js
git commit -m "feat(repo): add import-boundary lint rule (ADR-006)"
```

---

### Task 3: Jest test runner

**Files:**
- Create: `jest.config.js`
- Create: `src/core/__smoke__.test.ts` (temporary, deleted at the end of this task)

**Interfaces:**
- Produces: `npm test` runs and passes with zero real source files yet (Phase 0 acceptance criterion).

- [ ] **Step 1: Write `jest.config.js`**

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
```

- [ ] **Step 2: Write a temporary smoke test**

```ts
describe('jest + ts-jest smoke test', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npm test`
Expected: 1 suite, 1 test, PASS.

- [ ] **Step 4: Delete the smoke test**

```bash
rm src/core/__smoke__.test.ts
```

(`src/core/` itself doesn't exist as a directory yet outside this file — recreate is unnecessary since Task 5 creates it properly.)

- [ ] **Step 5: Commit**

```bash
git add jest.config.js package.json package-lock.json
git commit -m "feat(repo): add Jest test runner"
```

---

### Task 4: CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: lint + test run automatically on every push/PR once a remote exists.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

- [ ] **Step 2: Verify the two commands it runs still pass locally**

Run: `npm run lint && npm test`
Expected: both exit 0 (mirrors what CI will do — there's no remote yet to actually trigger Actions).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(repo): add CI workflow (lint + test on push/PR)"
```

**Phase 0 acceptance check:** `npm test` and `npm run lint` both pass on the skeleton; the import-boundary rule has been demonstrated red → green (Task 2, Steps 3–4). Phase 0 is done — everything below is Phase 1.

---

### Task 5: Measurement primitive

**Files:**
- Create: `src/core/measurement.ts`
- Test: `src/core/measurement.test.ts`

**Interfaces:**
- Produces: `Measurement<T>` interface and `measurement<T>(value, confidence, detector, version)` factory — every later task's types wrap values in `Measurement<T>`.

- [ ] **Step 1: Write the failing test**

```ts
import { measurement, Measurement } from './measurement';

describe('measurement()', () => {
  it('builds a Measurement with all four fields set exactly as passed', () => {
    const m: Measurement<number> = measurement(120, 0.83, 'BpmDetectorV1', '1.0.0');
    expect(m.value).toBe(120);
    expect(m.confidence).toBe(0.83);
    expect(m.detector).toBe('BpmDetectorV1');
    expect(m.version).toBe('1.0.0');
  });

  it('preserves non-numeric value types generically', () => {
    const m: Measurement<string> = measurement('G Minor', 0.6, 'KeyDetectorV2', '2.1.0');
    expect(m.value).toBe('G Minor');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/measurement.test.ts`
Expected: FAIL — `Cannot find module './measurement'`.

- [ ] **Step 3: Write `src/core/measurement.ts`**

```ts
// Measurements — ADR-002 / ADR-009
// The graph stores observations, not ground truth. Every value extracted
// from audio carries confidence and provenance.

export interface Measurement<T> {
  readonly value: T;
  /** 0.0 (no confidence) – 1.0 (certain). Never a preference; purely detector reliability. */
  readonly confidence: number;
  /** Which detector produced this, e.g. "KeyDetectorV2". Enables regression testing. */
  readonly detector: string;
  /** Detector version, so graphs can be selectively re-scored when a detector improves. */
  readonly version: string;
}

export function measurement<T>(
  value: T,
  confidence: number,
  detector: string,
  version: string
): Measurement<T> {
  return { value, confidence, detector, version };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/core/measurement.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/measurement.ts src/core/measurement.test.ts
git commit -m "feat(core): add Measurement<T> primitive"
```

---

### Task 6: Node & edge signal types

**Files:**
- Create: `src/core/nodeSignals.ts`, `src/core/edgeSignals.ts`
- Test: `src/core/signals.test.ts`

**Interfaces:**
- Consumes: `Measurement<T>`, `measurement()` from `./measurement` (Task 5).
- Produces: `SectionType`, `NodeSignals`, `ChunkNode`, `EdgeSignals`, `TransitionEdge` — consumed by `musicGraph.ts` (Task 7), `plannerConfig.ts`'s weight records (Task 8), and `searchProblem.ts` (Task 10).

- [ ] **Step 1: Write the failing test**

```ts
import { measurement } from './measurement';
import { ChunkNode } from './nodeSignals';
import { TransitionEdge } from './edgeSignals';

describe('signal types', () => {
  it('constructs a well-formed ChunkNode', () => {
    const node: ChunkNode = {
      id: 'A1',
      songId: 'songA',
      startTimeSec: 0,
      endTimeSec: 8,
      bars: 4,
      signals: {
        bpm: measurement(120, 0.9, 'BpmDetectorV1', '1.0.0'),
        key: measurement('8A', 0.8, 'KeyDetectorV2', '2.0.0'),
        energy: measurement(0.7, 0.85, 'EnergyDetectorV1', '1.0.0'),
        loudnessLufs: measurement(-14, 1.0, 'LoudnessDetectorV1', '1.0.0'),
        guitarPresence: measurement(0.1, 0.6, 'InstrumentClassifierV1', '1.0.0'),
        vocalPresence: measurement(0.9, 0.6, 'InstrumentClassifierV1', '1.0.0'),
        danceability: measurement(0.8, 0.7, 'DanceabilityV1', '1.0.0'),
        sectionType: measurement('verse', 0.75, 'SectionClassifierV1', '1.0.0'),
        embedding: measurement(new Float32Array([0.1, 0.2]), 0.95, 'EmbeddingV1', '1.0.0'),
        genreDistribution: measurement({ pop: 0.6, rock: 0.4 }, 0.5, 'GenreClassifierV1', '1.0.0'),
      },
    };
    expect(node.id).toBe('A1');
    expect(node.signals.bpm.value).toBe(120);
    expect(node.signals.sectionType.value).toBe('verse');
  });

  it('constructs a well-formed TransitionEdge', () => {
    const edge: TransitionEdge = {
      from: 'A1',
      to: 'A2',
      signals: {
        bpmDelta: measurement(0, 0.9, 'BpmDetectorV1', '1.0.0'),
        keyCompatibility: measurement(true, 0.8, 'KeyCompatV1', '1.0.0'),
        beatAlignment: measurement(0.95, 0.85, 'BeatAlignV1', '1.0.0'),
        embeddingSimilarity: measurement(0.9, 0.95, 'EmbeddingV1', '1.0.0'),
        loudnessDelta: measurement(0.5, 1.0, 'LoudnessDetectorV1', '1.0.0'),
        estimatedCrossfadeSec: measurement(4, 0.7, 'CrossfadeEstimatorV1', '1.0.0'),
      },
    };
    expect(edge.from).toBe('A1');
    expect(edge.to).toBe('A2');
    expect(edge.signals.keyCompatibility.value).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/signals.test.ts`
Expected: FAIL — `Cannot find module './nodeSignals'`.

- [ ] **Step 3: Write `src/core/nodeSignals.ts`**

```ts
// Node signals — intrinsic, per-chunk properties (ADR-004)

import { Measurement } from './measurement';

export type SectionType =
  | 'intro' | 'verse' | 'preChorus' | 'chorus'
  | 'bridge' | 'drop' | 'solo' | 'outro' | 'unknown';

export interface NodeSignals {
  readonly bpm: Measurement<number>;
  readonly key: Measurement<string>; // e.g. "8A" (Camelot notation)
  readonly energy: Measurement<number>; // 0-1
  readonly loudnessLufs: Measurement<number>;
  readonly guitarPresence: Measurement<number>; // 0-1
  readonly vocalPresence: Measurement<number>; // 0-1
  readonly danceability: Measurement<number>; // 0-1
  readonly sectionType: Measurement<SectionType>;
  readonly embedding: Measurement<Float32Array>;
  readonly genreDistribution: Measurement<Record<string, number>>;
}

export interface ChunkNode {
  readonly id: string;
  readonly songId: string;
  readonly startTimeSec: number;
  readonly endTimeSec: number;
  readonly bars: number;
  readonly signals: NodeSignals;
}
```

- [ ] **Step 4: Write `src/core/edgeSignals.ts`**

```ts
// Edge signals — local transition quality between two chunks (ADR-005)
// Derived measurements: compatibility scores propagate confidence from
// the two underlying node measurements they're computed from.

import { Measurement } from './measurement';

export interface EdgeSignals {
  readonly bpmDelta: Measurement<number>;
  readonly keyCompatibility: Measurement<boolean>; // Camelot-wheel compatible or not
  readonly beatAlignment: Measurement<number>; // 0-1, phase alignment quality
  readonly embeddingSimilarity: Measurement<number>; // cosine similarity, 0-1
  readonly loudnessDelta: Measurement<number>;
  readonly estimatedCrossfadeSec: Measurement<number>;
}

export interface TransitionEdge {
  readonly from: string; // ChunkNode id
  readonly to: string; // ChunkNode id
  readonly signals: EdgeSignals;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/core/signals.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/nodeSignals.ts src/core/edgeSignals.ts src/core/signals.test.ts
git commit -m "feat(core): add NodeSignals/ChunkNode and EdgeSignals/TransitionEdge"
```

---

### Task 7: MusicGraph interface

**Files:**
- Create: `src/core/musicGraph.ts`
- Test: `src/core/musicGraph.test.ts`

**Interfaces:**
- Consumes: `ChunkNode` from `./nodeSignals`, `TransitionEdge` from `./edgeSignals` (Task 6).
- Produces: `MusicGraph` — consumed by `renderer.ts` (Task 12). No implementation here; the in-memory implementation belongs to Phase 2 (`src/graph/`), out of scope for this plan.

- [ ] **Step 1: Write the failing test**

```ts
import { MusicGraph } from './musicGraph';

describe('MusicGraph interface', () => {
  it('is satisfied by a minimal stub object', () => {
    const stub: MusicGraph = {
      nodes: new Map(),
      edges: new Map(),
      getOutgoingEdges: () => [],
      getNode: () => undefined,
    };
    expect(stub.getOutgoingEdges('A1')).toEqual([]);
    expect(stub.getNode('A1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/musicGraph.test.ts`
Expected: FAIL — `Cannot find module './musicGraph'`.

- [ ] **Step 3: Write `src/core/musicGraph.ts`**

```ts
// Graph — static, immutable, offline-built (ADR-001, ADR-002)
// Interface only. The in-memory / persisted implementation lives in
// src/graph/ (Phase 2) and must satisfy this contract exactly.

import { ChunkNode } from './nodeSignals';
import { TransitionEdge } from './edgeSignals';

export interface MusicGraph {
  readonly nodes: ReadonlyMap<string, ChunkNode>;
  readonly edges: ReadonlyMap<string, readonly TransitionEdge[]>; // keyed by `from` node id
  getOutgoingEdges(nodeId: string): readonly TransitionEdge[];
  getNode(nodeId: string): ChunkNode | undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/core/musicGraph.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/core/musicGraph.ts src/core/musicGraph.test.ts
git commit -m "feat(core): add MusicGraph interface"
```

---

### Task 8: Calibration, PlannerConfig, HardConstraint

**Files:**
- Create: `src/core/calibration.ts`, `src/core/plannerConfig.ts`
- Test: `src/core/plannerConfig.test.ts`

**Interfaces:**
- Consumes: `Measurement<T>` (Task 5), `NodeSignals` (Task 6), `EdgeSignals` (Task 6), `SearchResources` (forward reference — defined in Task 9's `searchState.ts`; imported by type only, no runtime dependency, so declaration order across files is safe).
- Produces: `CalibrationFn`, `HardConstraint`, `PlannerConfig` — consumed by `searchProblem.ts` (Task 10) and by Phase 3's scorer (out of scope here).

- [ ] **Step 1: Write the failing test**

```ts
import { CalibrationFn } from './calibration';
import { HardConstraint, PlannerConfig } from './plannerConfig';
import { measurement } from './measurement';
import { TransitionEdge } from './edgeSignals';
import { SearchResources } from './searchState';

const dummyCalibrate: CalibrationFn = (_m, _toScalar, neutral = 0.5) => neutral;

function fixtureEdge(): TransitionEdge {
  return {
    from: 'A1',
    to: 'A2',
    signals: {
      bpmDelta: measurement(0, 0.9, 'BpmDetectorV1', '1.0.0'),
      keyCompatibility: measurement(true, 0.8, 'KeyCompatV1', '1.0.0'),
      beatAlignment: measurement(0.95, 0.85, 'BeatAlignV1', '1.0.0'),
      embeddingSimilarity: measurement(0.9, 0.95, 'EmbeddingV1', '1.0.0'),
      loudnessDelta: measurement(0.5, 1.0, 'LoudnessDetectorV1', '1.0.0'),
      estimatedCrossfadeSec: measurement(4, 0.7, 'CrossfadeEstimatorV1', '1.0.0'),
    },
  };
}

function fixtureResources(): SearchResources {
  return {
    elapsedDurationBucket: 0,
    energyBucket: 0,
    currentKeyBucket: '8A',
    songDiversityCount: 1,
    recentSectionTypes: [],
    usedChunkIds: new Set(),
    usedSongIds: new Set(),
    history: [],
  };
}

describe('PlannerConfig / HardConstraint', () => {
  it('lets a HardConstraint inspect both the edge and the resulting resources', () => {
    const constraint: HardConstraint = {
      name: 'max-duration',
      check: (edge, resources) => resources.elapsedDurationBucket < 300 && edge.to !== '',
    };
    expect(constraint.check(fixtureEdge(), fixtureResources(), dummyCalibrate)).toBe(true);
  });

  it('constructs a well-formed PlannerConfig with weights for every signal', () => {
    const config: PlannerConfig = {
      hardConstraints: [],
      nodeWeights: {
        bpm: 0, key: 0, energy: 1, loudnessLufs: 0, guitarPresence: 1.5,
        vocalPresence: 0.5, danceability: 1, sectionType: 0, embedding: 0, genreDistribution: 0,
      },
      edgeWeights: {
        bpmDelta: 1, keyCompatibility: 1, beatAlignment: 1,
        embeddingSimilarity: 0.5, loudnessDelta: 0.5, estimatedCrossfadeSec: 0,
      },
      pathObjectiveWeights: {
        energyCurveAdherence: 1, diversity: 1, durationAdherence: 1, repetitionPenalty: 1,
      },
      targetDurationSec: 1800,
      targetEnergyCurve: [0.3, 0.6, 0.9, 0.5],
      durationToleranceSec: 30,
    };
    expect(config.nodeWeights.guitarPresence).toBe(1.5);
    expect(config.targetEnergyCurve).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/plannerConfig.test.ts`
Expected: FAIL — `Cannot find module './calibration'`.

- [ ] **Step 3: Write `src/core/calibration.ts`**

```ts
// Calibration — ADR-009
// Confidence-aware adjustment, independent of PlannerConfig. Turns a raw
// Measurement into a calibrated scalar signal ready for scoring.
// Interface only — the real implementation belongs to Phase 3 (src/scorer/).

import { Measurement } from './measurement';

export interface CalibrationFn {
  /**
   * Pulls low-confidence values toward a neutral point rather than letting
   * them dominate downstream harsh (non-compensatory) composition.
   */
  <T>(m: Measurement<T>, toScalar: (value: T) => number, neutral?: number): number;
}
```

- [ ] **Step 4: Write `src/core/plannerConfig.ts`**

```ts
// PlannerConfig — dynamic, per-request preferences (ADR-002, ADR-004, ADR-005)
// This is the ONLY thing AI is allowed to configure. It never touches the
// Graph, the Planner's algorithm, or the Renderer.

import { NodeSignals } from './nodeSignals';
import { EdgeSignals } from './edgeSignals';
import { TransitionEdge } from './edgeSignals';
import { SearchResources } from './searchState';
import { CalibrationFn } from './calibration';

export interface HardConstraint {
  readonly name: string;
  /**
   * Receives the candidate edge, the resources the search state would have
   * *after* traversing it, and the calibration function — sufficient to
   * express edge-only constraints (invalid harmonic transition) as well as
   * resource-dependent constraints (duration tolerance, repetition) in a
   * single mechanism.
   */
  readonly check: (edge: TransitionEdge, resources: SearchResources, calibrate: CalibrationFn) => boolean;
}

export interface PlannerConfig {
  readonly hardConstraints: readonly HardConstraint[];
  readonly nodeWeights: Readonly<Record<keyof NodeSignals, number>>;
  readonly edgeWeights: Readonly<Record<keyof EdgeSignals, number>>;
  readonly pathObjectiveWeights: {
    readonly energyCurveAdherence: number;
    readonly diversity: number;
    readonly durationAdherence: number;
    readonly repetitionPenalty: number;
  };
  readonly targetDurationSec: number;
  readonly targetEnergyCurve: readonly number[]; // sampled 0-1 over normalized time
  readonly durationToleranceSec: number;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/core/plannerConfig.test.ts`
Expected: FAIL still, because `./searchState` doesn't exist yet (expected — Task 9 creates it). This is the one task in this plan with a forward reference; proceed to Step 6 before re-running.

- [ ] **Step 6: Create a minimal `searchState.ts` stub so this task's test can pass in isolation**

Write `src/core/searchState.ts` with only the `SearchResources` type (Task 9 will replace this file with the full version including `SearchState` and `mergeKey()` — expected, do not treat as duplicate work, Task 9's Step 1 starts from this file):

```ts
import { SectionType } from './nodeSignals';

export interface SearchResources {
  readonly elapsedDurationBucket: number;
  readonly energyBucket: number;
  readonly currentKeyBucket: string;
  readonly songDiversityCount: number;
  readonly recentSectionTypes: readonly SectionType[];
  readonly usedChunkIds: ReadonlySet<string>;
  readonly usedSongIds: ReadonlySet<string>;
  readonly history: readonly string[];
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest src/core/plannerConfig.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 8: Commit**

```bash
git add src/core/calibration.ts src/core/plannerConfig.ts src/core/plannerConfig.test.ts src/core/searchState.ts
git commit -m "feat(core): add CalibrationFn, HardConstraint, PlannerConfig"
```

---

### Task 9: SearchResources, SearchState, mergeKey()

**Files:**
- Modify: `src/core/searchState.ts` (replace Task 8's stub with the full module)
- Test: `src/core/searchState.test.ts`

**Interfaces:**
- Produces: `SearchResources`, `SearchState`, `mergeKey()` — consumed by `searchProblem.ts` (Task 10). `mergeKey()`'s Class A/B-only invariant is this plan's single most important test, per `implementation.md`'s Phase 1 acceptance criteria and ADR-007.

- [ ] **Step 1: Write the failing test**

```ts
import { SearchResources, mergeKey } from './searchState';

function baseResources(overrides: Partial<SearchResources> = {}): SearchResources {
  return {
    elapsedDurationBucket: 120,
    energyBucket: 3,
    currentKeyBucket: '8A',
    songDiversityCount: 2,
    recentSectionTypes: ['verse', 'chorus'],
    usedChunkIds: new Set(['A1', 'A2']),
    usedSongIds: new Set(['songA']),
    history: ['A1', 'A2'],
    ...overrides,
  };
}

describe('mergeKey()', () => {
  it('produces an identical key when only Class C fields (history) differ', () => {
    const a = baseResources({ usedChunkIds: new Set(['A1']), usedSongIds: new Set(['songA']), history: ['A1'] });
    const b = baseResources({ usedChunkIds: new Set(['B1', 'B2', 'B3']), usedSongIds: new Set(['songB']), history: ['B1', 'B2', 'B3'] });
    expect(mergeKey(a)).toBe(mergeKey(b));
  });

  it('produces a different key when a Class A field (elapsedDurationBucket) differs', () => {
    const a = baseResources({ elapsedDurationBucket: 120 });
    const b = baseResources({ elapsedDurationBucket: 180 });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });

  it('produces a different key when a Class A field (energyBucket) differs', () => {
    const a = baseResources({ energyBucket: 3 });
    const b = baseResources({ energyBucket: 4 });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });

  it('produces a different key when a Class A field (currentKeyBucket) differs', () => {
    const a = baseResources({ currentKeyBucket: '8A' });
    const b = baseResources({ currentKeyBucket: '9A' });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });

  it('produces a different key when a Class B field (songDiversityCount) differs', () => {
    const a = baseResources({ songDiversityCount: 2 });
    const b = baseResources({ songDiversityCount: 3 });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });

  it('produces a different key when a Class B field (recentSectionTypes) differs', () => {
    const a = baseResources({ recentSectionTypes: ['verse'] });
    const b = baseResources({ recentSectionTypes: ['chorus'] });
    expect(mergeKey(a)).not.toBe(mergeKey(b));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/searchState.test.ts`
Expected: FAIL — `mergeKey is not a function` (only `SearchResources` exists so far, from Task 8's stub).

- [ ] **Step 3: Replace `src/core/searchState.ts` with the full module**

```ts
// Search state / resources — ADR-007
// Class A (exact merge), Class B (approximate/compressed, merge-safe),
// Class C (historical, never part of mergeKey).

import { SectionType } from './nodeSignals';

export interface SearchResources {
  // --- Class A: exact, safe to merge on directly ---
  readonly elapsedDurationBucket: number;
  readonly energyBucket: number;
  readonly currentKeyBucket: string;

  // --- Class B: approximate/compressed summaries, exist to make merging feasible ---
  readonly songDiversityCount: number;
  readonly recentSectionTypes: readonly SectionType[]; // last N only

  // --- Class C: historical, NEVER included in mergeKey ---
  readonly usedChunkIds: ReadonlySet<string>;
  readonly usedSongIds: ReadonlySet<string>;
  readonly history: readonly string[]; // full chunk id sequence, for rendering + penalties
}

export interface SearchState {
  readonly currentNodeId: string;
  readonly accumulatedScore: number;
  readonly resources: SearchResources;
}

/**
 * Builds the merge key from Class A + Class B resources ONLY.
 * Class C (usedChunkIds, usedSongIds, history) must never appear here —
 * seeing them here is a bug, not a stricter merge.
 */
export function mergeKey(resources: SearchResources): string {
  return [
    resources.elapsedDurationBucket,
    resources.energyBucket,
    resources.currentKeyBucket,
    resources.songDiversityCount,
    resources.recentSectionTypes.join(','),
  ].join('|');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/core/searchState.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Re-run Task 8's test to confirm nothing broke**

Run: `npx jest src/core/plannerConfig.test.ts`
Expected: still PASS, 2 tests (the `SearchResources` shape is unchanged, only `SearchState`/`mergeKey` were added).

- [ ] **Step 6: Commit**

```bash
git add src/core/searchState.ts src/core/searchState.test.ts
git commit -m "feat(core): add SearchResources/SearchState/mergeKey (ADR-007 Class A/B/C split)"
```

---

### Task 10: Generic SearchProblem interface

**Files:**
- Create: `src/core/searchProblem.ts`
- Test: `src/core/searchProblem.test.ts`

**Interfaces:**
- Consumes: `PlannerConfig` (Task 8), `ChunkNode` (Task 6), `TransitionEdge` (Task 6), `SearchResources` (Task 9).
- Produces: `SearchProblem<TNode, TResource, TEdge>`, `MusicSearchProblem` — the generic contract Phase 4's planner is built against (ADR-006). Nothing in this plan implements it; the fixture below only proves it's satisfiable.

- [ ] **Step 1: Write the failing test**

```ts
import { MusicSearchProblem } from './searchProblem';
import { ChunkNode } from './nodeSignals';
import { TransitionEdge } from './edgeSignals';
import { SearchResources } from './searchState';
import { PlannerConfig } from './plannerConfig';
import { measurement } from './measurement';

function fixtureNode(id: string): ChunkNode {
  return {
    id,
    songId: 'songA',
    startTimeSec: 0,
    endTimeSec: 8,
    bars: 4,
    signals: {
      bpm: measurement(120, 0.9, 'BpmDetectorV1', '1.0.0'),
      key: measurement('8A', 0.8, 'KeyDetectorV2', '2.0.0'),
      energy: measurement(0.7, 0.85, 'EnergyDetectorV1', '1.0.0'),
      loudnessLufs: measurement(-14, 1.0, 'LoudnessDetectorV1', '1.0.0'),
      guitarPresence: measurement(0.1, 0.6, 'InstrumentClassifierV1', '1.0.0'),
      vocalPresence: measurement(0.9, 0.6, 'InstrumentClassifierV1', '1.0.0'),
      danceability: measurement(0.8, 0.7, 'DanceabilityV1', '1.0.0'),
      sectionType: measurement('verse', 0.75, 'SectionClassifierV1', '1.0.0'),
      embedding: measurement(new Float32Array([0.1]), 0.95, 'EmbeddingV1', '1.0.0'),
      genreDistribution: measurement({ pop: 1 }, 0.5, 'GenreClassifierV1', '1.0.0'),
    },
  };
}

function fixtureResources(): SearchResources {
  return {
    elapsedDurationBucket: 0,
    energyBucket: 0,
    currentKeyBucket: '8A',
    songDiversityCount: 1,
    recentSectionTypes: [],
    usedChunkIds: new Set(),
    usedSongIds: new Set(),
    history: [],
  };
}

const stubProblem: MusicSearchProblem = {
  getOutgoing: () => [],
  updateResources: (resource) => resource,
  isValid: () => true,
  mergeKey: () => 'k',
  edgeScore: () => 1,
  nodeScore: () => 1,
  pathScore: () => 1,
};

describe('MusicSearchProblem', () => {
  it('is satisfiable by a stub implementation and callable with real domain types', () => {
    const node = fixtureNode('A1');
    const resources = fixtureResources();
    const config = {} as PlannerConfig;
    expect(stubProblem.getOutgoing(node)).toEqual([]);
    expect(stubProblem.updateResources(resources, {} as TransitionEdge)).toBe(resources);
    expect(stubProblem.isValid(resources)).toBe(true);
    expect(stubProblem.nodeScore(node, config)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/searchProblem.test.ts`
Expected: FAIL — `Cannot find module './searchProblem'`.

- [ ] **Step 3: Write `src/core/searchProblem.ts`**

```ts
// Generic planner interface — ADR-006
// Zero knowledge of audio. TNode/TResource/TEdge are supplied by MixForge;
// this interface must be satisfiable by an entirely different domain too.

import { PlannerConfig } from './plannerConfig';
import { ChunkNode } from './nodeSignals';
import { TransitionEdge } from './edgeSignals';
import { SearchResources } from './searchState';

export interface SearchProblem<TNode, TResource, TEdge> {
  getOutgoing(node: TNode): readonly TEdge[];
  updateResources(resource: TResource, edge: TEdge): TResource;
  isValid(resource: TResource): boolean;
  mergeKey(resource: TResource): string;

  /** Non-compensatory (ADR-005): implementers should use product/geomean/min-style composition. */
  edgeScore(edge: TEdge, config: PlannerConfig): number;
  /** Intrinsic content score (ADR-004). */
  nodeScore(node: TNode, config: PlannerConfig): number;
  /** Compensatory/additive (ADR-005): energy curve, diversity, duration, repetition. */
  pathScore(resource: TResource, config: PlannerConfig): number;
}

export type MusicSearchProblem = SearchProblem<ChunkNode, SearchResources, TransitionEdge>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/core/searchProblem.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/core/searchProblem.ts src/core/searchProblem.test.ts
git commit -m "feat(core): add generic SearchProblem interface (ADR-006)"
```

---

### Task 11: RemixPlan + PlannerDiagnostics

**Files:**
- Create: `src/core/remixPlan.ts`
- Test: `src/core/remixPlan.test.ts`

**Interfaces:**
- Produces: `PlannerDiagnostics`, `RemixPlan` — consumed by `renderer.ts` (Task 12).

- [ ] **Step 1: Write the failing test**

```ts
import { RemixPlan } from './remixPlan';

describe('RemixPlan', () => {
  it('constructs a well-formed plan including diagnostics', () => {
    const plan: RemixPlan = {
      chunkIds: ['A1', 'A2', 'B2'],
      totalScore: 12.4,
      estimatedDurationSec: 24,
      diagnostics: {
        nearFailedConstraints: [{ constraintName: 'max-bpm-jump', atChunkId: 'A2' }],
        prunedCandidateCount: 7,
      },
    };
    expect(plan.chunkIds).toHaveLength(3);
    expect(plan.diagnostics.prunedCandidateCount).toBe(7);
    expect(plan.diagnostics.nearFailedConstraints[0].constraintName).toBe('max-bpm-jump');
  });

  it('allows empty diagnostics for a plan with no near-misses', () => {
    const plan: RemixPlan = {
      chunkIds: ['A1'],
      totalScore: 1,
      estimatedDurationSec: 8,
      diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 },
    };
    expect(plan.diagnostics.nearFailedConstraints).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/remixPlan.test.ts`
Expected: FAIL — `Cannot find module './remixPlan'`.

- [ ] **Step 3: Write `src/core/remixPlan.ts`**

```ts
// Output of planning — consumed by the Renderer.
// Named RemixPlan (not Path) and carries planner diagnostics from day one:
// retrofitting diagnostics into a planner that doesn't already thread them
// through is far more painful than carrying an empty/optional field.

export interface PlannerDiagnostics {
  readonly nearFailedConstraints: readonly { readonly constraintName: string; readonly atChunkId: string }[];
  readonly prunedCandidateCount: number;
}

export interface RemixPlan {
  readonly chunkIds: readonly string[];
  readonly totalScore: number;
  readonly estimatedDurationSec: number;
  readonly diagnostics: PlannerDiagnostics;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/core/remixPlan.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/remixPlan.ts src/core/remixPlan.test.ts
git commit -m "feat(core): add RemixPlan/PlannerDiagnostics (renamed from Path)"
```

---

### Task 12: Renderer interfaces

**Files:**
- Create: `src/core/renderer.ts`
- Test: `src/core/renderer.test.ts`

**Interfaces:**
- Consumes: `RemixPlan` (Task 11), `MusicGraph` (Task 7).
- Produces: `RenderOptions`, `Renderer`, `RenderedAudio` — the contract Phase 6's renderer implementation (`src/renderer/`) must satisfy. No implementation here.

- [ ] **Step 1: Write the failing test**

```ts
import { Renderer, RenderOptions, RenderedAudio } from './renderer';
import { RemixPlan } from './remixPlan';
import { MusicGraph } from './musicGraph';

describe('Renderer interface', () => {
  it('is satisfied by a stub async implementation', async () => {
    const stub: Renderer = {
      render: async (_plan, _graph, _options): Promise<RenderedAudio> => ({
        sampleRate: 44100,
        channels: 2,
        durationSec: 24,
        filePath: '/tmp/out.wav',
      }),
    };

    const plan: RemixPlan = {
      chunkIds: ['A1'],
      totalScore: 1,
      estimatedDurationSec: 24,
      diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 },
    };
    const graph: MusicGraph = { nodes: new Map(), edges: new Map(), getOutgoingEdges: () => [], getNode: () => undefined };
    const options: RenderOptions = { crossfadeCurve: 'equalPower', normalizeLoudnessLufs: -14 };

    const result = await stub.render(plan, graph, options);
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/renderer.test.ts`
Expected: FAIL — `Cannot find module './renderer'`.

- [ ] **Step 3: Write `src/core/renderer.ts`**

```ts
// Renderer — deterministic execution, no scoring logic.
// Interface only. The real implementation lives in src/renderer/ (Phase 6).

import { RemixPlan } from './remixPlan';
import { MusicGraph } from './musicGraph';

export interface RenderOptions {
  readonly crossfadeCurve: 'linear' | 'equalPower';
  readonly normalizeLoudnessLufs: number;
}

export interface RenderedAudio {
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSec: number;
  readonly filePath: string;
}

export interface Renderer {
  render(plan: RemixPlan, graph: MusicGraph, options: RenderOptions): Promise<RenderedAudio>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/core/renderer.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/core/renderer.ts src/core/renderer.test.ts
git commit -m "feat(core): add Renderer/RenderOptions/RenderedAudio interfaces"
```

---

### Task 13: Barrel export + Phase 1 sign-off

**Files:**
- Create: `src/core/index.ts`
- Test: `src/core/index.test.ts`

**Interfaces:**
- Consumes: every module from Tasks 5–12.
- Produces: the single entry point every later phase imports from (`import { ChunkNode, MusicGraph, ... } from '../core'`).

- [ ] **Step 1: Write the failing test**

```ts
import * as core from './index';

describe('src/core barrel export', () => {
  it('re-exports the measurement factory', () => {
    expect(typeof core.measurement).toBe('function');
  });

  it('re-exports mergeKey', () => {
    expect(typeof core.mergeKey).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/index.test.ts`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write `src/core/index.ts`**

```ts
export * from './measurement';
export * from './nodeSignals';
export * from './edgeSignals';
export * from './musicGraph';
export * from './calibration';
export * from './plannerConfig';
export * from './searchState';
export * from './searchProblem';
export * from './remixPlan';
export * from './renderer';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/core/index.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full suite and lint together**

Run: `npm run lint && npm test`
Expected: lint exits 0; all `src/core/*.test.ts` suites pass (Tasks 5–13, ~16 tests total).

- [ ] **Step 6: Commit**

```bash
git add src/core/index.ts src/core/index.test.ts
git commit -m "feat(core): add barrel export — Phase 1 domain model complete"
```

- [ ] **Step 7: Confirm Phase 1 acceptance criteria from `implementation.md` §5**

Manually verify (no further code changes):
- [ ] The domain model compiles (`npm run build` — i.e. `tsc --noEmit` — exits 0).
- [ ] Every type's invariants are checked with unit tests (`mergeKey()`'s Class A/B/C split — Task 9).
- [ ] No module besides `src/core/` has real content (`src/graph`, `src/scorer`, `src/planner`, `src/analysis`, `src/retrieval`, `src/renderer`, `src/ai` are still `export {};` placeholders from Task 1).

---

## Plan Self-Review Notes

- **Spec coverage:** every type in the corrected `docs/models.md` (post the `HardConstraint`/`RemixPlan`/ADR-reference fixes made earlier this session) has a task: `Measurement<T>` (5), `NodeSignals`/`ChunkNode`/`EdgeSignals`/`TransitionEdge` (6), `MusicGraph` (7), `CalibrationFn`/`HardConstraint`/`PlannerConfig` (8), `SearchResources`/`SearchState`/`mergeKey` (9), `SearchProblem`/`MusicSearchProblem` (10), `PlannerDiagnostics`/`RemixPlan` (11), `RenderOptions`/`Renderer`/`RenderedAudio` (12), barrel (13). Phase 0 tooling (bootstrap, lint boundary, Jest, CI) covered in Tasks 1–4.
- **Forward reference:** Task 8 needs `SearchResources` before Task 9 formally defines it; handled explicitly via a stub-then-replace step (Task 8 Step 6, Task 9 Step 3) rather than silently assuming file order — flagged inline so an agent executing tasks in isolation doesn't get stuck.
- **Type consistency:** `HardConstraint.check`'s signature `(edge, resources, calibrate)` is used identically in Task 8's test and matches the corrected `docs/models.md`/`docs/implementation.md` §8.1 `isValidResources` snippet. `RemixPlan`/`PlannerDiagnostics` field names match between Task 11 and Task 12's test fixture.
