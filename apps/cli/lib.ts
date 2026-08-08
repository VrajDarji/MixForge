import * as fs from 'fs';
import * as path from 'path';
import { analyzeSong, decodeAudioFile } from '../../src/analysis';
import { buildTransitionEdges } from '../../src/retrieval';
import { buildMusicGraph } from '../../src/graph';
import { isPlanFailure, planRemix } from '../../src/planner';
import { createRenderer } from '../../src/renderer';
import { interpretPrompt } from '../../src/ai';
import { ChunkNode } from '../../src/core';
import { CliOptions, RunResult } from './types';

export function parseArgs(argv: readonly string[]): CliOptions {
  const songFiles: string[] = [];
  let prompt = '';
  let outputPath = '';
  let targetDurationSec: number | undefined;
  let beamWidth = 6;
  let maxSteps = 30;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--prompt':
        prompt = argv[++i] ?? '';
        break;
      case '--output':
        outputPath = argv[++i] ?? '';
        break;
      case '--duration':
        targetDurationSec = Number(argv[++i]);
        break;
      case '--beam-width':
        beamWidth = Number(argv[++i]);
        break;
      case '--max-steps':
        maxSteps = Number(argv[++i]);
        break;
      default:
        songFiles.push(arg);
    }
  }

  if (songFiles.length === 0) throw new Error('mixforge: at least one song file is required');
  if (!outputPath) throw new Error('mixforge: --output <path> is required');

  return { songFiles, prompt, outputPath, targetDurationSec, beamWidth, maxSteps };
}

function songIdFromFile(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

export async function runMix(options: CliOptions): Promise<RunResult> {
  const nodes: ChunkNode[] = [];
  for (const file of options.songFiles) {
    const songId = songIdFromFile(file);
    nodes.push(...analyzeSong(songId, decodeAudioFile(file)));
  }

  const edges = buildTransitionEdges(nodes, { bpmWindow: 20, energyWindow: 0.3, annTopK: nodes.length });
  const graph = buildMusicGraph(nodes, edges);

  let config = interpretPrompt(options.prompt);
  if (options.targetDurationSec !== undefined && Number.isFinite(options.targetDurationSec)) {
    config = { ...config, targetDurationSec: options.targetDurationSec };
  }

  // Give the planner one starting candidate per song — its own diverse-beam
  // search decides which start (and which path) actually wins.
  const startCandidates = nodes.filter((n) => n.id.endsWith('-chunk-0'));

  const result = planRemix(graph, startCandidates, config, options.beamWidth, options.maxSteps);

  let plan;
  let usedFallbackPartialPlan = false;
  if (isPlanFailure(result)) {
    if (!result.bestPartial) {
      throw new Error('mixforge: no valid remix path could be found, and no partial plan was available');
    }
    plan = result.bestPartial;
    usedFallbackPartialPlan = true;
  } else {
    plan = result;
  }

  const renderer = createRenderer();
  const rendered = await renderer.render(plan, graph, { crossfadeCurve: 'equalPower', normalizeLoudnessLufs: -14 });

  fs.copyFileSync(rendered.filePath, options.outputPath);
  fs.unlinkSync(rendered.filePath);

  return {
    outputPath: options.outputPath,
    chunkIds: plan.chunkIds,
    durationSec: rendered.durationSec,
    usedFallbackPartialPlan,
  };
}
