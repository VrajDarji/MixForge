Companion to `mixforge-adrs.md` and `mixforge-domain-model.ts`. The design
doc answers *what the system is*. This doc answers *how we build it
incrementally while always having something runnable* — the phase order,
the reasoning behind that order, the repository shape, and the actual
coding logic for the parts that aren't obvious from the architecture
alone.

---

# 1. Philosophy

Runtime execution and implementation order are **not the same graph**,
and conflating them is the most common way projects like this stall.

**Runtime execution** (what happens when a user requests a remix):

```
Audio → Analysis → Graph → Planner → Renderer
```

**Implementation order** (what we actually build first):

```
Contracts → Synthetic Graph → Scoring → Planner → DSP → Graph Builder → Renderer → AI
```

Notice the inversion: DSP sits near the *end* of the build order even
though it's the *first* thing that runs at runtime. This is deliberate,
for two reasons:

1. **DSP is the noisiest, hardest-to-debug subsystem.** Audio decoding,
beat tracking, and key detection fail in subtle, data-dependent ways.
If the planner is built on top of a DSP layer that isn't fully trusted
yet, every planner bug becomes ambiguous — is the search wrong, or is
the input data wrong? Building the planner against small, hand-written,
*known-correct* synthetic graphs removes that ambiguity entirely.
2. **The planner is the actual point of the project.** Per ADR-006, it's
fully decoupled from audio — that decoupling isn't just an
architectural nicety, it's a scheduling advantage. There is no
technical reason the beam search, calibration, and scoring logic can't
be fully working and unit-tested before a single line of `librosa`
code exists.

**Core discipline for the whole build: never implement two architectural
layers at the same time.** Don't touch the planner while writing DSP
code. Don't change the graph model while implementing rendering. Don't
introduce AI before the planner is deterministic and trusted. Don't
optimize before correctness is established. Every phase below produces a
stable, testable artifact with a frozen API before the next phase begins.
If you find yourself editing files in two different phases' folders in
the same sitting, stop and ask why.

---

# 2. Repository Layout

A monorepo, but with the module boundaries enforced by **lint rules
against a folder structure**, not by splitting into independently
versioned packages. True package separation (separate `package.json`s,
independent publishing) is real infrastructure overhead — dependency
graphs between packages, build ordering, workspace tooling — and buys
you very little as a solo developer iterating quickly at MVP stage. A
single package with strict import boundaries gets you the thing that
actually matters (the planner *cannot* import the analysis layer,
enforced at lint time, not just by convention) without the overhead.
Move to real workspace packages later, specifically when `apps/cli` and
`apps/desktop` need genuinely independent dependency graphs — not before.

```
mixforge/
  src/
    core/          # Phase 1 — Measurement, ChunkNode, TransitionEdge,
                    #           MusicGraph, PlannerConfig, SearchState,
                    #           SearchResources, SearchProblem, RemixPlan.
                    #           No algorithms. No DSP. No planner logic.
    graph/          # Phase 2/5 — MusicGraph implementation + persistence.
                    #           Depends on core only.
    scorer/         # Phase 3 — calibration, nodeScore, edgeScore, pathScore.
                    #           Depends on core only. No planner, no DSP.
    planner/        # Phase 4 — beam search, merge keys, diverse beam
                    #           selection, dead-end handling.
                    #           Depends on core + scorer. NEVER analysis.
    analysis/       # Phase 5 — decode, feature extraction, segmentation,
                    #           measurement generation. Depends on core only.
    retrieval/      # Phase 5 — candidate retrieval funnel, ANN index.
                    #           Depends on core + analysis outputs.
    renderer/       # Phase 6 — crossfade, beat-align, normalize, export.
                    #           Depends on core + graph. NEVER planner internals.
    ai/             # Phase 7 — prompt → PlannerConfig. Depends on core only.
  apps/
    cli/            # Phase 8 — wires everything together.
  test-data/
    synthetic/      # Phase 2 — hand-written graphs, no audio.
    audio/          # Phase 5+ — real fixture songs for DSP/integration tests.
  docs/
    architecture/   # design doc, ADRs
    implementation/ # this document
```

Enforce the dependency direction with an import-boundary lint rule
(`eslint-plugin-import`'s `no-restricted-paths`, or `dependency-cruiser`
if you want a visual dependency graph as a CI artifact). The one rule
that matters most: **`planner/` must never import from `analysis/` or
`retrieval/`.** That's the whole point of ADR-006 — make it fail the
build, not just fail code review.

---

# 3. Object Lifetimes and Data Ownership

Two small tables worth keeping visible while building — most accidental
coupling bugs come from forgetting one of these.

**Lifetimes** — how long each object lives, and who's responsible for it:

| Object | Lifetime | Created by | Destroyed by |
| --- | --- | --- | --- |
| `Song` | Persistent | Upload | Explicit deletion |
| `MusicGraph` | Persistent | Phase 5 build step | Explicit rebuild |
| `PlannerConfig` | Per-request | API/CLI request | End of request |
| `SearchState` | During search only | Planner, per beam step | Planner, when pruned/merged |
| `RemixPlan` | Per-request | Planner, on success | Consumed by renderer, then archived/discarded |
| Rendered audio | Output artifact | Renderer | User (download/delete) |

**Ownership** — which module is allowed to construct/mutate which type:

| Module | Owns | Never touches |
| --- | --- | --- |
| `analysis/` | `Measurement<T>` values | Scores, planner state |
| `graph/` | `ChunkNode`, `TransitionEdge`, `MusicGraph` | Scores, `PlannerConfig` |
| `scorer/` | Score computation (pure functions, no owned state) | The graph itself (read-only input) |
| `planner/` | `SearchState`, `SearchResources`, `RemixPlan` | Audio, DSP, rendering |
| `renderer/` | Waveforms, exported files | Scoring, search logic |
| `ai/` | `PlannerConfig` construction | Graph, planner internals |

If a change requires touching ownership outside a module's row, that's a
signal the boundary is being violated — stop and reconsider before
writing the code, not after.

---

# 4. Phase 0 — Project Foundation

**Goal:** the architectural skeleton exists; nothing music-related yet.

**Deliverables:**

- Repository initialized with the folder layout above.
- Linting configured, including the `planner/` → `analysis/` import-boundary rule (write this rule *now*, before any code exists to violate it — it should already be red/green testable with two placeholder files).
- Test runner configured (unit tests must be able to run in isolation per-module).
- CI pipeline: lint + test on every push, even with zero real code.
- `docs/` populated with the design doc, ADRs, and this implementation plan.

**Acceptance criteria:** `npm test` and `npm run lint` both pass on an
empty skeleton. The import-boundary rule can be verified by temporarily
adding a fake `import` from `planner/` to `analysis/` and confirming lint
fails, then removing it.

**Why this phase exists on its own:** it's tempting to skip straight to
Phase 1 and set up tooling "as you go." Don't — the import-boundary
enforcement is only meaningful if it exists *before* the modules it's
protecting, so violations are caught from the first line of real code
rather than retrofitted later.

---

# 5. Phase 1 — Core Domain Model

**Goal:** freeze the contracts every other phase builds against. This is
the highest-leverage phase in the whole plan — a mistake here propagates
into every later phase's tests.

**Implement** (in `src/core/`), exactly as specified in
`mixforge-domain-model.ts`:

- `Measurement<T>` — value, confidence, detector, version.
- `ChunkNode`, `NodeSignals` — intrinsic per-chunk measurements.
- `TransitionEdge`, `EdgeSignals` — pairwise transition measurements.
- `MusicGraph` — read-only interface (`getOutgoingEdges`, `getNode`).
- `PlannerConfig`, `HardConstraint` — request-scoped preferences.
- `SearchResources`, `SearchState` — Class A/B/C resource split, per ADR-007.
- `SearchProblem<TNode, TResource, TEdge>` — the generic planner contract.
- `RemixPlan` (renamed from `Path`) — chunk IDs, transition IDs, estimated
duration, and **planner diagnostics** (which hard constraints nearly
failed, which beam candidates were pruned and why — this earns its
place in the type now because retrofitting diagnostics into a planner
that doesn't already thread them through is much more painful than
including an empty/optional field from day one).

**No algorithms. No DSP. No planner logic.** If you catch yourself
writing a `function` body with real logic in this phase (beyond trivial
constructors/factories), it belongs in a later phase.

**Acceptance criteria:** the domain model compiles, every type's
invariants are checked with unit tests (e.g. `mergeKey()` only reads
Class A/B fields — write a test that mutates Class C fields and asserts
the merge key is unchanged), and no other module has been started yet.

---

# 6. Phase 2 — Synthetic Graph

**Goal:** prove the `MusicGraph` interface actually works, with zero
dependency on audio, FFmpeg, or any DSP library.

**Build** (in `test-data/synthetic/` + `src/graph/`):

Hand-write a small graph — small enough to reason about by hand, large
enough to exercise real structure:

```
Song A: chunks A1, A2, A3
Song B: chunks B1, B2, B3

Edges (with explicit, hand-chosen signal values):
  A1 -> A2   (good transition:  bpmDelta=0,  keyCompatible=true,  embeddingSim=0.9)
  A2 -> B2   (good transition:  bpmDelta=2,  keyCompatible=true,  embeddingSim=0.7)
  B2 -> A3   (bad transition:   bpmDelta=25, keyCompatible=false, embeddingSim=0.2)
  A1 -> B1   (mediocre:         bpmDelta=8,  keyCompatible=true,  embeddingSim=0.5)
```

Deliberately include known-good, known-bad, and known-mediocre edges —
this fixture is what Phase 3 and Phase 4 will validate against, so its
correctness matters as much as any production code.

Implement the `graph/` module's `MusicGraph` (in-memory implementation is
enough for this phase — no persistence yet).

**Acceptance criteria:** load the synthetic graph, call
`getOutgoingEdges("A1")` and get back the two expected edges with correct
signal values; confirm the graph is immutable (attempting to mutate an
edge from outside `graph/` should be a type error, not just a lint
warning).

---

# 7. Phase 3 — Scoring Engine

**Goal:** node/edge/path scoring fully working and tested against the
Phase 2 synthetic graph. Still zero DSP dependency.

**7.1 — Calibration (ADR-009)**

```tsx
const calibrate: CalibrationFn = (measurement, toScalar, neutral = 0.5) => {
  const raw = toScalar(measurement.value);
  // confidence 1.0 -> raw passes through unchanged
  // confidence 0.0 -> raw is fully replaced by neutral
  return neutral + measurement.confidence * (raw - neutral);
};
```

Simple linear lerp toward neutral, proportional to `(1 - confidence)`.
Treat this as a placeholder to revisit once real detector confidence
distributions exist (Phase 5) — but it's enough to build and test the
rest of the scoring pipeline against now.

**7.2 — Edge evaluation (ADR-005, two-stage: feasibility, then quality)**

```tsx
interface EdgeEvalResult { feasible: boolean; qualityScore: number; }

function evaluateEdge(edge: TransitionEdge, config: PlannerConfig): EdgeEvalResult {
  const calibrated = {
    bpm:       calibrate(edge.signals.bpmDelta,            v => 1 - Math.min(Math.abs(v) / 20, 1)),
    key:       calibrate(edge.signals.keyCompatibility,     v => (v ? 1 : 0)),
    beat:      calibrate(edge.signals.beatAlignment,        v => v),
    embedding: calibrate(edge.signals.embeddingSimilarity,  v => v),
    loudness:  calibrate(edge.signals.loudnessDelta,        v => 1 - Math.min(Math.abs(v) / 6, 1)),
  };

  // Stage 1 — feasibility: hard reject below a per-dimension floor.
  // This is what stops a catastrophic transition from ever reaching
  // scoring, which is what makes edge quality safe to sum across a path
  // without one bad transition being diluted by good ones elsewhere.
  const MIN_ACCEPTABLE = 0.3; // tune empirically once real data exists
  const feasible = Object.values(calibrated).every(v => v >= MIN_ACCEPTABLE);
  if (!feasible) return { feasible: false, qualityScore: 0 };

  // Stage 2 — quality ranking among survivors only: harsh, non-compensatory
  // geometric mean, so a weak-but-still-feasible dimension still drags
  // the score down without being an outright rejection.
  const weighted = Object.entries(calibrated).map(
    ([k, v]) => Math.pow(v, config.edgeWeights[k as keyof EdgeSignals] ?? 1)
  );
  const product = weighted.reduce((a, b) => a * b, 1);
  return { feasible: true, qualityScore: Math.pow(product, 1 / weighted.length) };
}
```

**7.3 — Node evaluation (ADR-004, compensatory)**

```tsx
function evaluateNode(node: ChunkNode, config: PlannerConfig): number {
  let score = 0;
  for (const [key, weight] of Object.entries(config.nodeWeights)) {
    const measurement = node.signals[key as keyof NodeSignals];
    score += weight * calibrate(measurement as Measurement<number>, v => v);
  }
  return score;
}
```

**7.4 — Path evaluation (compensatory, additive)**

```tsx
function evaluatePath(resources: SearchResources, config: PlannerConfig): number {
  const durationDelta = Math.abs(resources.elapsedDurationBucket - config.targetDurationSec);
  const durationScore = 1 - Math.min(durationDelta / config.durationToleranceSec, 1);

  const targetEnergy = sampleEnergyCurve(
    config.targetEnergyCurve,
    resources.elapsedDurationBucket / config.targetDurationSec
  );
  const energyScore = 1 - Math.abs(resources.energyBucket - targetEnergy);
  const diversityScore = resources.songDiversityCount / Math.max(resources.history.length, 1);

  const w = config.pathObjectiveWeights;
  return w.durationAdherence * durationScore
       + w.energyCurveAdherence * energyScore
       + w.diversity * diversityScore;
  // repetitionPenalty subtracted separately, derived from usedChunkIds/usedSongIds
}
```

**Acceptance criteria (per the original design review — this is the
phase where "changing the config changes the score" gets proven, not
assumed):**

- The known-bad edge from the Phase 2 fixture (`B2 -> A3`) is correctly
marked infeasible, not merely low-scoring.
- A synthetic low-confidence *bad* reading (e.g. `keyCompatible: false, confidence: 0.1`) gets calibrated toward neutral and *passes*
feasibility, while the same bad reading at `confidence: 0.95` fails it
— this is the concrete test that ADR-009's calibration is actually
doing something, not just present in the code.
- Two different `PlannerConfig`s produce two different `nodeScore`
results for the same node, with zero changes to the graph.

---

# 8. Phase 4 — Generic Planner

**Goal:** diverse beam search + approximate DP fully working against the
Phase 2 synthetic graph and Phase 3 scoring functions. This is the
highest-value phase to get right, and the last one before DSP begins.

```tsx
function planRemix(
  graph: MusicGraph,
  startCandidates: ChunkNode[],
  config: PlannerConfig,
  beamWidth: number,
  maxSteps: number
): RemixPlan | { failure: "no_valid_path"; bestPartial?: RemixPlan } {
  let beam: SearchState[] = startCandidates.map(initialState);

  for (let step = 0; step < maxSteps; step++) {
    const candidates: SearchState[] = [];

    for (const state of beam) {
      for (const edge of graph.getOutgoingEdges(state.currentNodeId)) {
        const evalResult = evaluateEdge(edge, config);
        if (!evalResult.feasible) continue;                 // Stage 2 hard reject

        const nextNode = graph.getNode(edge.to)!;
        const nextResources = updateResources(state.resources, edge, nextNode);
        if (!isValidResources(edge, nextResources, config)) continue; // other hard constraints

        const score = state.accumulatedScore
          + evalResult.qualityScore
          + evaluateNode(nextNode, config)
          + evaluatePath(nextResources, config);

        candidates.push({ currentNodeId: edge.to, accumulatedScore: score, resources: nextResources });
      }
    }

    if (candidates.length === 0) return handleDeadEnd(beam, config);

    beam = selectDiverseBeam(candidates, beamWidth);         // ADR-007 merge + ADR-008 diversity

    if (beam.some(s => isWithinTargetDuration(s.resources, config))) break;
  }

  const best = beam
    .filter(s => isWithinTargetDuration(s.resources, config))
    .sort((a, b) => b.accumulatedScore - a.accumulatedScore)[0];

  return best ? toRemixPlan(best) : { failure: "no_valid_path", bestPartial: toRemixPlan(beam[0]) };
}
```

**8.1 — Duration/repetition hard constraints (`PlannerConfig.hardConstraints`)**

`evaluateEdge`'s feasibility stage (§7.2) only sees the edge — it cannot express
constraints that depend on accumulated resources, like "duration beyond
tolerance" or "repeated chunk when repetition is disallowed" (§design.md
Stage 2). Those run here, against the *would-be* next resources, before a
candidate is admitted to the beam:

```tsx
function isValidResources(
  edge: TransitionEdge,
  resources: SearchResources,
  config: PlannerConfig
): boolean {
  return config.hardConstraints.every(c => c.check(edge, resources, calibrate));
}
```

**8.2 — Merge + diverse selection (ADR-007 + ADR-008)**

```tsx
function selectDiverseBeam(candidates: SearchState[], width: number): SearchState[] {
  // Merge: group by mergeKey (Class A/B resources only), keep the
  // best-scoring state per key. This is the approximate-DP step —
  // two states sharing a key are TREATED as equivalent, not proven so.
  const byKey = new Map<string, SearchState>();
  for (const c of candidates) {
    const key = mergeKey(c.resources);
    const existing = byKey.get(key);
    if (!existing || c.accumulatedScore > existing.accumulatedScore) byKey.set(key, c);
  }

  // Diverse top-K: greedily fill the beam, reserving slots so the beam
  // doesn't collapse into K near-identical continuations of one prefix.
  const merged = [...byKey.values()].sort((a, b) => b.accumulatedScore - a.accumulatedScore);
  const selected: SearchState[] = [];
  const nodeCounts = new Map<string, number>();
  for (const c of merged) {
    if (selected.length >= width) break;
    const count = nodeCounts.get(c.currentNodeId) ?? 0;
    if (count >= 1 && selected.length < width - 1) continue;
    selected.push(c);
    nodeCounts.set(c.currentNodeId, count + 1);
  }
  return selected;
}
```

**8.3 — Dead-end handling**

```tsx
function handleDeadEnd(
  beam: SearchState[],
  config: PlannerConfig
): RemixPlan | { failure: "no_valid_path"; bestPartial?: RemixPlan } {
  const best = beam.sort((a, b) => b.accumulatedScore - a.accumulatedScore)[0];
  const relaxedTolerance = config.durationToleranceSec * 3;
  if (Math.abs(best.resources.elapsedDurationBucket - config.targetDurationSec) <= relaxedTolerance) {
    return toRemixPlan(best);
  }
  return { failure: "no_valid_path", bestPartial: toRemixPlan(best) };
}
```

**Acceptance criteria:**

- On the Phase 2 fixture, the planner reliably avoids `B2 -> A3` (the
known-bad edge) in every returned path.
- A dedicated fixture graph with *no* valid continuation from some
reachable state exercises `handleDeadEnd` and returns a well-formed
failure result rather than throwing or hanging.
- Beam collapse is directly testable: construct a fixture where one
prefix dominates by score, and assert the final beam contains more
than one distinct `currentNodeId` after several steps — this proves
`selectDiverseBeam` is doing real work, not just sorting.
- Run the same request twice with the same inputs and confirm identical
output (determinism, per the original design goals) — this requires
deterministic tie-breaking in both the merge and the diverse-selection
sort (sort by `(score, id)`, never rely on insertion order).

---

# 9. Phase 5 — Graph Builder (DSP + Retrieval)

**Goal:** produce a real `MusicGraph` from actual audio files. This is
where the project's DSP work begins — deliberately last among the "core
system" phases, per the philosophy in Section 1.

**9.1 — Analysis (`src/analysis/`)**

| Step | Approach | Confidence signal |
| --- | --- | --- |
| Decode | `ffmpeg` or `librosa.load` → PCM float32 | n/a (deterministic) |
| BPM/beat grid | `librosa.beat.beat_track` | tempo-histogram peak sharpness |
| Key | chroma (`librosa.feature.chroma_cqt`) + Krumhansl-Schmuckler correlation | correlation margin between best and second-best key |
| Segmentation | snap to bar boundaries (4/8/16 bars) from the beat grid; structural (verse/chorus) labeling explicitly deferred past MVP | beat-tracking confidence at the boundary |
| Energy/loudness | `librosa.feature.rms`, `pyloudnorm` | n/a (deterministic within tolerance) |
| Embedding | pretrained audio embedding model (OpenL3/CLAP) | fixed high default (~0.95) — these models don't expose calibrated uncertainty |
| Guitar/vocal presence | lightweight pretrained classifier, or embedding-derived proxy if unavailable | classifier's own confidence output, if exposed |

Output: `ChunkNode[]` with every `NodeSignals` field populated as a real
`Measurement<T>` — not placeholder confidence values.

**9.2 — Retrieval funnel (`src/retrieval/`, ADR-003)**

```tsx
function retrieveCandidates(
  from: ChunkNode,
  indices: { tempoIndex: TempoIndex; ann: AnnIndex },
  params: RetrievalParams
): ChunkNode[] {
  let pool = indices.tempoIndex.queryRange(
    from.signals.bpm.value - params.bpmWindow,
    from.signals.bpm.value + params.bpmWindow
  );                                                                   // Stage 1: cheap

  const compatibleKeys = CAMELOT_COMPATIBLE[from.signals.key.value];
  pool = pool.filter(c => compatibleKeys.has(c.signals.key.value));    // Stage 2: cheap

  pool = pool.filter(c =>
    Math.abs(c.signals.energy.value - from.signals.energy.value) <= params.energyWindow
  );                                                                   // Stage 3: cheap

  const annIds = new Set(indices.ann.queryTopK(from.signals.embedding.value, params.annTopK));
  pool = pool.filter(c => annIds.has(c.id));                           // Stage 4: expensive, on the shrunk pool only

  return pool;
}
```

Each stage is strictly cheaper than the next and shrinks the pool first
— never run the ANN query against the full chunk set.

**9.3 — Edge signal computation and persistence**

For each surviving `(from, candidate)` pair, compute `EdgeSignals`.
Derived-measurement confidence should combine the two source
measurements — `min(from.confidence, to.confidence)` is a reasonable
starting rule, refine empirically once real data is visible.

Persistence for MVP: SQLite (or a single serialized JSON per song set)
for metadata; the ANN library's native on-disk format for the vector
index. No need for Postgres until multi-user concurrent access matters.

**Acceptance criteria:** given a real audio file, produce a `ChunkNode[]`
with plausible (not placeholder) confidence values; given a `ChunkNode[]`
across multiple songs, produce a `MusicGraph` that round-trips through
persistence unchanged; feed this real graph into the *unmodified* Phase 4
planner and confirm it runs without any planner code changes — this is
the acceptance test for ADR-006 itself.

---

# 10. Phase 6 — Renderer

**Goal:** turn a `RemixPlan` into a playable audio file.

```
For each consecutive (chunkA, chunkB) in plan.chunkIds:
  load chunkA/chunkB source audio at their timestamps
  compute crossfade window from edge.signals.estimatedCrossfadeSec
  beat-align chunkB's entry point to chunkA's exit beat
  apply small time-stretch if bpmDelta is nonzero (bounded — see below)
  crossfade (equal-power curve default)
concatenate all segments
normalize final loudness to target LUFS
export
```

Bound time-stretch/pitch-shift explicitly: reject or heavily discount
edges requiring >8% tempo stretch or >2 semitones of pitch correction.
This should already be reflected in `bpmDelta`'s contribution to edge
feasibility (Phase 3), so treat renderer-side enforcement as a safety
net, not the primary control.

**Acceptance criteria — kept objective and automatable, not just "sounds
good," per the earlier design review:**

- Output duration is within tolerance of `RemixPlan.estimatedDurationSec`.
- No discontinuity/click at splice points — assert via an
amplitude-derivative spike detector at each crossfade boundary.
- Output loudness is within the target LUFS range.
- Each crossfade's actual duration matches its edge's
`estimatedCrossfadeSec` within tolerance.
- In addition to the above automated checks, do a manual listening pass
on a handful of outputs — audio quality genuinely needs ears, but it
shouldn't be the *only* gate.

---

# 11. Phase 7 — AI Config Layer

**Goal:** map a free-text prompt to a `PlannerConfig`.

MVP approach: skip the LLM initially. Use a small, explicit
keyword→weight mapping table (`"more guitars"` →
`nodeWeights.guitarPresence += 1.5`; `"avoid long intros"` → a penalty on
intro-tagged chunks in `nodeWeights.sectionType`). This is testable,
debuggable, and sufficient for MVP. Swap in an LLM-based interpreter
later — since its only output is a `PlannerConfig` object, this is a
drop-in replacement per ADR-002/ADR-006's separation, with zero changes
to the graph or planner.

**Acceptance criteria:** a fixed set of example prompts each produce a
valid, sensible `PlannerConfig` diff from defaults; malformed/unsupported
prompts fail gracefully (return the default config, don't throw).

---

# 12. Phase 8 — Optimization

Only after the MVP is functionally complete and correct. In rough
priority order:

- ANN index tuning (recall/latency tradeoff).
- Caching computed `EdgeSignals` more aggressively across overlapping
song sets.
- Parallelizing DSP across songs (independent per-song work, embarrassingly parallel).
- Graph compression for large song libraries.
- **Incremental graph updates** — note this one is really a *feature*
(the "add songs without rebuilding" capability from the long-term
vision), not purely a performance optimization; worth tracking
separately from the pure-perf items above once you get here.

---

# 13. Testing Strategy Summary

| Phase | Validation |
| --- | --- |
| 0 | Project builds, lints, tests run; import-boundary rule demonstrably fails on a violation |
| 1 | Domain model compiles; `mergeKey()` invariant tests pass |
| 2 | Synthetic graph loads; `MusicGraph` API returns correct, immutable data |
| 3 | Bad edges marked infeasible (not just low-scored); calibration changes feasibility outcomes at different confidence levels; config changes scores without touching the graph |
| 4 | Planner avoids known-bad edges; dead-end fixture exercises `handleDeadEnd`; beam diversity is directly asserted; identical inputs produce identical outputs |
| 5 | Real audio produces plausible (non-placeholder) confidence values; graph round-trips through persistence; the *unmodified* Phase 4 planner runs against the real graph |
| 6 | Duration, splice continuity, loudness, and crossfade timing all pass automated checks; manual listening pass on a sample |
| 7 | Example prompts map to sensible config diffs; malformed prompts degrade gracefully |
| 8 | Performance targets (graph build time, planning latency, render time) met — after, not instead of, correctness |