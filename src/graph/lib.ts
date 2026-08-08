import * as fs from 'fs';
import { ChunkNode, MusicGraph, TransitionEdge } from '../core';
import { SerializedChunkNode, SerializedGraph } from './types';

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

function serializeNode(node: ChunkNode): SerializedChunkNode {
  return {
    ...node,
    signals: {
      ...node.signals,
      embedding: { ...node.signals.embedding, value: Array.from(node.signals.embedding.value) },
    },
  };
}

function deserializeNode(node: SerializedChunkNode): ChunkNode {
  return {
    ...node,
    signals: {
      ...node.signals,
      embedding: { ...node.signals.embedding, value: Float32Array.from(node.signals.embedding.value) },
    },
  };
}

// Persistence for MVP: a single serialized JSON file per song set, per
// docs/implementation.md §9.3 — no need for SQLite/Postgres until
// multi-user concurrent access matters.
export function saveGraphToJson(nodes: readonly ChunkNode[], edges: readonly TransitionEdge[], filePath: string): void {
  const serialized: SerializedGraph = { nodes: nodes.map(serializeNode), edges };
  fs.writeFileSync(filePath, JSON.stringify(serialized));
}

export function loadGraphFromJson(filePath: string): MusicGraph {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SerializedGraph;
  return buildMusicGraph(parsed.nodes.map(deserializeNode), parsed.edges);
}
