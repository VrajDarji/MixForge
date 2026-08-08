import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';
import * as wav from 'node-wav';
import { MusicGraph, RemixPlan, RenderedAudio, Renderer, RenderOptions } from '../core';
import { approximateLufs, boundedStretchRatio, equalPowerFadeIn, equalPowerFadeOut, resampleLinear } from './utils';

// Duplicated from src/analysis/lib.ts's decode logic rather than imported:
// src/renderer/ is forbidden by eslint.config.js's import-boundary zone from
// importing src/analysis/ ("renderer depends on core + graph, NEVER planner
// internals" — the same boundary discipline extends to analysis/retrieval).
// This decodes only the requested [startSec, endSec) window, not the whole
// file, since the renderer only ever needs individual chunk segments.
function decodeAudioSegment(filePath: string, startSec: number, endSec: number, targetSampleRate: number): Float32Array {
  const tempWavPath = path.join(os.tmpdir(), `mixforge-render-decode-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  const duration = Math.max(endSec - startSec, 0.01);
  const result = spawnSync(
    ffmpegPath,
    ['-y', '-ss', String(startSec), '-i', filePath, '-t', String(duration), '-ac', '1', '-ar', String(targetSampleRate), '-f', 'wav', tempWavPath],
    { stdio: 'pipe' }
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg segment decode failed for ${filePath}: ${result.stderr?.toString() ?? 'unknown error'}`);
  }
  try {
    const buffer = fs.readFileSync(tempWavPath);
    return wav.decode(buffer).channelData[0];
  } finally {
    fs.unlinkSync(tempWavPath);
  }
}

// Equal-power crossfade + concatenate: overlaps the tail of `a` with the
// head of `b` over `crossfadeSamples`, rather than a hard splice — this is
// what keeps the join click-free (design.md §10's default crossfade curve).
function crossfadeConcat(a: Float32Array, b: Float32Array, crossfadeSamples: number): Float32Array {
  const bounded = Math.max(Math.min(crossfadeSamples, a.length, b.length), 0);
  if (bounded === 0) {
    const combined = new Float32Array(a.length + b.length);
    combined.set(a, 0);
    combined.set(b, a.length);
    return combined;
  }

  const output = new Float32Array(a.length + b.length - bounded);
  output.set(a.subarray(0, a.length - bounded), 0);
  for (let i = 0; i < bounded; i++) {
    const t = i / bounded;
    output[a.length - bounded + i] = a[a.length - bounded + i] * equalPowerFadeOut(t) + b[i] * equalPowerFadeIn(t);
  }
  output.set(b.subarray(bounded), a.length);
  return output;
}

const RENDER_SAMPLE_RATE = 44100;
const DEFAULT_CROSSFADE_SEC = 2;

export function createRenderer(): Renderer {
  return {
    render: async (plan: RemixPlan, graph: MusicGraph, options: RenderOptions): Promise<RenderedAudio> => {
      if (plan.chunkIds.length === 0) {
        throw new Error('cannot render a RemixPlan with zero chunks');
      }

      const nodes = plan.chunkIds.map((id) => {
        const node = graph.getNode(id);
        if (!node) throw new Error(`RemixPlan references unknown chunk id: ${id}`);
        if (!node.sourceFilePath) throw new Error(`chunk ${id} has no sourceFilePath — cannot render synthetic/test fixtures`);
        return node;
      });

      let output = decodeAudioSegment(nodes[0].sourceFilePath!, nodes[0].startTimeSec, nodes[0].endTimeSec, RENDER_SAMPLE_RATE);

      for (let i = 1; i < nodes.length; i++) {
        const fromNode = nodes[i - 1];
        const toNode = nodes[i];
        let segment = decodeAudioSegment(toNode.sourceFilePath!, toNode.startTimeSec, toNode.endTimeSec, RENDER_SAMPLE_RATE);

        const edge = graph.getOutgoingEdges(fromNode.id).find((e) => e.to === toNode.id);

        // Bounded time-stretch (design.md §10) if bpm differs — a safety
        // net; Phase 3's edge feasibility scoring is the primary control.
        const stretchRatio = boundedStretchRatio(fromNode.signals.bpm.value, toNode.signals.bpm.value);
        if (Math.abs(stretchRatio - 1) > 0.001) {
          segment = resampleLinear(segment, stretchRatio);
        }

        const crossfadeSec = edge?.signals.estimatedCrossfadeSec.value ?? DEFAULT_CROSSFADE_SEC;
        const crossfadeSamples = Math.round(crossfadeSec * RENDER_SAMPLE_RATE);
        output = crossfadeConcat(output, segment, crossfadeSamples);
      }

      // Final loudness normalization to the target LUFS via a single gain
      // stage (approximateLufs — see its own doc comment on the simplified
      // RMS-based approximation used here instead of true gated EBU R128).
      const gainDb = options.normalizeLoudnessLufs - approximateLufs(output);
      const gain = Math.pow(10, gainDb / 20);
      for (let i = 0; i < output.length; i++) {
        output[i] = Math.max(-1, Math.min(1, output[i] * gain));
      }

      const outputPath = path.join(os.tmpdir(), `mixforge-render-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
      fs.writeFileSync(outputPath, wav.encode([output], { sampleRate: RENDER_SAMPLE_RATE, bitDepth: 16 }));

      return {
        sampleRate: RENDER_SAMPLE_RATE,
        channels: 1,
        durationSec: output.length / RENDER_SAMPLE_RATE,
        filePath: outputPath,
      };
    },
  };
}
