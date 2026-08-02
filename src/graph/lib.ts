import { ChunkNode, MusicGraph, TransitionEdge } from '../core';

export function buildMusicGraph(nodes: readonly ChunkNode[], edges: readonly TransitionEdge[]): MusicGraph {
  const nodeMap = new Map(nodes.map(node => [node.id, node] as const));

  const edgeMap = new Map<string, TransitionEdge[]>();
  for (const edge of edges) {
    const outgoing = edgeMap.get(edge.from) ?? [];
    outgoing.push(edge);
    edgeMap.set(edge.from, outgoing);
  }

  return {
    nodes: nodeMap,
    edges: edgeMap,
    getOutgoingEdges: (nodeId) => edgeMap.get(nodeId) ?? [],
    getNode: (nodeId) => nodeMap.get(nodeId),
  };
}
