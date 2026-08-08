import { ChunkNode, SearchResources, SearchState, TransitionEdge } from '../core';
import { HardConstraint, PlannerConfig } from '../core';
import { calibrate } from '../scorer';
import { mergeKey } from '../core';
import { compareStatesByScoreThenId } from './utils';

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
