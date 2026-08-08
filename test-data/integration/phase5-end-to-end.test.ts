// Cross-module integration test proving ADR-006: the Phase 4 planner runs,
// completely unmodified, against a real graph built from real (synthetic,
// license-free) audio — decode -> analyze -> retrieve -> persist -> plan.
// Lives outside src/ deliberately: src/planner/ is forbidden by
// eslint.config.js's import-boundary zone from importing src/analysis/,
// src/retrieval/, or src/graph/, so this test — which legitimately needs
// all four — cannot live inside any of those modules' own __test__/ folders.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeSong, decodeAudioFile } from '../../src/analysis';
import { buildTransitionEdges } from '../../src/retrieval';
import { buildMusicGraph, loadGraphFromJson, saveGraphToJson } from '../../src/graph';
import { isPlanFailure, planRemix } from '../../src/planner';
import { PlannerConfig } from '../../src/core';

const FIXTURE_A = path.join(__dirname, '../audio/synthetic-a-128bpm-aminor.wav');
const FIXTURE_B = path.join(__dirname, '../audio/synthetic-b-120bpm-cmajor.wav');

function realPlannerConfig(overrides: Partial<PlannerConfig> = {}): PlannerConfig {
  return {
    hardConstraints: [],
    nodeWeights: {
      bpm: 0, key: 0, energy: 1, loudnessLufs: 0, guitarPresence: 0,
      vocalPresence: 0, danceability: 0.5, sectionType: 0, embedding: 0, genreDistribution: 0,
    },
    edgeWeights: {
      bpmDelta: 1, keyCompatibility: 1, beatAlignment: 1,
      embeddingSimilarity: 1, loudnessDelta: 1, estimatedCrossfadeSec: 0,
    },
    pathObjectiveWeights: { energyCurveAdherence: 1, diversity: 1, durationAdherence: 1, repetitionPenalty: 0 },
    targetDurationSec: 30,
    targetEnergyCurve: [0.3, 0.6, 0.9, 0.5],
    durationToleranceSec: 15,
    ...overrides,
  };
}

describe('Phase 5 end-to-end: real audio -> real graph -> unmodified Phase 4 planner', () => {
  it('produces a ChunkNode[] with plausible (non-placeholder) measurements from real audio files', () => {
    const nodesA = analyzeSong('songA', decodeAudioFile(FIXTURE_A), { barsPerChunk: 2, beatsPerBar: 4 });
    const nodesB = analyzeSong('songB', decodeAudioFile(FIXTURE_B), { barsPerChunk: 2, beatsPerBar: 4 });

    expect(nodesA.length).toBeGreaterThan(1);
    expect(nodesB.length).toBeGreaterThan(1);
    for (const node of [...nodesA, ...nodesB]) {
      expect(node.signals.bpm.confidence).toBeGreaterThan(0);
      expect(node.signals.key.value).toMatch(/^\d{1,2}[AB]$/);
    }
  });

  it('produces a MusicGraph that round-trips through persistence unchanged', () => {
    const nodes = [
      ...analyzeSong('songA', decodeAudioFile(FIXTURE_A), { barsPerChunk: 2, beatsPerBar: 4 }),
      ...analyzeSong('songB', decodeAudioFile(FIXTURE_B), { barsPerChunk: 2, beatsPerBar: 4 }),
    ];
    const edges = buildTransitionEdges(nodes, { bpmWindow: 30, energyWindow: 1, annTopK: nodes.length });
    const original = buildMusicGraph(nodes, edges);

    const filePath = path.join(os.tmpdir(), `mixforge-e2e-graph-${Date.now()}.json`);
    try {
      saveGraphToJson(nodes, edges, filePath);
      const reloaded = loadGraphFromJson(filePath);

      expect([...reloaded.nodes.keys()].sort()).toEqual([...original.nodes.keys()].sort());
      for (const id of original.nodes.keys()) {
        expect(reloaded.getOutgoingEdges(id).length).toBe(original.getOutgoingEdges(id).length);
      }
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('feeds the real graph into the UNMODIFIED Phase 4 planRemix() and gets a well-formed result, no planner code changes required', () => {
    const nodes = [
      ...analyzeSong('songA', decodeAudioFile(FIXTURE_A), { barsPerChunk: 2, beatsPerBar: 4 }),
      ...analyzeSong('songB', decodeAudioFile(FIXTURE_B), { barsPerChunk: 2, beatsPerBar: 4 }),
    ];
    const edges = buildTransitionEdges(nodes, { bpmWindow: 30, energyWindow: 1, annTopK: nodes.length });
    const graph = buildMusicGraph(nodes, edges);

    const result = planRemix(graph, [nodes[0]], realPlannerConfig(), 4, 20);

    // The acceptance bar here is structural, not musical: the *unmodified*
    // planner must run to completion against a real (if synthetic) graph
    // and return one of its two well-formed result shapes — never throw,
    // never hang, regardless of whether a target-duration match is found.
    if (isPlanFailure(result)) {
      expect(result.failure).toBe('no_valid_path');
    } else {
      expect(result.chunkIds.length).toBeGreaterThan(0);
      expect(result.chunkIds[0]).toBe(nodes[0].id);
      expect(Number.isFinite(result.totalScore)).toBe(true);
      expect(result.estimatedDurationSec).toBeGreaterThan(0);
    }
  });
});
