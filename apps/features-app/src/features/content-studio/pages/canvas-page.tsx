/**
 * CanvasPage — React Flow 기반 콘텐츠 캔버스
 *
 * 주제(Topic)와 콘텐츠(Content) 노드를 시각적으로 관리한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { ArrowLeft, Plus, FileText, Palette } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCanvasData, useCanvasMutations } from "../hooks";
import { selectedNodeAtom, aiPanelOpenAtom, aiPanelTopicAtom } from "../store/canvas-store";
import { TopicNode } from "../components/canvas/topic-node";
import { ContentCardNode } from "../components/canvas/content-card-node";
import { AiSuggestPanel } from "../components/ai-suggest-panel";
import { RepurposeDialog } from "../components/canvas/repurpose-dialog";

interface Props {
  studioId: string;
}

export function CanvasPage({ studioId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useCanvasData(studioId);
  const mutations = useCanvasMutations(studioId);
  const queryClient = useQueryClient();
  const mutationsRef = useRef(mutations);
  mutationsRef.current = mutations;
  const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom);
  const setAiPanelOpen = useSetAtom(aiPanelOpenAtom);
  const setAiPanelTopic = useSetAtom(aiPanelTopicAtom);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; label: string; type: "topic" | "content" } | null>(null);
  const [repurposeContentId, setRepurposeContentId] = useState<string | null>(null);
  const connectingNodeId = useRef<string | null>(null);
  const connectingHandleId = useRef<string | null>(null);
  const reactFlowInstance = useRef<any>(null);
  const tempToRealMap = useRef<Record<string, string>>({});
  const edgeMemory = useRef<Record<string, { sourceHandle: string | null | undefined, targetHandle: string | null | undefined }>>({});

  // unmount 시 선택 리셋
  useEffect(() => {
    return () => setSelectedNode(null);
  }, [setSelectedNode]);

  // 1) 서버 데이터 → React Flow 노드/엣지 (data 변경 시에만 위치 리셋)
  useEffect(() => {
    if (!data) return;

    const { topics, contents, edges } = data;

    const topicNodes: Node[] = topics.map((t) => ({
      id: `topic-${t.id}`,
      type: "topicNode",
      position: { x: t.positionX ?? 0, y: t.positionY ?? 0 },
      data: {
        label: t.label,
        color: t.color,
        onAiSuggest: () => {
          setAiPanelTopic({ id: t.id, label: t.label });
          setAiPanelOpen(true);
        },
        onEdit: () => {
          // TODO: 주제 편집 모달
        },
        onDelete: () => {
          setDeleteConfirm({ id: t.id, label: t.label, type: "topic" });
        },
      },
    }));

    const contentNodes: Node[] = contents.map((c: any) => ({
      id: `content-${c.id}`,
      type: "contentCardNode",
      position: { x: c.positionX ?? 0, y: c.positionY ?? 0 },
      data: {
        title: c.title,
        status: c.status,
        authorName: c.authorName,
        viewCount: c.viewCount,
        topicLabel: c.topicLabel,
        repurposeFormat: c.repurposeFormat ?? null,
        derivedFromId: c.derivedFromId ?? null,
        onEdit: () => {
          navigate({
            to: "/content-studio/$studioId/$contentId/edit" as any,
            params: { studioId, contentId: c.id } as any,
          });
        },
        onDelete: () => {
          setDeleteConfirm({ id: c.id, label: c.title, type: "content" });
        },
        onRepurpose: () => setRepurposeContentId(c.id),
      },
    }));

    const derivedContentIds = new Set(
      contents.filter((c: any) => c.derivedFromId).map((c: any) => c.id)
    );

    // Get current local edges to merge handles if possible to prevent flicker during data sync
    // 매칭을 위해 source-target 조합을 키로 사용 (ID가 임시->실제로 바뀔 때 핸들 보존)
    const currentEdgesMap = new Map(flowEdges.map(e => [`${e.source}-${e.target}`, e]));

    const flowEdgeList: Edge[] = edges.map((e: any) => {
      const isDerivedEdge = e.targetType === "content" && derivedContentIds.has(e.targetId);
      const isTemp = e.id.startsWith("edge-temp-");
      
      // Preserve local optimistic handles if server didn't provide them (since DB doesn't store handles)
      const sourceKey = `${e.sourceType}-${e.sourceId}`;
      const targetKey = `${e.targetType}-${e.targetId}`;
      
      const tempTargetKey = Object.keys(tempToRealMap.current).find(k => tempToRealMap.current[k] === targetKey);
      const memory1 = edgeMemory.current[`${sourceKey}-${targetKey}`];
      const memory2 = tempTargetKey ? edgeMemory.current[`${sourceKey}-${tempTargetKey}`] : null;
      const mem = memory1 || memory2;

      const currentEdge = currentEdgesMap.get(`${e.sourceType}-${e.sourceId}-${e.targetType}-${e.targetId}`);
      
      const sourceHandle = e.sourceHandle || mem?.sourceHandle || (currentEdge?.sourceHandle) || "bottom-source";
      const targetHandle = e.targetHandle || mem?.targetHandle || (currentEdge?.targetHandle) || "top-target";

      return {
        id: e.id,
        source: `${e.sourceType}-${e.sourceId}`,
        target: `${e.targetType}-${e.targetId}`,
        sourceHandle,
        targetHandle,
        type: "default",
        animated: isDerivedEdge || isTemp,
        ...(isDerivedEdge && {
          style: { strokeDasharray: "6 3" },
          label: "파생",
        }),
        ...(isTemp && {
          style: { stroke: "#3b82f6", strokeWidth: 2, strokeDasharray: "5,5" },
        }),
      };
    });

    // 깜빡임과 위치 튀는 현상을 막기 위해 로컬 상태(flowNodes)와 서버 데이터 병합
    setFlowNodes((currentNodes) => {
      const serverNodes = [...topicNodes, ...contentNodes];
      
      // 서버에서 온 노드가 로컬에 있으면 데이터만 병합 (위치는 사용자가 드래그 중일 수 있으니 우선권 유지)
      return serverNodes.map((sNode) => {
        let existingNode = currentNodes.find(n => n.id === sNode.id);
        
        if (!existingNode) {
          const tempId = Object.keys(tempToRealMap.current).find(
            key => tempToRealMap.current[key] === sNode.id
          );
          if (tempId) {
            existingNode = currentNodes.find(n => n.id === tempId);
          }
        }
        
        if (existingNode) {
          return {
            ...sNode,
            // 사용자가 화면에서 이미 드래그했거나 선택 중인 로컬 위치를 최대한 보존 (옵션)
            // position: existingNode.position, 
            position: sNode.position, // 서버 위치를 쓰되, 이제 낙관적 업데이트가 있으므로 튀지 않음
            selected: existingNode.selected,
            dragging: existingNode.dragging,
            measured: existingNode.measured,
          };
        }
        return sNode;
      });
    });
    setFlowEdges(flowEdgeList);
  }, [data, setFlowNodes, setFlowEdges, setAiPanelTopic, setAiPanelOpen]);

  // 2) 선택 상태 반영
  useEffect(() => {
    setFlowNodes((prev) =>
      prev.map((n) => {
        const [type, ...rest] = n.id.split("-");
        const id = rest.join("-");
        return {
          ...n,
          selected:
            selectedNode?.id === id &&
            selectedNode?.type === type,
        };
      })
    );
  }, [selectedNode, setFlowNodes]);

  // 노드 클릭 → 선택
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const [type, ...rest] = node.id.split("-");
      const id = rest.join("-");
      if (type === "topic" || type === "content") {
        setSelectedNode({ id, type });
      }
    },
    [setSelectedNode]
  );

  // 콘텐츠 노드 더블클릭 → 에디터 이동
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id.startsWith("content-")) {
        const contentId = node.id.replace("content-", "");
        navigate({
          to: "/content-studio/$studioId/$contentId/edit" as any,
          params: { studioId, contentId } as any,
        });
      }
    },
    [navigate, studioId]
  );

  // 빈 영역 클릭 → 선택 해제
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const onConnectStart = useCallback((_: any, params: any) => {
    connectingNodeId.current = params.nodeId || null;
    connectingHandleId.current = params.handleId || null;
  }, []);

  const onConnectEnd = useCallback(
    (event: any) => {
      if (!connectingNodeId.current) return;

      const targetIsPane = event.target.classList.contains('react-flow__pane');

      if (targetIsPane) {
        // 드래그해서 빈 공간에 놓았을 때 새 콘텐츠 노드 생성
        const { clientX, clientY } =
          'changedTouches' in event ? event.changedTouches[0] : event;
        const position = reactFlowInstance.current?.screenToFlowPosition({
          x: clientX,
          y: clientY,
        }) || { x: 0, y: 0 };

        const [sourceType, ...sourceRest] = connectingNodeId.current.split("-");
        const sourceId = sourceRest.join("-");

        // 임시로 주제를 선택하게 하거나, 바로 콘텐츠 생성 후 엣지 연결
        // 여기서는 바로 새 콘텐츠를 생성하고 엣지를 연결하는 뮤테이션 호출
        // 노드를 즉시 보여주기 위해 낙관적 업데이트 활용
        // 에지도 낙관적으로 보여지게 하려면 별도의 state관리가 필요하지만, 
        // 일단 노드가 즉시 나타나게 되어 체감 속도가 매우 빨라집니다.
        // 노드를 생성할 때 반환되는 tempId를 미리 알기 어려우므로,
        // 로컬 상태(flowNodes/flowEdges)를 직접 강제로 렌더링하도록 훅을 짭니다.
        // 또는 임시 id를 클라이언트에서 직접 만들어 추가한 뒤 mutation을 쏘는 방식을 사용할 수 있습니다.
        
        
                const tempNodeId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const tempEdgeId = `edge-temp-${Date.now()}`;
        const getOppositeHandle = (handle: string | null) => {
          // handle format is now "position-type" e.g., "left-source"
          if (!handle) return "top-target";
          if (handle.includes("left")) return "right-target";
          if (handle.includes("right")) return "left-target";
          if (handle.includes("top")) return "bottom-target";
          return "top-target";
        };

        // 1. React Flow 로컬 상태에도 노드와 엣지를 즉시 삽입 (드래그 중인 선을 즉시 확정짓기 위함)
        setFlowNodes((nds) => [
          ...nds,
          {
            id: tempNodeId,
            type: "contentCardNode",
            position,
            data: {
              title: "새 콘텐츠",
              status: "draft",
              authorName: "나",
              viewCount: 0,
              commentCount: 0,
              onEdit: () => {},
              onDelete: () => {},
            },
          },
        ]);

        setFlowEdges((eds) => [
          ...eds,
          {
            id: tempEdgeId,
            source: connectingNodeId.current!,
            sourceHandle: connectingHandleId.current || "bottom-source",
            target: tempNodeId,
            targetHandle: getOppositeHandle(connectingHandleId.current),
            type: "default",
            animated: true,
            style: { stroke: "#3b82f6", strokeWidth: 2, strokeDasharray: "5,5" },
          },
        ]);
        
        edgeMemory.current[`${connectingNodeId.current}-${tempNodeId}`] = {
          sourceHandle: connectingHandleId.current || "bottom-source",
          targetHandle: getOppositeHandle(connectingHandleId.current)
        };

        // 2. Query Cache에 수동으로 노드와 선을 즉시 삽입 (최고의 UX를 위해 동시 삽입)
        const canvasQueryKey = [
          ["contentStudio", "canvas"],
          { input: { studioId }, type: "query" },
        ];
        
        // trpc v11 queryKey format
        queryClient.setQueryData(canvasQueryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            contents: [
              ...old.contents,
              {
                id: tempNodeId,
                title: "새 콘텐츠",
                status: "draft",
                positionX: position.x,
                positionY: position.y,
                studioId,
                authorName: "나",
                viewCount: 0,
                commentCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            edges: [
              ...old.edges,
              {
                id: tempEdgeId,
                studioId,
                sourceId,
                sourceType,
                targetId: tempNodeId,
                targetType: "content",
                // Handle IDs aren't saved in DB currently, but we inject them optimistically
                sourceHandle: connectingHandleId.current,
                targetHandle: getOppositeHandle(connectingHandleId.current),
                createdAt: new Date().toISOString(),
              },
            ],
          };
        });

        // 2. 서버로 생성 요청
        mutations.createContent.mutate(
          {
            title: "새 콘텐츠",
            studioId,
            positionX: position.x,
            positionY: position.y,
          },
          {
            onSuccess: (newContent) => {
              tempToRealMap.current[tempNodeId] = `content-${newContent.id}`;
              // 노드 생성이 완료되면 실제 ID로 선을 연결
              mutations.createEdge.mutate({
                studioId,
                sourceId,
                sourceType: sourceType as "topic" | "content",
                targetId: newContent.id,
                targetType: "content",
                // @ts-expect-error - Optimistic UI hack
                sourceHandle: connectingHandleId.current,
                targetHandle: getOppositeHandle(connectingHandleId.current),
              });
            },
          }
        );
      }
      connectingNodeId.current = null;
    },
    [mutations.createContent, mutations.createEdge, studioId, setFlowNodes, setFlowEdges]
  );

  // 엣지 연결
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const [sourceType, ...sourceRest] = connection.source.split("-");
      const [targetType, ...targetRest] = connection.target.split("-");
      const sourceId = sourceRest.join("-");
      const targetId = targetRest.join("-");

      if (
        (sourceType === "topic" || sourceType === "content") &&
        (targetType === "topic" || targetType === "content")
      ) {
        mutations.createEdge.mutate({
          studioId,
          sourceId,
          sourceType: sourceType as "topic" | "content",
          targetId,
          targetType: targetType as "topic" | "content",
          // @ts-expect-error - Optimistic UI hack to preserve handles until refresh
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        });
      }
    },
    [mutations.createEdge, studioId]
  );

  // 노드 드래그 종료 → 위치 저장
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const [type, ...rest] = node.id.split("-");
      const id = rest.join("-");
      if (type === "topic" || type === "content") {
        mutations.updateNodePositions.mutate({
          updates: [
            {
              id,
              type: type as "topic" | "content",
              positionX: node.position.x,
              positionY: node.position.y,
            },
          ],
        });
      }
    },
    [mutations.updateNodePositions]
  );

  // 주제 추가
  const handleAddTopic = () => {
    mutations.createTopic.mutate({
      studioId,
      label: "새 주제",
      positionX: 100 + Math.random() * 200,
      positionY: 100 + Math.random() * 200,
    });
  };

  // 콘텐츠 추가
  const handleAddContent = () => {
    mutations.createContent.mutate({
      studioId,
      title: "새 콘텐츠",
      positionX: 300 + Math.random() * 200,
      positionY: 300 + Math.random() * 200,
    });
  };

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      topicNode: TopicNode,
      contentCardNode: ContentCardNode,
    }),
    []
  );

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  // 에러 상태
  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">
          스튜디오를 찾을 수 없습니다.
        </p>
        <Link to="/content-studio">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            목록으로
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/content-studio">
            <Button variant="ghost" size="sm" className="h-8">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              목록
            </Button>
          </Link>
          <h2 className="text-sm font-semibold truncate max-w-[200px]">
            {data.studio.title}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Link to="/content-studio/$studioId/brand-voice" params={{ studioId }}>
            <Button variant="ghost" size="sm" className="h-8">
              <Palette className="mr-1 h-3.5 w-3.5" />
              브랜드 보이스
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="h-8" onClick={handleAddTopic}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            주제
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={handleAddContent}>
            <FileText className="mr-1 h-3.5 w-3.5" />
            콘텐츠
          </Button>
        </div>
      </div>

      {/* 캔버스 영역 */}
      <div className="relative flex-1 min-h-0">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          onInit={(instance) => { reactFlowInstance.current = instance; }}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} className="!bg-muted/20" />
          <Controls
            showInteractive={false}
            className="!bg-background !border !shadow-sm !rounded-lg"
          />
          <MiniMap
            nodeStrokeWidth={3}
            className="!bg-background/80 !border !shadow-sm !rounded-lg"
            maskColor="rgb(0 0 0 / 0.08)"
          />
        </ReactFlow>

        {/* AI 추천 사이드 패널 */}
        <AiSuggestPanel studioId={studioId} />
      </div>

      {/* 삭제 확인 다이얼로그 (주제 / 콘텐츠 공용) */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.type === "topic" ? "주제 삭제" : "콘텐츠 삭제"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteConfirm?.label}&quot;을(를) 삭제하시겠습니까?
              {deleteConfirm?.type === "topic" && " 관련 콘텐츠는 유지됩니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteConfirm) {
                  if (deleteConfirm.type === "topic") {
                    mutationsRef.current.deleteTopic.mutate({ id: deleteConfirm.id });
                  } else {
                    mutationsRef.current.deleteContent.mutate({ id: deleteConfirm.id });
                  }
                  setDeleteConfirm(null);
                }
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 리퍼포징 다이얼로그 */}
      {repurposeContentId && data && (
        <RepurposeDialog
          contentId={repurposeContentId}
          studioId={studioId}
          open={!!repurposeContentId}
          onOpenChange={(open) => {
            if (!open) setRepurposeContentId(null);
          }}
          existingFormats={
            data.contents
              .filter(
                (c: any) =>
                  c.derivedFromId === repurposeContentId && c.repurposeFormat,
              )
              .map((c: any) => c.repurposeFormat as string)
          }
          onConvertSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
