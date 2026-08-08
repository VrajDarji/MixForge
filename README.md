# MixForge

An automatic remix generation engine that turns a folder of songs into a seamless DJ-style mix.

MixForge doesn't just concatenate audio. It analyzes each song, builds a graph of musically compatible transitions between chunks, and searches that graph to produce an optimal remix for a set of objectives — target duration, energy arc, song diversity, and more. A lightweight AI layer translates a free-text prompt ("high energy dance mix") into planner preferences; it never touches the audio directly.

> **Central philosophy:** *Analyze once. Plan many times.* Audio analysis is expensive and runs once per song set to build a reusable graph. Every remix after that is a graph search parameterized by preferences — deterministic, fast, and re-runnable without touching the audio again.

## Status

All 8 phases of the design are implemented and wired end to end:

| Phase | What | Status |
|---|---|---|
| 0-1 | Project foundation, core domain model | ✅ |
| 2 | Synthetic graph fixture + in-memory graph | ✅ |
| 3 | Scoring engine (node/edge/path scores) | ✅ |
| 4 | Generic planner (diverse beam search) | ✅ |
| 5 | Real audio analysis, retrieval, graph persistence | ✅ |
| 6 | Renderer (crossfade, time-stretch, loudness) | ✅ |
| 7 | AI config layer (prompt → planner preferences) | ✅ |
| 8 | CLI (`apps/cli`) + web UI (`apps/web`) | ✅ |

137 tests passing, `npm run lint` and `npm run build` clean. See [USAGE.md](./USAGE.md) for how to actually run it.

## Quick Start

**CLI:**
```bash
npm install
npm run cli -- --prompt "high energy dance mix" --output my-mix.wav song1.mp3 song2.mp3 song3.mp3
```

**Or a browser UI** — pick songs from a file picker, fill in a form, download the result:
```bash
npm install
npm run web
# open http://localhost:4173
```

Either way: MixForge decodes each song, extracts BPM/key/energy/loudness measurements, builds a transition graph, searches it for the best sequence matching your prompt, renders the result with crossfades, and gives you back a WAV file. Full flag reference and examples in [USAGE.md](./USAGE.md).

## Architecture

```
User Songs → Audio Analysis → Music Graph          (offline, once per song set)
                                    │
Prompt → AI Config → Scoring → Generic Planner → Remix Timeline → Renderer → Final Mix   (online, per request)
```

- **Graph** (`src/graph/`) — immutable, stores calibrated *measurements* (BPM, key, energy, embeddings, ...), never scores. Persists to JSON.
- **Scorer** (`src/scorer/`) — turns measurements + a `PlannerConfig` into node/edge/path scores. Edge scoring is a two-stage, non-compensatory pipeline (hard feasibility reject, then harsh geometric-mean quality ranking) — a single catastrophic transition can't be masked by a good score elsewhere.
- **Planner** (`src/planner/`) — diverse beam search + approximate DP over the graph. Fully generic in principle (frozen `SearchProblem<TNode,TResource,TEdge>` interface in `src/core/`); this project's concrete driver knows nothing about audio beyond what the scorer hands it.
- **Analysis** (`src/analysis/`) — decodes audio (`ffmpeg`) and extracts real measurements via `essentia.js` (BPM/beat, key, loudness, danceability, an MFCC-based embedding proxy).
- **Retrieval** (`src/retrieval/`) — a layered candidate funnel (cheap tempo/key/energy filters before the more expensive embedding similarity), per ADR-003.
- **Renderer** (`src/renderer/`) — turns a planned chunk sequence into real audio: equal-power crossfades, a bounded time-stretch for BPM mismatches, final loudness normalization.
- **AI** (`src/ai/`) — maps a free-text prompt to a `PlannerConfig` diff via an explicit keyword table (see `USAGE.md` for the full list). Optional — a default config works with no prompt at all. Never touches the graph, planner, or renderer.

Every module boundary above (`planner/` never importing `analysis/`, `renderer/` never importing `planner/` internals, etc.) is enforced at lint time by `eslint.config.js`'s `import/no-restricted-paths` zones, not just by convention.

The full design rationale, architectural decision records, and domain model live in [`docs/design.md`](./docs/design.md) and [`docs/models.md`](./docs/models.md). The phase-by-phase build plan is in [`docs/implementation.md`](./docs/implementation.md).

## Development

```bash
npm install       # install dependencies
npm test          # run the full test suite (133 tests)
npm run lint      # ESLint, including the module-boundary rules
npm run build     # tsc --noEmit type check
npm run cli -- ... # run the CLI directly via ts-node (see USAGE.md)
```

Test fixtures under `test-data/audio/` are synthetic (click-track + chord-tone WAV files), not real music — generated once to have license-free audio to test the DSP pipeline against. For genuine musical validation, run the CLI against your own songs.

## License and Third-Party Notices

This project itself has no license file yet — treat it as private/unpublished until one is added.

**Important:** [`essentia.js`](https://github.com/MTG/essentia.js) (used for audio analysis) is licensed **AGPL-3.0**. If MixForge is ever distributed or run as a network service, AGPL generally requires the whole project to be released under AGPL too, unless `essentia.js` is isolated behind a strict service boundary. This was a deliberate, informed choice for this stage of the project — revisit it before any public release or distribution.

`ffmpeg-static` bundles a static FFmpeg binary (LGPL/GPL depending on build) used for audio decoding.
