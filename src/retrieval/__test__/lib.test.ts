import * as path from 'path';
import { analyzeSong, decodeAudioFile } from '../../analysis';
import { buildAnnIndex, buildTempoIndex, buildTransitionEdges, computeEdgeSignals, retrieveCandidates } from '../lib';
import { areCamelotKeysCompatible, cosineSimilarity } from '../utils';

const FIXTURE_A = path.join(__dirname, '../../../test-data/audio/synthetic-a-128bpm-aminor.wav');
const FIXTURE_B = path.join(__dirname, '../../../test-data/audio/synthetic-b-120bpm-cmajor.wav');

function loadFixtureNodes() {
  const nodesA = analyzeSong('songA', decodeAudioFile(FIXTURE_A), { barsPerChunk: 2, beatsPerBar: 4 });
  const nodesB = analyzeSong('songB', decodeAudioFile(FIXTURE_B), { barsPerChunk: 2, beatsPerBar: 4 });
  return [...nodesA, ...nodesB];
}

describe('areCamelotKeysCompatible()', () => {
  it('treats identical codes as compatible', () => {
    expect(areCamelotKeysCompatible('8A', '8A')).toBe(true);
  });
  it('treats adjacent numbers on the same letter as compatible', () => {
    expect(areCamelotKeysCompatible('8A', '9A')).toBe(true);
    expect(areCamelotKeysCompatible('8A', '7A')).toBe(true);
  });
  it('wraps around 12<->1', () => {
    expect(areCamelotKeysCompatible('12A', '1A')).toBe(true);
  });
  it('treats the same number on the other letter (relative major/minor) as compatible', () => {
    expect(areCamelotKeysCompatible('8A', '8B')).toBe(true);
  });
  it('treats unrelated codes as incompatible', () => {
    expect(areCamelotKeysCompatible('8A', '3B')).toBe(false);
  });
});

describe('cosineSimilarity()', () => {
  it('is 1 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0);
  });
});

describe('retrieval funnel against real analyzed fixtures', () => {
  const nodes = loadFixtureNodes();
  const params = { bpmWindow: 30, energyWindow: 1, annTopK: nodes.length };

  it('retrieveCandidates never returns the source node itself', () => {
    const tempoIndex = buildTempoIndex(nodes);
    const ann = buildAnnIndex(nodes);
    const from = nodes[0];
    const candidates = retrieveCandidates(from, { tempoIndex, ann }, params);
    expect(candidates.every((c) => c.id !== from.id)).toBe(true);
  });

  it('retrieveCandidates only returns candidates within the bpm window', () => {
    const tempoIndex = buildTempoIndex(nodes);
    const ann = buildAnnIndex(nodes);
    const from = nodes[0];
    const candidates = retrieveCandidates(from, { tempoIndex, ann }, { ...params, bpmWindow: 2 });
    for (const c of candidates) {
      expect(Math.abs(c.signals.bpm.value - from.signals.bpm.value)).toBeLessThanOrEqual(2);
    }
  });

  it('computeEdgeSignals produces measurements with confidence derived from both endpoints', () => {
    const [from, to] = nodes;
    const edge = computeEdgeSignals(from, to);
    expect(edge.bpmDelta.value).toBeCloseTo(to.signals.bpm.value - from.signals.bpm.value);
    expect(edge.bpmDelta.confidence).toBe(Math.min(from.signals.bpm.confidence, to.signals.bpm.confidence));
    expect(edge.embeddingSimilarity.value).toBeGreaterThanOrEqual(0);
    expect(edge.embeddingSimilarity.value).toBeLessThanOrEqual(1);
    expect(edge.estimatedCrossfadeSec.value).toBeGreaterThan(0);
  });

  it('buildTransitionEdges produces a well-formed edge list referencing real node ids', () => {
    const edges = buildTransitionEdges(nodes, params);
    const nodeIds = new Set(nodes.map((n) => n.id));
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
      expect(edge.from).not.toBe(edge.to);
    }
  });
});
