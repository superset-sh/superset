/**
 * Auto Layout - dagre 기반 자동 정렬
 */
import * as dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const CIRCULAR_SIZE = 100;

const CIRCULAR_NODE_TYPES = new Set(["start", "end", "merge"]);

export function getAutoLayoutPositions(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB",
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  for (const node of nodes) {
    const isCircular = CIRCULAR_NODE_TYPES.has(node.type ?? "");
    g.setNode(node.id, {
      width: isCircular ? CIRCULAR_SIZE : NODE_WIDTH,
      height: isCircular ? CIRCULAR_SIZE : NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      const isCircular = CIRCULAR_NODE_TYPES.has(node.type ?? "");
      const w = isCircular ? CIRCULAR_SIZE : NODE_WIDTH;
      const h = isCircular ? CIRCULAR_SIZE : NODE_HEIGHT;
      positions.set(node.id, {
        x: Math.round(dagreNode.x - w / 2),
        y: Math.round(dagreNode.y - h / 2),
      });
    }
  }

  return positions;
}
