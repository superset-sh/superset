/**
 * NodeDetailPanel - 노드 상세 사이드 패널
 *
 * 선택된 노드의 정보 편집 및 연결된 엣지 확인
 */
import { useState } from "react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import type { Edge, Node } from "@xyflow/react";
import { useAtomValue } from "jotai";
import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";
import { selectedNodeIdAtom } from "../../store/graph.atoms";

interface NodeDetailPanelProps {
  nodes: Node[];
  edges: Edge[];
  onUpdateNode: (
    id: string,
    data: { label?: string; code?: string; metadata?: Record<string, unknown> },
  ) => void;
  onClose: () => void;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  scene: "씬",
  choice: "선택지",
  condition: "조건",
  start: "시작",
  end: "종료",
  merge: "병합",
};

export function NodeDetailPanel({ nodes, edges, onUpdateNode, onClose }: NodeDetailPanelProps) {
  const selectedNodeId = useAtomValue(selectedNodeIdAtom);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="bg-background flex w-80 shrink-0 flex-col border-l">
        <PanelHeader onClose={onClose} />
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-muted-foreground text-sm">노드를 선택하세요</p>
        </div>
      </div>
    );
  }

  const nodeData = selectedNode.data as Record<string, unknown>;
  const nodeLabel = (nodeData.label as string) ?? "";
  const nodeCode = (nodeData.code as string) ?? "";
  const nodeType = (selectedNode.type as string) ?? "scene";

  const incomingEdges = edges.filter((e) => e.target === selectedNode.id);
  const outgoingEdges = edges.filter((e) => e.source === selectedNode.id);

  return (
    <div className="bg-background flex w-80 shrink-0 flex-col border-l">
      <PanelHeader onClose={onClose} />

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          {/* Node Type */}
          <div>
            <Label className="text-muted-foreground text-xs">노드 유형</Label>
            <p className="mt-1 text-sm font-medium">{NODE_TYPE_LABELS[nodeType] ?? nodeType}</p>
          </div>

          {/* Label Edit */}
          <NodeFieldEditor
            label="이름"
            value={nodeLabel}
            onSave={(value) => onUpdateNode(selectedNode.id, { label: value })}
          />

          {/* Code Edit */}
          <NodeFieldEditor
            label="코드"
            value={nodeCode}
            onSave={(value) => onUpdateNode(selectedNode.id, { code: value })}
          />

          {/* Description (Scene nodes only) */}
          {nodeType === "scene" ? (
            <NodeTextareaEditor
              label="설명"
              value={(nodeData.description as string) ?? ""}
              placeholder="씬에 대한 간단한 설명..."
              onSave={(value) =>
                onUpdateNode(selectedNode.id, {
                  metadata: { description: value },
                })
              }
            />
          ) : null}

          <Separator />

          {/* Connected Edges */}
          <div>
            <Label className="text-muted-foreground text-xs">
              연결 ({incomingEdges.length + outgoingEdges.length})
            </Label>

            <div className="mt-2 space-y-1">
              {/* Incoming */}
              {incomingEdges.map((edge) => {
                const sourceNode = nodes.find((n) => n.id === edge.source);
                const sourceLabel = (sourceNode?.data as Record<string, unknown>)?.label as string;
                return (
                  <EdgeItem
                    key={edge.id}
                    direction="incoming"
                    nodeLabel={sourceLabel ?? edge.source}
                    edgeLabel={(edge.label as string) ?? undefined}
                  />
                );
              })}

              {/* Outgoing */}
              {outgoingEdges.map((edge) => {
                const targetNode = nodes.find((n) => n.id === edge.target);
                const targetLabel = (targetNode?.data as Record<string, unknown>)?.label as string;
                return (
                  <EdgeItem
                    key={edge.id}
                    direction="outgoing"
                    nodeLabel={targetLabel ?? edge.target}
                    edgeLabel={(edge.label as string) ?? undefined}
                  />
                );
              })}

              {incomingEdges.length === 0 && outgoingEdges.length === 0 ? (
                <p className="text-muted-foreground text-xs">연결된 엣지가 없습니다</p>
              ) : null}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

/* Components */

interface PanelHeaderProps {
  onClose: () => void;
}

function PanelHeader({ onClose }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2">
      <h3 className="text-sm font-semibold">노드 상세</h3>
      <Button variant="ghost" size="icon-xs" onClick={onClose} className="h-6 w-6">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface NodeFieldEditorProps {
  label: string;
  value: string;
  onSave: (value: string) => void;
}

function NodeFieldEditor({ label, value, onSave }: NodeFieldEditorProps) {
  const [editValue, setEditValue] = useState(value);

  // Sync when selected node changes
  if (editValue !== value && document.activeElement?.tagName !== "INPUT") {
    setEditValue(value);
  }

  const handleBlur = () => {
    if (editValue !== value) {
      onSave(editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <div>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Input
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="mt-1 h-8 text-sm"
      />
    </div>
  );
}

interface NodeTextareaEditorProps {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
}

function NodeTextareaEditor({ label, value, placeholder, onSave }: NodeTextareaEditorProps) {
  const [editValue, setEditValue] = useState(value);

  // Sync when selected node changes
  if (editValue !== value && document.activeElement?.tagName !== "TEXTAREA") {
    setEditValue(value);
  }

  const handleBlur = () => {
    if (editValue !== value) {
      onSave(editValue);
    }
  };

  return (
    <div>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Textarea
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="mt-1 min-h-[60px] text-sm"
        rows={3}
      />
    </div>
  );
}

interface EdgeItemProps {
  direction: "incoming" | "outgoing";
  nodeLabel: string;
  edgeLabel?: string;
}

function EdgeItem({ direction, nodeLabel, edgeLabel }: EdgeItemProps) {
  const isIncoming = direction === "incoming";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1 text-xs",
        isIncoming ? "bg-blue-50 dark:bg-blue-950/30" : "bg-green-50 dark:bg-green-950/30",
      )}
    >
      {isIncoming ? (
        <ArrowDownRight className="h-3 w-3 shrink-0 text-blue-500" />
      ) : (
        <ArrowUpRight className="h-3 w-3 shrink-0 text-green-500" />
      )}
      <span className="truncate font-medium">{nodeLabel}</span>
      {edgeLabel ? (
        <span className="text-muted-foreground ml-auto truncate">{edgeLabel}</span>
      ) : null}
    </div>
  );
}
