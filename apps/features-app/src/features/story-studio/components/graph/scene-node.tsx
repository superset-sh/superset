/**
 * SceneNode - 씬(장면) 노드
 *
 * BaseNode 래퍼 + 씬 요약 정보 (캐릭터, 대사 수, 감정 톤)
 */
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { NodeProps } from "@xyflow/react";
import { MessageSquare, Users } from "lucide-react";
import { BaseNode } from "./base-node";

interface SceneNodeData {
  label: string;
  code: string;
  nodeType: string;
  // Validation indicators
  isOrphan?: boolean;
  isIncomplete?: boolean;
  // Scene metadata
  description?: string;
  // Summary data (from useNodeSummaries)
  dialogueCount?: number;
  characterNames?: string[];
  emotionalTone?: string;
  [key: string]: unknown;
}

export function SceneNode({ data, selected, id }: NodeProps) {
  const nodeData = data as SceneNodeData;
  const { id: projectId, chId: chapterId } = useParams({ strict: false });
  const navigate = useNavigate();

  const handleNavigateDialogue = () => {
    navigate({
      to: "/story-studio/$id/chapters/$chId/dialogue/$nodeId",
      params: { id: projectId ?? "", chId: chapterId ?? "", nodeId: id },
    });
  };

  return (
    <BaseNode
      nodeId={id}
      nodeType="scene"
      selected={selected}
      handleColor="!bg-primary"
      className="group min-w-[200px]"
      isOrphan={nodeData.isOrphan}
      isIncomplete={nodeData.isIncomplete}
      onNavigateDialogue={handleNavigateDialogue}
    >
      <div className="flex flex-col gap-2 p-4">
        <div>
          <div className="text-foreground text-base leading-6 font-medium">{nodeData.label}</div>
          <div className="text-muted-foreground mt-0.5 font-mono text-xs">{nodeData.code}</div>
        </div>

        {/* Description */}
        {nodeData.description ? (
          <div className="text-muted-foreground/90 mt-1 line-clamp-2 text-sm leading-snug">
            {nodeData.description}
          </div>
        ) : null}

        {/* Status Line */}
        <div className="mt-2 flex items-center justify-between">
          {/* Dialogue status dot */}
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              nodeData.dialogueCount && nodeData.dialogueCount > 0
                ? "bg-green-400"
                : "bg-muted-foreground/30",
            )}
            title={nodeData.dialogueCount ? `대사 ${nodeData.dialogueCount}개` : "대사 없음"}
          />
        </div>

        {/* Summary info */}
        {nodeData.dialogueCount !== undefined ||
        nodeData.characterNames?.length ||
        nodeData.emotionalTone ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            {nodeData.characterNames?.length ? (
              <span className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                <Users className="h-3 w-3" />
                {nodeData.characterNames.length}
              </span>
            ) : null}
            {nodeData.dialogueCount !== undefined ? (
              <span className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                <MessageSquare className="h-3 w-3" />
                {nodeData.dialogueCount}
              </span>
            ) : null}
            {nodeData.emotionalTone ? (
              <span className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                {nodeData.emotionalTone}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </BaseNode>
  );
}
