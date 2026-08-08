import { ChunkNode, SearchResources, SearchState, TransitionEdge } from '../core';
import { HardConstraint, PlannerConfig } from '../core';
import { calibrate } from '../scorer';
import { mergeKey } from '../core';
import { compareStatesByScoreThenId } from './utils';
import { RemixPlan } from '../core';
import { PlanResult } from './types';
import { MusicGraph } from '../core';
import { evaluateEdge, evaluateNode, evaluatePath } from '../scorer';

// ADR-007 Class B: "last N only" per SearchResources.recentSectionTypes's
// comment in core/types.ts — 3 is small enough to matter for merge-key
// compression, large enough to carry short-term narrative context.
const RECENT_SECTION_WINDOW = 3;

export function initialState(node: ChunkNode): SearchState {
  return {
    accumulatedScore: 0,
    resources: {
      elapsedDurationBucket: node.endTimeSec - node.startTimeSec,
      energyBucket: node.signals.energy.value,
      currentKeyBucket: node.signals.key.value,
      currentNodeId: node.id,
      songDiversityCount: 1,
      recentSectionTypes: [node.signals.sectionType.value],
      usedChunkIds: new Set([node.id]),
      usedSongIds: new Set([node.songId]),
      history: [node.id],
    },
  };
}

export function updateResources(
  resources: SearchResources,
  _edge: TransitionEdge,
  nextNode: ChunkNode
): SearchResources {
  const isNewSong = !resources.usedSongIds.has(nextNode.songId);
  return {
    elapsedDurationBucket: resources.elapsedDurationBucket + (nextNode.endTimeSec - nextNode.startTimeSec),
    energyBucket: nextNode.signals.energy.value,
    currentKeyBucket: nextNode.signals.key.value,
    currentNodeId: nextNode.id,
    songDiversityCount: resources.songDiversityCount + (isNewSong ? 1 : 0),
    recentSectionTypes: [...resources.recentSectionTypes, nextNode.signals.sectionType.value].slice(
      -RECENT_SECTION_WINDOW
    ),
    usedChunkIds: new Set([...resources.usedChunkIds, nextNode.id]),
    usedSongIds: new Set([...resources.usedSongIds, nextNode.songId]),
    history: [...resources.history, nextNode.id],
  };
}

export function isValidResources(edge: TransitionEdge, resources: SearchResources, config: PlannerConfig): boolean {
  return config.hardConstraints.every((constraint: HardConstraint) => constraint.check(edge, resources, calibrate));
}

// ADR-007 merge (approximate DP: two states sharing a mergeKey are TREATED as
// equivalent, not proven so — keep only the better-scoring one) + ADR-008
// diversity (reserve beam slots so the beam doesn't collapse onto every
// continuation of the single highest-scoring prefix).
export function selectDiverseBeam(candidates: SearchState[], width: number): SearchState[] {
  const byKey = new Map<string, SearchState>();
  for (const candidate of candidates) {
    const key = mergeKey(candidate.resources);
    const existing = byKey.get(key);
    if (!existing || candidate.accumulatedScore > existing.accumulatedScore) byKey.set(key, candidate);
  }

  const merged = [...byKey.values()].sort(compareStatesByScoreThenId);
  const selected: SearchState[] = [];
  const deferred: SearchState[] = [];
  const nodeCounts = new Map<string, number>();
  for (const candidate of merged) {
    if (selected.length >= width) break;
    const count = nodeCounts.get(candidate.resources.currentNodeId) ?? 0;
    if (count >= 1 && selected.length < width - 1) {
      deferred.push(candidate);
      continue;
    }
    selected.push(candidate);
    nodeCounts.set(candidate.resources.currentNodeId, count + 1);
  }
  // Backfill any still-open slots with the next-best deferred candidates —
  // the diversity cap only needs to reserve a slot for a non-dominant node,
  // not permanently exclude the dominant node's other candidates once that
  // guarantee is already satisfied.
  for (const candidate of deferred) {
    if (selected.length >= width) break;
    selected.push(candidate);
  }
  return selected;
}

export function isWithinTargetDuration(resources: SearchResources, config: PlannerConfig): boolean {
  return Math.abs(resources.elapsedDurationBucket - config.targetDurationSec) <= config.durationToleranceSec;
}

export function toRemixPlan(state: SearchState): RemixPlan {
  return {
    chunkIds: state.resources.history,
    totalScore: state.accumulatedScore,
    estimatedDurationSec: state.resources.elapsedDurationBucket,
    diagnostics: { nearFailedConstraints: [], prunedCandidateCount: 0 },
  };
}

export function handleDeadEnd(beam: SearchState[], config: PlannerConfig): PlanResult {
  const best = [...beam].sort(compareStatesByScoreThenId)[0];
  const relaxedTolerance = config.durationToleranceSec * 3;
  if (Math.abs(best.resources.elapsedDurationBucket - config.targetDurationSec) <= relaxedTolerance) {
    return toRemixPlan(best);
  }
  return { failure: 'no_valid_path', bestPartial: toRemixPlan(best) };
}

export function planRemix(
  graph: MusicGraph,
  startCandidates: readonly ChunkNode[],
  config: PlannerConfig,
  beamWidth: number,
  maxSteps: number
): PlanResult {
  if (startCandidates.length === 0 || beamWidth <= 0) {
    return { failure: 'no_valid_path' };
  }

  let beam: SearchState[] = startCandidates.map(initialState).sort(compareStatesByScoreThenId);

  for (let step = 0; step < maxSteps; step++) {
    const candidates: SearchState[] = [];

    for (const currentState of beam) {
      for (const edge of graph.getOutgoingEdges(currentState.resources.currentNodeId)) {
        const evalResult = evaluateEdge(edge, config);
        if (!evalResult.feasible) continue; // ADR-005 stage 1: catastrophic transitions never reach scoring

        const nextNode = graph.getNode(edge.to);
        if (!nextNode) continue; // malformed graph: edge points at a node that doesn't exist — skip, don't crash

        const nextResources = updateResources(currentState.resources, edge, nextNode);
        if (!isValidResources(edge, nextResources, config)) continue;

        const score =
          currentState.accumulatedScore +
          evalResult.qualityScore +
          evaluateNode(nextNode, config) +
          evaluatePath(nextResources, config);

        candidates.push({ accumulatedScore: score, resources: nextResources });
      }
    }

    if (candidates.length === 0) return handleDeadEnd(beam, config);

    beam = selectDiverseBeam(candidates, beamWidth);

    if (beam.some((s) => isWithinTargetDuration(s.resources, config))) break;
  }

  const finished = beam.filter((s) => isWithinTargetDuration(s.resources, config)).sort(compareStatesByScoreThenId);
  if (finished.length > 0) return toRemixPlan(finished[0]);

  const bestOverall = [...beam].sort(compareStatesByScoreThenId)[0];
  return { failure: 'no_valid_path', bestPartial: toRemixPlan(bestOverall) };
}
