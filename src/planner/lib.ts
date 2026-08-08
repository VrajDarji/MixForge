import { ChunkNode, SearchResources, SearchState, TransitionEdge } from '../core';

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
