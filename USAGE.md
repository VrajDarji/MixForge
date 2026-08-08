# Using MixForge

## Prerequisites

```bash
npm install
```

That's it — `ffmpeg-static` bundles its own FFmpeg binary (no separate install needed) and `essentia.js` runs via WebAssembly (no Python, no native build step).

## Running the CLI

```bash
npm run cli -- [flags] <song1> <song2> [...more songs]
```

The `--` after `cli` is required (it tells npm to pass the following flags to the script, not to npm itself).

### Flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `--output <path>` | **yes** | — | Where to write the rendered mix (WAV, mono, 44.1kHz, 16-bit). |
| `--prompt "<text>"` | no | `""` (no preferences applied) | Free-text description of what you want — see [Prompt Keywords](#prompt-keywords) below. |
| `--duration <seconds>` | no | AI/default config's target (1800s = 30 min, or whatever the prompt implies) | Overrides the target mix duration. When set without `--duration-tolerance`, tolerance auto-scales to `max(15s, 10% of duration)` rather than a flat default. |
| `--duration-tolerance <seconds>` | no | `max(15, duration * 0.1)` when `--duration` is set; otherwise the config's own default | How close to the target is "close enough" — the planner accepts the first chunk sequence landing within `duration ± tolerance` of raw chunk-time (not the final rendered time — see note below). Tighten this for a closer match; widen it if the planner can't find a valid sequence. |
| `--beam-width <n>` | no | `6` | How many parallel candidate sequences the planner explores at each step. Higher = more thorough search, slower. |
| `--max-steps <n>` | no | `30` | Maximum chunks the planner will try to chain together. |

Any non-flag arguments are treated as input song file paths (at least one required). MixForge accepts anything FFmpeg can decode — MP3, WAV, FLAC, M4A, OGG, etc.

### Examples

```bash
# Basic: two songs, no preferences, default ~30 minute target
npm run cli -- --output mix.wav song1.mp3 song2.mp3

# A short, high-energy mix
npm run cli -- --prompt "high energy dance mix" --duration 300 --output mix.wav *.mp3

# Vocal-forward, wider search
npm run cli -- --prompt "more vocal-forward, smooth transitions" --beam-width 10 --output mix.wav song1.mp3 song2.mp3 song3.mp3
```

### What happens when you run it

1. **Analyze** — each song is decoded and split into bar-aligned chunks; BPM, key, energy, loudness, danceability, and an embedding proxy are extracted per chunk (`src/analysis/`).
2. **Build the graph** — candidate transitions between chunks are found via a cheap-to-expensive filter funnel (tempo window → key compatibility → energy window → embedding similarity), and each surviving transition gets its own measurements (`src/retrieval/`).
3. **Configure** — your `--prompt` is translated into planner weights (`src/ai/`); `--duration` overrides the target length if given.
4. **Plan** — a diverse beam search finds the best chunk sequence hitting your target duration while avoiding musically bad transitions (`src/planner/`).
5. **Render** — the planned sequence is decoded from the original files, crossfaded together, time-corrected for BPM mismatches, and loudness-normalized (`src/renderer/`).

If no sequence exactly matches your target duration, MixForge falls back to the closest plan it found rather than failing outright — you'll see a warning printed (`no target-duration match found — rendered the best partial plan instead`).

**The final rendered file will usually be somewhat shorter than `--duration`, even on success.** The planner's duration accounting sums raw chunk lengths; the renderer then overlaps consecutive chunks during each crossfade, which shortens the final file. The CLI prints both numbers (`requested ~180s — rendered output is 127.8s`) so this is visible rather than a silent surprise. If you need to land closer to a specific length, target somewhat higher than you actually want, or tighten `--duration-tolerance` so the planner searches harder for a sequence near your target before accepting one.

## Prompt Keywords

The AI layer (`src/ai/lib.ts`) is a small, explicit keyword table — not an LLM. Multiple keywords in one prompt combine additively. Anything not matched below is silently ignored (your prompt won't error, it just won't add preferences beyond the default config).

| Say this (case-insensitive) | Effect |
|---|---|
| "guitar" | More guitar-forward chunks preferred |
| "vocal" | More vocal-forward chunks preferred |
| "dance" / "danceable" | Favors more danceable chunks |
| "energetic" / "high energy" / "upbeat" / "pump" | Raises the target energy curve |
| "chill" / "calm" / "mellow" / "low energy" / "relax" | Lowers the target energy curve |
| "smooth" / "seamless" | Weights transition smoothness (beat alignment + timbral similarity) more heavily |
| "variety" / "diverse" / "mix it up" / "different songs" | Favors pulling from more different songs |
| "short mix" / "quick mix" / "short set" / "quick set" | Targets a shorter duration (≤10 min) unless `--duration` overrides it |
| "long mix" / "extended mix" / "long set" / "extended set" / "marathon" | Targets a longer duration (≥60 min) unless `--duration` overrides it |

Not implemented (by design, for now): section-aware requests like "avoid long intros" — the current scorer doesn't score section type numerically, so a keyword for it would silently do nothing. See `docs/implementation.md` §9.1.

## Troubleshooting

- **"ffmpeg decode failed"** — the input file is likely corrupted or an unsupported/exotic codec. Try re-encoding it to a standard MP3/WAV first.
- **"no valid remix path could be found, and no partial plan was available"** — your song set may be too small or too musically incompatible (very different BPMs/keys) for the planner to find any valid transition at all. Try more songs, or songs closer in tempo/key.
- **Render sounds odd across a big BPM jump** — the renderer's time-stretch is a simple resample (changes pitch with speed) bounded to ±8%; transitions needing more correction than that were already supposed to be filtered out by scoring (`src/scorer/`) before reaching the renderer. If you hear an obviously bad transition anyway, that's worth reporting as a bug in the scoring thresholds.
- **Output is quieter/louder than expected** — final loudness normalization uses an RMS-based approximation, not true gated EBU R128 loudness. It should be close to the target within a few dB, not sample-accurate broadcast loudness.

## Using MixForge as a library

The CLI (`apps/cli/`) is a thin composition layer — every stage is a plain, independently-testable module you can import directly:

```ts
import { analyzeSong, decodeAudioFile } from './src/analysis';
import { buildTransitionEdges } from './src/retrieval';
import { buildMusicGraph, saveGraphToJson, loadGraphFromJson } from './src/graph';
import { interpretPrompt } from './src/ai';
import { planRemix, isPlanFailure } from './src/planner';
import { createRenderer } from './src/renderer';

const nodes = analyzeSong('mySong', decodeAudioFile('song.mp3'));
const edges = buildTransitionEdges(nodes, { bpmWindow: 20, energyWindow: 0.3, annTopK: nodes.length });
const graph = buildMusicGraph(nodes, edges);

saveGraphToJson(nodes, edges, 'graph.json'); // rebuild once, reuse many times
// const graph2 = loadGraphFromJson('graph.json');

const config = interpretPrompt('high energy');
const result = planRemix(graph, [nodes[0]], config, /* beamWidth */ 6, /* maxSteps */ 30);

if (!isPlanFailure(result)) {
  const rendered = await createRenderer().render(result, graph, {
    crossfadeCurve: 'equalPower',
    normalizeLoudnessLufs: -14,
  });
  console.log(rendered.filePath);
}
```

This is exactly what `apps/cli/lib.ts`'s `runMix()` does — read it for the full wiring, including error handling.
