import * as fs from 'fs';
import * as path from 'path';
import * as wav from 'node-wav';
import {
  ChunkNode,
  measurement,
  Measurement,
  MusicGraph,
  RemixPlan,
  RenderOptions,
  TransitionEdge,
} from '../../core';
import { createRenderer } from '../lib';

const FIXTURE_A = path.join(__dirname, '../../../test-data/audio/synthetic-a-128bpm-aminor.wav');
const FIXTURE_B = path.join(__dirname, '../../../test-data/audio/synthetic-b-120bpm-cmajor.wav');

function m<T>(value: T): Measurement<T> {
  return measurement(value, 1, 'test', '1.0.0');
}

function chunkNode(id: string, songId: string, sourceFilePath: string, bpm: number, key: string): ChunkNode {
  return {
    id,
    songId,
    startTimeSec: 0,
    endTimeSec: 4,
    bars: 2,
    sourceFilePath,
    signals: {
      bpm: m(bpm),
      key: m(key),
      energy: m(0.5),
      loudnessLufs: m(-14),
      guitarPresence: m(0.3),
      vocalPresence: m(0.3),
      danceability: m(0.5),
      sectionType: m('verse'),
      embedding: m(new Float32Array(13)),
      genreDistribution: m({ unknown: 1 }),
    },
  };
}

// Small local MusicGraph builder — src/renderer/ is forbidden by
// eslint.config.js's import-boundary zone from importing src/graph/, so
// this test (like Task 5's planner test) builds the fixture graph by hand
// rather than using buildMusicGraph().
function buildTestGraph(nodes: readonly ChunkNode[], edges: readonly TransitionEdge[]): MusicGraph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n] as const));
  const edgeMap = new Map<string, TransitionEdge[]>();
  for (const edge of edges) {
    const outgoing = edgeMap.get(edge.from) ?? [];
    outgoing.push(edge);
    edgeMap.set(edge.from, outgoing);
  }
  return {
    nodes: nodeMap,
    edges: edgeMap,
    getOutgoingEdges: (id) => edgeMap.get(id) ?? [],
    getNode: (id) => nodeMap.get(id),
  };
}

describe('createRenderer()', () => {
  const chunkA = chunkNode('chunkA', 'songA', FIXTURE_A, 128, '8A');
  const chunkB = chunkNode('chunkB', 'songB', FIXTURE_B, 120, '8B');
  const crossfadeSec = 2;
  const edge: TransitionEdge = {
    from: 'chunkA',
    to: 'chunkB',
    signals: {
      bpmDelta: m(chunkB.signals.bpm.value - chunkA.signals.bpm.value),
      keyCompatibility: m(true),
      beatAlignment: m(0.8),
      embeddingSimilarity: m(0.8),
      loudnessDelta: m(0),
      estimatedCrossfadeSec: m(crossfadeSec),
    },
  };
  const graph = buildTestGraph([chunkA, chunkB], [edge]);
  const plan: RemixPlan = {
    chunkIds: ['chunkA', 'chunkB'],
    totalScore: 1,
    estimatedDurationSec: 6,
    diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 },
  };
  const options: RenderOptions = { crossfadeCurve: 'equalPower', normalizeLoudnessLufs: -14 };

  it('renders a plan into a playable file with duration matching (durA + durB - crossfade)', async () => {
    const renderer = createRenderer();
    const result = await renderer.render(plan, graph, options);
    try {
      expect(fs.existsSync(result.filePath)).toBe(true);
      // 4s + 4s - 2s crossfade = 6s, with tolerance for the bounded time-stretch resample.
      expect(result.durationSec).toBeGreaterThan(5.5);
      expect(result.durationSec).toBeLessThan(6.5);
    } finally {
      fs.unlinkSync(result.filePath);
    }
  }, 30000);

  it('produces no discontinuity/click at the crossfade splice point', async () => {
    const renderer = createRenderer();
    const result = await renderer.render(plan, graph, options);
    try {
      const decoded = wav.decode(fs.readFileSync(result.filePath));
      const samples = decoded.channelData[0];

      let maxDelta = 0;
      for (let i = 1; i < samples.length; i++) {
        maxDelta = Math.max(maxDelta, Math.abs(samples[i] - samples[i - 1]));
      }
      // A hard, unfaded splice between two independently-phased signals at
      // this amplitude could jump close to 2.0 (+0.95 to -0.95); a proper
      // equal-power crossfade keeps sample-to-sample deltas bounded to
      // ordinary waveform movement.
      expect(maxDelta).toBeLessThan(0.5);
    } finally {
      fs.unlinkSync(result.filePath);
    }
  }, 30000);

  it('normalizes output loudness to within a few dB of the target LUFS', async () => {
    const renderer = createRenderer();
    const result = await renderer.render(plan, graph, options);
    try {
      const decoded = wav.decode(fs.readFileSync(result.filePath));
      const samples = decoded.channelData[0];
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
      const rms = Math.sqrt(sumSquares / samples.length);
      const approximateLufs = 20 * Math.log10(rms) - 0.691;
      expect(Math.abs(approximateLufs - options.normalizeLoudnessLufs)).toBeLessThan(3);
    } finally {
      fs.unlinkSync(result.filePath);
    }
  }, 30000);

  it('throws a clear error rather than producing bad output when a chunk has no sourceFilePath', async () => {
    const synthNode: ChunkNode = { ...chunkA, id: 'synthChunk', sourceFilePath: undefined };
    const synthGraph = buildTestGraph([synthNode], []);
    const synthPlan: RemixPlan = { ...plan, chunkIds: ['synthChunk'] };
    const renderer = createRenderer();
    await expect(renderer.render(synthPlan, synthGraph, options)).rejects.toThrow(/sourceFilePath/);
  });
});
