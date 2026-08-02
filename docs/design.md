---

## Design Document v1.0

### AI Assisted Automatic DJ & Remix Planning Engine

---

# 1. Overview

## Vision

MixForge is an automatic remix generation engine that transforms a collection of songs into a seamless DJ-style mix.

Unlike traditional mashup tools, MixForge does not simply concatenate audio. Instead, it analyzes music, constructs a graph of musically compatible transitions, and searches that graph to generate an optimal remix according to user-defined objectives.

The AI component is intentionally lightweight. AI does not create audio or directly edit music. Instead, it configures planning preferences while deterministic DSP, graph optimization, and rendering produce the remix.

---

# 2. Goals

The system should:

- Produce musically coherent remixes.
- Preserve natural transitions.
- Optimize energy progression.
- Support user-driven remix preferences.
- Separate expensive offline analysis from fast online planning.
- Be deterministic and reproducible.
- Allow future replacement of scoring models without changing the graph structure.

---

# 3. Non Goals

The system is **not** intended to:

- Generate entirely new music.
- Train generative models.
- Perform source separation during planning.
- Depend on LLMs for transition decisions.
- Modify the graph during remix generation.

---

# 4. High-Level Architecture

```
                    User Songs
                         │
                         ▼
                 Audio Analysis Engine
                         │
                         ▼
             Musical Measurements Graph
                         │
             (Offline Construction)
──────────────────────────────────────────────
                  Planning Request
                         │
                         ▼
                  PlannerConfig
                         │
                         ▼
                 Scoring Layer
                         │
                         ▼
               Generic Graph Planner
                         │
                         ▼
                  Remix Timeline
                         │
                         ▼
                Audio Render Engine
                         │
                         ▼
                     Final Remix
```

---

# 5. System Components

## 5.1 Audio Analysis Engine

Responsibilities

- Decode audio.
- Segment songs.
- Extract musical measurements.
- Compute transition measurements.
- Build graph.

Output

```
Music Graph
```

No planning occurs here.

---

## 5.2 Music Graph

The graph is immutable.

Nodes represent chunks.

Edges represent possible transitions.

The graph stores **measurements**, never scores.

---

## 5.3 Planner

The planner operates on an abstract graph.

It has no understanding of:

- audio
- songs
- BPM
- keys
- embeddings

It only receives:

```
Nodes

Edges

PlannerConfig
```

and returns

```
Optimal Path
```

---

## 5.4 Renderer

Converts planned chunk sequence into audio.

Responsibilities

- trim
- beat align
- crossfade
- normalize
- export

---

# 6. Domain Model

## Song

Represents original uploaded media.

---

## Chunk

Represents a musically meaningful segment.

Contains

- metadata
- measurements
- raw timestamps

---

## Transition

Represents a possible jump between chunks.

Contains only measurements.

---

## Graph

Directed weighted graph.

Nodes = chunks.

Edges = transitions.

Immutable during planning.

---

## PlannerConfig

Contains runtime preferences.

Examples

- target duration
- desired energy
- node weights
- edge weights
- path weights
- hard constraints

PlannerConfig never modifies the graph.

---

# 7. Measurements

The graph stores measurements.

Measurements are observations.

They are not assumed to be ground truth.

Every measurement contains

```
value

confidence

detector

version
```

Example

```
Key

Value:
G Minor

Confidence:
0.83

Detector:
KeyDetectorV2
```

---

# 8. Graph Schema

## Node Measurements

Examples

- BPM
- Energy
- Loudness
- Embedding
- Danceability
- Guitar Presence
- Vocal Presence
- Section Type
- Mood
- Genre Distribution

Every measurement includes confidence.

---

## Edge Measurements

Examples

- BPM Difference
- Key Compatibility
- Beat Alignment
- Embedding Similarity
- Loudness Difference
- Crossfade Estimate

Again,

no scores are stored.

Only measurements.

---

# 9. Confidence Model

Measurements contain uncertainty.

Scoring never directly consumes raw measurements.

Pipeline

```
Measurement

↓

Confidence Calibration

↓

Reliable Measurement

↓

Scoring
```

Low-confidence detectors naturally contribute less to final scores.

---

# 10. Candidate Retrieval

Candidate retrieval is hierarchical.

```
Current Chunk

↓

Tempo Window

↓

Harmonic Compatibility

↓

Energy Window

↓

ANN Retrieval

↓

Transition Evaluation
```

ANN is not the retrieval engine.

It is only one stage.

---

# 11. Scoring Model

Scoring occurs online.

The graph remains unchanged.

Three independent scoring layers exist.

---

## Node Score

Represents intrinsic chunk quality.

Examples

- contains guitar
- vocals
- mood
- section type
- artist preference

Configured by PlannerConfig.

---

## Edge Score

Represents transition quality.

Examples

- BPM compatibility
- harmonic compatibility
- beat alignment
- embedding similarity

Edge score is intentionally non-compensatory.

A catastrophic transition cannot be hidden by strong performance elsewhere.

---

## Path Score

Represents remix quality.

Examples

- duration
- diversity
- energy curve
- repetition
- narrative progression

Path score is compensatory.

---

# 12. Constraint Hierarchy

Planning occurs in stages.

```
Candidate

↓

Hard Constraints

↓

Node Evaluation

↓

Edge Evaluation

↓

Path Evaluation

↓

Beam Selection
```

Hard constraints eliminate invalid candidates before scoring.

---

# 13. Generic Planner

Planner is implemented against

```
SearchProblem<
    Node,
    Resource,
    Edge
>
```

Planner owns

- search
- beam maintenance
- expansion

Planner never knows music semantics.

Music semantics are supplied by the SearchProblem implementation.

---

# 14. Resource Model

Resources are divided into three categories.

## Exact Resources

Examples

- elapsed duration bucket
- current node
- energy bucket

Safe for merge.

---

## Approximate Resources

Examples

- diversity count
- genre histogram

Compressed summaries.

Used for approximate DP.

---

## Historical Resources

Examples

- exact visited chunk set
- exact history

Never participate in merging.

---

# 15. State Merging

Planner performs approximate DP.

State merging is based on resource summaries.

It intentionally balances

```
optimality

vs

tractability
```

Merge signatures are engineering approximations.

They are not guaranteed sufficient statistics.

---

# 16. Search Algorithm

The planner searches the immutable `MusicGraph` using:

```
Diverse Beam Search

+

Approximate Dynamic Programming

+

State Memoization
```

Every planner expansion proceeds through the following pipeline:

```
Candidate Expansion

↓

Hard Constraint Evaluation

↓

Node Evaluation

↓

Edge Evaluation

↓

Path Evaluation

↓

Beam Selection
```

## Stage 1 — Candidate Expansion

The planner expands the current search state using the outgoing edges of the current node.

Candidate generation is purely structural and does not perform scoring.

---

## Stage 2 — Hard Constraint Evaluation

Hard constraints are binary feasibility checks.

Candidates failing any hard constraint are immediately discarded.

Typical hard constraints include:

- transition quality below minimum acceptable threshold
- maximum BPM jump exceeded
- invalid harmonic transition
- duration beyond allowable tolerance
- repeated chunk when repetition is disallowed

Hard constraints are intentionally **non-compensatory**.

A failed hard constraint cannot be recovered through high node or path scores.

---

## Stage 3 — Node Evaluation

Remaining candidates receive an intrinsic content score.

Node evaluation represents the standalone desirability of a chunk independent of its neighbors.

Examples include:

- instrumentation preference
- vocal presence
- section type
- mood
- artist preference

Node scoring is entirely configured by `PlannerConfig`.

---

## Stage 4 — Edge Evaluation

Each surviving transition receives a local transition quality score.

Edge scores are computed from confidence-calibrated measurements using a deliberately harsh, non-compensatory composition function.

Typical signals include:

- BPM compatibility
- harmonic compatibility
- beat alignment
- embedding similarity
- loudness compatibility

Unlike the hard constraints above, edge scoring differentiates between *good* transitions.

Transitions that are merely acceptable continue through the planner with different quality scores.

Transitions below the minimum quality threshold never reach this stage because they were already removed during hard constraint evaluation.

---

## Stage 5 — Path Evaluation

The planner evaluates the quality of the partial remix as a whole.

Unlike edge evaluation, path evaluation is intentionally compensatory.

Objectives include:

- energy curve adherence
- duration adherence
- song diversity
- repetition penalties
- narrative progression

Minor deviations in one objective may be offset by strengths in another.

---

## Stage 6 — Beam Selection

Remaining candidates are ranked using

```
NodeScore

+

EdgeScore

+

PathScore

+

BeamDiversityBonus
```

The planner keeps the highest-ranked diverse states for the next expansion.

Beam diversity prevents the search from collapsing into multiple nearly identical continuations of the same prefix.

---

# 17. Pipeline

Offline

```
Audio

↓

Measurements

↓

Chunk Generation

↓

Candidate Retrieval

↓

Transition Measurements

↓

Music Graph
```

Online

```
PlannerConfig

+

Music Graph

↓

Confidence Calibration

↓

Score Generation

↓

Graph Planning

↓

Chunk Timeline

↓

Rendering

↓

Audio
```

---

# 18. AI

AI is optional.

Responsibilities

- interpret prompts
- configure PlannerConfig

AI never

- edits audio
- creates transitions
- modifies graph

AI configures preferences only.

---

# 19. Architectural Decision Records (ADRs)

---

## ADR-001 — Offline graph construction, online path optimization

**Decision:** The system is split into two independent phases.

- **Offline** (expensive, run once per song set): decode → extract
measurements → generate chunks → retrieve candidates → compute transition
signals → build and persist the graph.
- **Online** (fast, run once per remix request): load graph → calibrate
signals → score → search → render.

**Why:** DSP, embedding generation, and ANN retrieval are expensive and
request-independent. Nothing in the online path should require re-running
DSP or ML. This also means the system scales by adding nodes to the graph,
not by rebuilding it.

---

## ADR-002 — Graph stores immutable measurements, never scalar scores

**Decision:** Nodes and edges in the persisted graph store immutable
`Measurement<T>` signal vectors (see domain model). They never store a
precomputed scalar "score." Scalar scores are transient, computed at
planning time from signals + a request-specific `PlannerConfig`.

**Why:** Scores are a function of preferences, which are request-specific
(AI-driven weight configuration, user prompts). Signals are properties of
the audio itself and don't change between requests. Baking a scalar score
into the graph would make it impossible to reconfigure preferences without
rebuilding the graph.

---

## ADR-003 — Candidate retrieval is a layered funnel, not embedding-first

**Decision:** Candidate transition retrieval runs as staged filters of
increasing cost, each shrinking the candidate pool before the next runs:

```
Cheap constraints (tempo window)
  → Medium features (harmonic/Camelot compatibility)
    → Expensive features (embedding ANN similarity)
      → Full transition evaluation
```

**Why:** Embeddings encode timbral similarity, not transition quality.
Running ANN search first wastes the top-K budget on timbrally-close but
musically incompatible candidates. Filtering on cheap, high-precision
constraints first (like a query planner) keeps ANN search scoped to
musically plausible candidates only, and is cheaper overall.

---

## ADR-004 — Node score represents intrinsic content, not context

**Decision:** `NodeScore` captures a chunk's intrinsic properties
(instrumentation, mood, section type, content-preference match). It is
independent of any adjacent chunk or the overall path. AI content
preferences ("more guitars," "avoid long intros") are expressed purely as
node-weight configuration, never by mutating the graph or the planner.

**Why:** Content preference is neither a transition property (edge) nor a
whole-path property (path score) — it belongs to the chunk itself.
Without this tier, content preferences would have to be smuggled into edge
or path scoring, which blurs those tiers' responsibilities.

---

## ADR-005 — Edge quality is intentionally non-compensatory

**Decision:**

Edge evaluation occurs in two stages.

1. **Feasibility**

Confidence-calibrated transition signals are evaluated against minimum acceptable quality thresholds.

Transitions failing these thresholds are rejected before planning continues.

1. **Quality Ranking**

Remaining transitions are scored using a harsh, non-compensatory composition function over calibrated transition signals.

The resulting score differentiates acceptable transitions by quality but is never responsible for rejecting catastrophically poor transitions.

Those have already been eliminated during feasibility evaluation.

**Why:**

Listeners rarely tolerate objectively bad transitions.

Treating catastrophic transitions as feasibility failures rather than soft penalties guarantees they cannot appear in the final remix while still allowing the planner to optimize among all musically acceptable alternatives.

---

## ADR-006 — Planner is domain-agnostic

**Decision:** The planner operates only against a generic interface:

```tsx
interface SearchProblem<TNode, TResource, TEdge> {
  getOutgoing(node: TNode): TEdge[];
  updateResources(resource: TResource, edge: TEdge): TResource;
  isValid(resource: TResource): boolean;
  mergeKey(resource: TResource): string;
  edgeScore(edge: TEdge, config: PlannerConfig): number;
  nodeScore(node: TNode, config: PlannerConfig): number;
  pathScore(resource: TResource, config: PlannerConfig): number;
}
```

The planner has no knowledge of audio, MP3s, MFCCs, embeddings, songs, or
keys. MixForge supplies the `SearchProblem` implementation; the planner
core could equally search any other domain's weighted state graph.

**Why:** This is the single most valuable abstraction boundary in the
system — it means the search algorithm (currently diverse beam search +
state memoization) can be swapped, tested, or reused independently of
anything music-specific.

---

## ADR-007 — State merging is a deliberate approximation, not a Markov-sufficiency guarantee

**Decision:** Search-state resources used for DP-style merging are
classified into three tiers:

- **Class A (exact):** safe to merge on directly — elapsed-duration
bucket, energy bucket, current node, current key bucket.
- **Class B (approximate/compressed):** lossy summaries that exist only to
make merging feasible — song-diversity count, genre histogram,
recent-N visited history.
- **Class C (historical, never merged):** exact used-chunk/used-song sets
and full path history. Retained on the surviving state for penalty
computation and rendering, but never part of `mergeKey`.

**Wording constraint:** Documentation and code comments must not claim
the merge key is Markov-sufficient. It is a deliberately chosen,
empirically-tunable approximation that trades search optimality for
tractability — two states sharing a merge key are *treated as* equivalent,
not *proven* equivalent.

**Why:** Exact-history merging essentially never fires (state spaces
diverge quickly), defeating the purpose of memoization. Class B exists to
make merging actually happen, at a known, explicit cost to optimality.

---

## ADR-008 — Beam selection must account for diversity, not score alone

**Decision:** Beam survivor selection at each expansion step optimizes
`pathScore + diversityBonus(beam)`, not raw path score alone. Diversity is
measured against the current beam (e.g. penalizing candidates sharing a
long common prefix, or grouping the beam into dissimilar sub-beams).

**Why:** Naive top-K beam selection collapses to K near-identical
continuations of the single highest-scoring prefix, wasting most of the
beam width on redundant exploration instead of genuinely different
musical directions.

---

## ADR-009 — Signals carry confidence and provenance; low-confidence signals are calibrated toward neutral before harsh composition

**Decision:** Every measurement stored on the graph is a
`Measurement<T> = { value, confidence, detector, version }`, not a bare
value. Before signals are combined into a node/edge score, a calibration
step adjusts each signal's contribution based on its confidence — a
low-confidence "bad" reading is pulled toward neutral rather than allowed
to dominate a non-compensatory (ADR-005) composition. Calibration is
independent of `PlannerConfig`: detector reliability is not a user
preference.

**Why:** DSP/ML detectors (key detection, beat tracking, section
classification) are estimators with real, non-uniform error rates, not
oracles. Harsh non-compensatory edge scoring (ADR-005) is exactly the
composition style most fragile to a single noisy input; without
confidence-aware calibration, a mis-detected key can silently destroy an
otherwise excellent transition. Provenance (`detector`, `version`) also
enables regression testing and safe re-scoring when a detector is
upgraded, without re-running the full DSP pipeline.

---

## Summary: the four frozen domain concepts

| Concept | Nature | Responsibility |
| --- | --- | --- |
| **Graph** | Static, immutable | Stores calibrated measurements (signals) on nodes and edges |
| **PlannerConfig** | Dynamic, per-request | Weights, hard constraints, objectives — the "preferences" |
| **Planner** | Generic, domain-agnostic | Consumes Graph + PlannerConfig → produces a Path |
| **Renderer** | Deterministic execution | Consumes Path → produces the final audio file |

No component leaks into another. AI configures `PlannerConfig`; it does
not touch the Graph, the Planner's algorithm, or the Renderer.

---

# 20. Future Evolution

The architecture intentionally allows replacing individual subsystems without affecting others:

- Replace linear scoring with a learned ranking model.
- Upgrade DSP detectors without changing the planner.
- Swap the planner algorithm (beam search, MCTS, label-setting, RL) without changing graph construction.
- Introduce user personalization by changing only `PlannerConfig`.
- Scale from local song collections to a global music graph without redesigning the planner.

## Closing Principle

The central philosophy of MixForge is:

> **Analyze once. Plan many times.**
> 

Audio analysis is expensive and performed once to build a reusable graph of musical measurements. Every remix thereafter is a graph search problem parameterized by user preferences, enabling deterministic, fast, and extensible remix generation without reprocessing the underlying audio.
