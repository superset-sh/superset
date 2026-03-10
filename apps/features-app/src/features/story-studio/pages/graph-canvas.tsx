/**
 * GraphCanvas - 선택지 그래프 캔버스 (React Flow)
 *
 * 씬, 선택지, 조건, 시작/종료 노드를 시각적으로 편집
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeMouseHandler,
  MiniMap,
  type Node,
  type NodeMouseHandler,
  type OnConnect,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
  Panel,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { useAtom, useSetAtom } from "jotai";
import {
  AlignVerticalSpaceAround,
  ArrowLeft,
  Diamond,
  GitBranch,
  Merge,
  MonitorStop,
  Play,
  Search,
  Square,
  Users,
} from "lucide-react";
import { getAutoLayoutPositions } from "../components/graph/auto-layout";
import { ChoiceNode } from "../components/graph/choice-node";
import { ConditionNode } from "../components/graph/condition-node";
import { CustomEdge } from "../components/graph/custom-edge";
import { EdgeEditDialog } from "../components/graph/edge-edit-dialog";
import { NodeDetailPanel } from "../components/graph/node-detail-panel";
import { SceneNode } from "../components/graph/scene-node";
import { StartEndNode } from "../components/graph/start-end-node";
import {
  useCharacters,
  useCreateEdge,
  useCreateNode,
  useDeleteEdge,
  useDeleteNode,
  useFlags,
  useGraph,
  useNodeSummaries,
  useUpdateEdge,
  useUpdateNode,
  useUpdateNodePositions,
} from "../hooks";
import {
  nodeSearchQueryAtom,
  selectedNodeIdAtom,
  trackedCharacterIdAtom,
} from "../store/graph.atoms";

interface EdgeCondition {
  type: "flag_check" | "group";
  flagId?: string;
  operator?: "==" | "!=" | ">" | ">=" | "<" | "<=";
  value?: string | number | boolean;
  logic?: "AND" | "OR";
  children?: EdgeCondition[];
}

interface EdgeEffect {
  flagId: string;
  operation: "set" | "add" | "subtract" | "toggle" | "multiply";
  value: string | number | boolean;
}

const NODE_TYPES = {
  scene: SceneNode,
  choice: ChoiceNode,
  condition: ConditionNode,
  start: StartEndNode,
  end: StartEndNode,
  merge: StartEndNode,
};

const EDGE_TYPES = {
  custom: CustomEdge,
};

const SNAP_GRID: [number, number] = [20, 20];

export function GraphCanvas() {
  const { id, chId } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";
  const chapterId = chId ?? "";

  const { data: graphData, isLoading } = useGraph(chapterId);
  const { data: flagsData } = useFlags(projectId);
  const { data: summaries } = useNodeSummaries(chapterId);

  const createNode = useCreateNode(chapterId);
  const deleteNode = useDeleteNode(chapterId);
  const createEdge = useCreateEdge(chapterId);
  const updateEdge = useUpdateEdge(chapterId);
  const deleteEdge = useDeleteEdge(chapterId);
  const updatePositions = useUpdateNodePositions();
  const updateNode = useUpdateNode(chapterId);

  const { data: characters } = useCharacters(projectId);
  const [trackedCharacterId, setTrackedCharacterId] = useAtom(trackedCharacterIdAtom);

  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom);
  const nodeCounterRef = useRef(0);

  // Hover highlight state
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Edge edit dialog state
  const [edgeDialogOpen, setEdgeDialogOpen] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<{
    id: string;
    label?: string;
    conditions: EdgeCondition[];
    effects: EdgeEffect[];
  } | null>(null);

  // Node detail panel state
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // React Flow Local State
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Optimistic tracking
  const tempToRealMap = useRef<Record<string, string>>({});
  const edgeMemory = useRef<
    Record<
      string,
      { sourceHandle: string | null | undefined; targetHandle: string | null | undefined }
    >
  >({});

  // Sync from server when data changes - MUST use useEffect, NOT render conditionals
  useEffect(() => {
    if (!graphData) return;

    // Use latest summaries and characters config for labels inside the effect
    const currentSummaryMap = new Map((summaries ?? []).map((s) => [s.nodeId, s]));

    const nodesWithEdges = new Set<string>();
    for (const e of graphData.edges) {
      nodesWithEdges.add(e.sourceNodeId);
      nodesWithEdges.add(e.targetNodeId);
    }

    const serverNodes: Node[] = graphData.nodes.map((n) => {
      const summary = currentSummaryMap.get(n.id);
      return {
        id: n.id,
        type: n.type,
        position: { x: n.positionX ?? 0, y: n.positionY ?? 0 },
        data: {
          label: n.label,
          code: n.code,
          nodeType: n.type,
          isOrphan: !nodesWithEdges.has(n.id) && n.type !== "start",
          isIncomplete: n.type === "scene" && !currentSummaryMap.get(n.id)?.dialogueCount,
          ...(typeof n.metadata === "object" && n.metadata !== null ? n.metadata : {}),
          ...(n.type === "choice"
            ? {
                choices: graphData.edges
                  .filter((e) => e.sourceNodeId === n.id)
                  .map((e) => ({ edgeId: e.id, label: e.label ?? "" })),
              }
            : {}),
          ...(summary
            ? {
                dialogueCount: summary.dialogueCount,
                characterNames: summary.characterNames,
                emotionalTone: summary.emotionalTone,
              }
            : {}),
        },
      };
    });

    const serverEdges: Edge[] = graphData.edges.map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      label: e.label ?? undefined,
      type: "custom",
      data: {
        conditions: e.conditions ?? [],
        effects: e.effects ?? [],
      },
    }));

    setNodes((currentNodes) => {
      return serverNodes.map((sNode) => {
        let existingNode = currentNodes.find((n) => n.id === sNode.id);
        if (!existingNode) {
          const tempId = Object.keys(tempToRealMap.current).find(
            (k) => tempToRealMap.current[k] === sNode.id,
          );
          if (tempId) {
            existingNode = currentNodes.find((n) => n.id === tempId);
          }
        }
        if (existingNode) {
          return {
            ...sNode,
            position: sNode.position, // Let server position win right now to keep positions synced
            selected: existingNode.selected,
            dragging: existingNode.dragging,
            measured: existingNode.measured,
          };
        }
        return sNode;
      });
    });

    setEdges((prevEdges) => {
      // Find locally created handles to ensure we don't snap back to default visual handles
      const currentEdgesMap = new Map(prevEdges.map((e) => [`${e.source}-${e.target}`, e]));

      return serverEdges.map((sEdge) => {
        const sourceKey = sEdge.source;
        const targetKey = sEdge.target;
        const mem = edgeMemory.current[`${sourceKey}-${targetKey}`];
        const currentEdge = currentEdgesMap.get(`${sourceKey}-${targetKey}`);

        return {
          ...sEdge,
          sourceHandle:
            sEdge.sourceHandle || mem?.sourceHandle || currentEdge?.sourceHandle || "bottom-source",
          targetHandle:
            sEdge.targetHandle || mem?.targetHandle || currentEdge?.targetHandle || "top-target",
        };
      });
    });
  }, [graphData, summaries, setNodes, setEdges, tempToRealMap, edgeMemory]);

  // Connection validation
  const isValidConnection = (connection: Edge | Connection) => {
    // No self-connections
    if (connection.source === connection.target) return false;

    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    // Cannot connect INTO a start node
    if (targetNode?.type === "start") return false;

    // Cannot connect FROM an end node
    if (sourceNode?.type === "end") return false;

    // No duplicate edges
    const duplicate = edges.some(
      (e) => e.source === connection.source && e.target === connection.target,
    );
    if (duplicate) return false;

    return true;
  };

  const onConnect: OnConnect = (connection) => {
    if (!connection.source || !connection.target) return;

    // Track chosen handles
    edgeMemory.current[`${connection.source}-${connection.target}`] = {
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
    };

    setEdges((eds) =>
      addEdge(
        {
          ...connection,
          type: "custom",
          animated: true,
          data: { conditions: [], effects: [] },
        },
        eds,
      ),
    );
    createEdge.mutate({
      projectId,
      chapterId,
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
    });
  };

  const onNodesDelete: OnNodesDelete = (deletedNodes) => {
    for (const node of deletedNodes) {
      deleteNode.mutate({ id: node.id });
    }
  };

  const onEdgesDelete: OnEdgesDelete = (deletedEdges) => {
    for (const edge of deletedEdges) {
      deleteEdge.mutate({ id: edge.id });
    }
  };

  const onNodeDragStop: OnNodeDrag = (_event, _node, draggedNodes) => {
    const updates = draggedNodes.map((n) => ({
      id: n.id,
      positionX: Math.round(n.position.x),
      positionY: Math.round(n.position.y),
    }));
    if (updates.length > 0) {
      updatePositions.mutate({ updates });
    }
  };

  const onNodeClick: NodeMouseHandler = (_event, node) => {
    setSelectedNodeId(node.id);
    setDetailPanelOpen(true);
  };

  const onNodeDoubleClick: NodeMouseHandler = (_event, node) => {
    if (node.type === "scene") {
      navigate({
        to: "/story-studio/$id/chapters/$chId/dialogue/$nodeId",
        params: { id: projectId, chId: chapterId, nodeId: node.id },
      });
    }
  };

  const onEdgeClick: EdgeMouseHandler = (_event, edge) => {
    const serverEdge = graphData?.edges?.find((e) => e.id === edge.id);
    setSelectedEdge({
      id: edge.id,
      label: (edge.label as string) ?? undefined,
      conditions: (serverEdge?.conditions as EdgeCondition[]) ?? [],
      effects: (serverEdge?.effects as EdgeEffect[]) ?? [],
    });
    setEdgeDialogOpen(true);
  };

  const handleEdgeSave = (
    edgeId: string,
    data: { label?: string; conditions: EdgeCondition[]; effects: EdgeEffect[] },
  ) => {
    updateEdge.mutate(
      { id: edgeId, data },
      {
        onSuccess: () => {
          setEdgeDialogOpen(false);
          setSelectedEdge(null);
        },
      },
    );
  };

  const handleUpdateNode = (
    nodeId: string,
    data: { label?: string; code?: string; metadata?: Record<string, unknown> },
  ) => {
    updateNode.mutate({ id: nodeId, data });
  };

  const handleAddNode = (type: string) => {
    nodeCounterRef.current += 1;
    const count = nodeCounterRef.current;
    const labelMap: Record<string, string> = {
      scene: `씬 ${count}`,
      choice: `선택지 ${count}`,
      condition: `조건 ${count}`,
      merge: `병합 ${count}`,
      start: `시작`,
      end: `종료 ${count}`,
    };
    const codeMap: Record<string, string> = {
      scene: `SC${String(count).padStart(3, "0")}`,
      choice: `CH${String(count).padStart(3, "0")}`,
      condition: `CN${String(count).padStart(3, "0")}`,
      merge: `MG${String(count).padStart(3, "0")}`,
      start: `ST001`,
      end: `ED${String(count).padStart(3, "0")}`,
    };

    // Place new node near center-ish with some randomness
    const posX = 200 + Math.random() * 300;
    const posY = 100 + Math.random() * 200;

    createNode.mutate({
      projectId,
      chapterId,
      type,
      code: codeMap[type] ?? `ND${count}`,
      label: labelMap[type] ?? `노드 ${count}`,
      positionX: Math.round(posX),
      positionY: Math.round(posY),
    });
  };

  const handleAutoLayout = () => {
    const positions = getAutoLayoutPositions(nodes, edges);
    setNodes((nds) =>
      nds.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
    );
    const updates = Array.from(positions.entries()).map(([id, pos]) => ({
      id,
      positionX: pos.x,
      positionY: pos.y,
    }));
    if (updates.length > 0) {
      updatePositions.mutate({ updates });
    }
  };

  // Hover highlight: compute connected node IDs
  const onNodeMouseEnter: NodeMouseHandler = (_event, node) => {
    setHoveredNodeId(node.id);
  };
  const onNodeMouseLeave: NodeMouseHandler = () => {
    setHoveredNodeId(null);
  };

  const connectedIds = new Set<string>();
  if (hoveredNodeId) {
    connectedIds.add(hoveredNodeId);
    for (const e of edges) {
      if (e.source === hoveredNodeId) connectedIds.add(e.target);
      if (e.target === hoveredNodeId) connectedIds.add(e.source);
    }
  }

  // Character path tracking: compute tracked node IDs
  const trackedNodeIds = new Set<string>();
  if (trackedCharacterId && summaries) {
    for (const s of summaries) {
      if (
        s.characterNames.some((name) => {
          const char = characters?.find((c) => c.name === name);
          return char?.id === trackedCharacterId;
        })
      ) {
        trackedNodeIds.add(s.nodeId);
      }
    }
  }

  // Merge hover dimming + character tracking dimming
  const styledNodes = nodes.map((n) => {
    let opacity = 1;
    if (hoveredNodeId && !connectedIds.has(n.id)) opacity = 0.3;
    if (trackedCharacterId && !trackedNodeIds.has(n.id) && n.type === "scene") opacity = 0.3;
    return { ...n, style: { opacity } };
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+D / Cmd+D: duplicate selected node
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        const selectedNode = nodes.find((n) => n.selected);
        if (selectedNode) {
          createNode.mutate({
            projectId,
            chapterId,
            type: selectedNode.type ?? "scene",
            label: `${selectedNode.data.label} (복사)`,
            code: String(selectedNode.data.code ?? ""),
            positionX: Math.round((selectedNode.position?.x ?? 0) + 40),
            positionY: Math.round((selectedNode.position?.y ?? 0) + 40),
          });
        }
      }
      // Escape: close detail panel + deselect
      if (e.key === "Escape") {
        setDetailPanelOpen(false);
        setSelectedNodeId(null);
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, projectId, chapterId, createNode, setNodes, setSelectedNodeId]);

  if (isLoading) {
    return <GraphSkeleton />;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigate({
              to: "/story-studio/$id/chapters/$chId",
              params: { id: projectId, chId: chapterId },
            })
          }
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          챕터
        </Button>
        <h2 className="text-lg font-semibold">선택지 그래프</h2>
      </div>

      {/* Graph Canvas + Detail Panel */}
      <div className="flex flex-1">
        <div className="flex-1">
          <ReactFlow
            nodes={styledNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onEdgeClick={onEdgeClick}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            isValidConnection={isValidConnection}
            snapToGrid
            snapGrid={SNAP_GRID}
            selectionOnDrag
            fitView
            deleteKeyCode="Delete"
            className="bg-background"
          >
            <Background gap={20} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} className="!bg-muted/50" />

            {/* Arrow marker definition */}
            <svg>
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
                </marker>
              </defs>
            </svg>

            {/* Search Panel */}
            <NodeSearchPanel nodes={styledNodes} />

            {/* Character Path Tracking Panel */}
            {characters?.length ? (
              <Panel position="top-left" className="flex items-center gap-2">
                <Users className="text-muted-foreground h-3.5 w-3.5" />
                <Select
                  value={trackedCharacterId ?? ""}
                  onValueChange={(val) => setTrackedCharacterId(val === "__none__" ? null : val)}
                >
                  <SelectTrigger className="h-7 w-[160px] text-xs">
                    <SelectValue placeholder="캐릭터 추적..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">추적 해제</SelectItem>
                    {characters.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Panel>
            ) : null}

            {/* Floating Node Creation Dock */}
            <Panel position="bottom-center" className="mb-6">
              <div className="bg-background/95 flex items-center gap-1 rounded-2xl border p-1.5 shadow-lg backdrop-blur-md">
                <ToolbarButton
                  icon={<Play className="h-4 w-4" />}
                  label="시작"
                  onClick={() => handleAddNode("start")}
                />
                <ToolbarButton
                  icon={<Square className="h-4 w-4" />}
                  label="씬"
                  onClick={() => handleAddNode("scene")}
                />
                <ToolbarButton
                  icon={<GitBranch className="h-4 w-4" />}
                  label="선택지"
                  onClick={() => handleAddNode("choice")}
                />
                <ToolbarButton
                  icon={<Diamond className="h-4 w-4" />}
                  label="조건"
                  onClick={() => handleAddNode("condition")}
                />
                <ToolbarButton
                  icon={<Merge className="h-4 w-4" />}
                  label="병합"
                  onClick={() => handleAddNode("merge")}
                />
                <ToolbarButton
                  icon={<MonitorStop className="h-4 w-4" />}
                  label="종료"
                  onClick={() => handleAddNode("end")}
                />
                <div className="bg-border/50 mx-1 h-6 w-px" />
                <ToolbarButton
                  icon={<AlignVerticalSpaceAround className="h-4 w-4" />}
                  label="자동 정렬"
                  onClick={handleAutoLayout}
                />
              </div>
            </Panel>

            {/* Info Panel */}
            <Panel
              position="bottom-left"
              className="text-muted-foreground/60 mb-2 ml-2 space-y-1 text-[10px]"
            >
              <div className="flex gap-3 font-mono">
                <span>N: {nodes.length}</span>
                <span>E: {edges.length}</span>
                <span>END: {nodes.filter((n) => n.type === "end").length}</span>
              </div>
              <p>드래그 및 핸들 연결 • 엣지 클릭 수정 • Delete 삭제</p>
            </Panel>
          </ReactFlow>
        </div>

        {detailPanelOpen ? (
          <NodeDetailPanel
            nodes={nodes}
            edges={edges}
            onUpdateNode={handleUpdateNode}
            onClose={() => setDetailPanelOpen(false)}
          />
        ) : null}
      </div>

      {/* Edge Edit Dialog */}
      <EdgeEditDialog
        open={edgeDialogOpen}
        onOpenChange={setEdgeDialogOpen}
        edge={selectedEdge}
        flags={(flagsData ?? []).map((f) => ({ id: f.id, name: f.name, category: f.category }))}
        onSave={handleEdgeSave}
        isPending={updateEdge.isPending}
      />
    </div>
  );
}

/* Components */

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function ToolbarButton({ icon, label, onClick }: ToolbarButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-xl"
    >
      {icon}
      <span className="text-[10px] leading-none whitespace-nowrap">{label}</span>
    </Button>
  );
}

interface NodeSearchPanelProps {
  nodes: Node[];
}

function NodeSearchPanel({ nodes }: NodeSearchPanelProps) {
  const { fitView } = useReactFlow();
  const [searchQuery, setSearchQuery] = useAtom(nodeSearchQueryAtom);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query) return;
    const matchingNodes = nodes.filter(
      (n) =>
        String(n.data.label ?? "")
          .toLowerCase()
          .includes(query.toLowerCase()) ||
        String(n.data.code ?? "")
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    if (matchingNodes.length > 0) {
      fitView({ nodes: matchingNodes, padding: 0.5, duration: 500 });
    }
  };

  return (
    <Panel position="top-center">
      <div className="flex items-center gap-1.5">
        <Search className="text-muted-foreground h-3.5 w-3.5" />
        <Input
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="노드 검색..."
          className="h-7 w-[200px] text-xs"
        />
      </div>
    </Panel>
  );
}

function GraphSkeleton() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Skeleton className="h-64 w-96 rounded-lg" />
      </div>
    </div>
  );
}
