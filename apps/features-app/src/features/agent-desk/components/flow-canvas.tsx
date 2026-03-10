import { useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type OnConnect,
  type Connection,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- dagre has no type declarations
import Dagre from "@dagrejs/dagre";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { LayoutGrid } from "lucide-react";
import { FlowScreenNode, type FlowScreenNodeData } from "./flow-screen-node";
import { FlowEdgeComponent, type FlowEdgeData } from "./flow-edge-component";
import type { FlowScreen, FlowEdge } from "../types";

interface Props {
  sessionId: string;
  screens: FlowScreen[];
  edges: FlowEdge[];
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onEdgeClick: (edgeId: string) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onEdgeAdd?: (sourceId: string, targetId: string) => void;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;

const nodeTypes: NodeTypes = {
  screenNode: FlowScreenNode,
};

const edgeTypes: EdgeTypes = {
  flowEdge: FlowEdgeComponent,
};

export function FlowCanvas({
  screens,
  edges,
  onNodeClick,
  onNodeDoubleClick,
  onEdgeClick,
  onEdgeDelete,
  onEdgeAdd,
  selectedNodeId,
  selectedEdgeId,
}: Props) {
  const prevDataRef = useRef<string>("");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowScreenNodeData>>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge<FlowEdgeData>>([]);
  const [needsFitView, setNeedsFitView] = useState(false);

  // Sync server data → local React Flow state (only when data changes)
  const dataKey = `${screens.map((s) => s.id).join(",")}-${edges.map((e) => e.id).join(",")}`;
  if (dataKey !== prevDataRef.current && screens.length > 0) {
    prevDataRef.current = dataKey;
    const { layoutedNodes, layoutedEdges } = getLayoutedElements(screens, edges);
    setNodes(layoutedNodes);
    setRfEdges(layoutedEdges);
    setNeedsFitView(true);
  }

  // Apply selection state
  const nodesWithSelection = nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
  }));

  const edgesWithSelection = rfEdges.map((edge) => ({
    ...edge,
    selected: edge.id === selectedEdgeId,
    data: {
      ...edge.data,
      onDelete: onEdgeDelete ? () => onEdgeDelete(edge.id) : undefined,
    } as FlowEdgeData,
  }));

  const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
    onNodeClick(node.id);
  };

  const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
    onNodeDoubleClick(node.id);
  };

  const handleEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
    onEdgeClick(edge.id);
  };

  const handleConnect: OnConnect = (connection: Connection) => {
    const newEdge: Edge<FlowEdgeData> = {
      ...connection,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      type: "flowEdge",
      data: { conditionLabel: "", transitionType: "navigate" },
    } as Edge<FlowEdgeData>;
    setRfEdges((eds) => addEdge(newEdge, eds));
    onEdgeAdd?.(connection.source!, connection.target!);
  };

  const handleReLayout = () => {
    const { layoutedNodes, layoutedEdges } = getLayoutedElements(screens, edges);
    setNodes([...layoutedNodes]);
    setRfEdges([...layoutedEdges]);
    setNeedsFitView(true);
  };

  return (
    <div className="h-full w-full rounded-2xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-sm overflow-hidden">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edgesWithSelection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onEdgeClick={handleEdgeClick}
        onConnect={handleConnect}
        fitView={needsFitView}
        fitViewOptions={{ padding: 0.2 }}
        onInit={() => setNeedsFitView(false)}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{ type: "flowEdge" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls showInteractive={false} className="!rounded-lg !border-border/50 !shadow-sm" />
        <Panel position="top-right">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg shadow-sm gap-1.5"
            onClick={handleReLayout}
          >
            <LayoutGrid className="size-3.5" />
            자동 정렬
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

/* Helpers */

function getLayoutedElements(
  screens: FlowScreen[],
  edges: FlowEdge[],
): { layoutedNodes: Node<FlowScreenNodeData>[]; layoutedEdges: Edge<FlowEdgeData>[] } {
  if (screens.length === 0) {
    return { layoutedNodes: [], layoutedEdges: [] };
  }

  const rfNodes: Node<FlowScreenNodeData>[] = screens.map((screen) => ({
    id: screen.id,
    type: "screenNode",
    position: { x: 0, y: 0 },
    data: {
      label: screen.name,
      description: screen.description,
      wireframeType: screen.wireframeType,
      requirementCount: screen.detail?.sourceRequirementIds?.length ?? 0,
    },
  }));

  const rfEdges: Edge<FlowEdgeData>[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.fromScreenId,
    target: edge.toScreenId,
    sourceHandle: "bottom-source",
    targetHandle: "top",
    type: "flowEdge",
    data: {
      conditionLabel: edge.conditionLabel,
      transitionType: edge.transitionType,
    },
  }));

  // Edge가 없으면 grid 레이아웃으로 폴백
  if (rfEdges.length === 0) {
    const COLS = Math.ceil(Math.sqrt(rfNodes.length));
    const GAP_X = NODE_WIDTH + 60;
    const GAP_Y = NODE_HEIGHT + 60;
    const layoutedNodes = rfNodes.map((node, i) => ({
      ...node,
      position: {
        x: (i % COLS) * GAP_X,
        y: Math.floor(i / COLS) * GAP_Y,
      },
    }));
    return { layoutedNodes, layoutedEdges: rfEdges };
  }

  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });

  rfNodes.forEach((node) => g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  rfEdges.forEach((edge) => g.setEdge(edge.source, edge.target));

  Dagre.layout(g);

  const layoutedNodes = rfNodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  return { layoutedNodes, layoutedEdges: rfEdges };
}
