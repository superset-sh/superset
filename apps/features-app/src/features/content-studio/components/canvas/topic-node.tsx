/**
 * TopicNode — Figma 디자인 기반 주제 노드
 *
 * 캡슐형 형태, 커스텀 색상(선/글자) 지원.
 * hover 시 상단에 추가 버튼 등 툴바 노출.
 */
import { memo } from "react";
import {
  Handle,
  Position,
  NodeToolbar,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";

interface TopicNodeData {
  label: string;
  color?: string | null;
  onAiSuggest?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  [key: string]: unknown;
}

function TopicNodeInner({ data, selected }: NodeProps<Node<TopicNodeData>>) {
  const d = data as TopicNodeData;
  const bgColor = d.color || "#e2e8f0";

  return (
    <div
      className="group relative flex h-10 min-w-[120px] items-center justify-center rounded-full border-2 bg-background px-4 shadow-sm transition-shadow hover:shadow-md cursor-pointer"
      style={{
        borderColor: bgColor,
        backgroundColor: `color-mix(in srgb, ${bgColor} 12%, transparent)`,
      }}
    >
      {/* 4-Way Handles */}
      {/* Top */}
      <Handle type="target" position={Position.Top} id="top-target" className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: bgColor }} />
      <Handle type="source" position={Position.Top} id="top-source" className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: bgColor }} />
      
      {/* Right */}
      <Handle type="target" position={Position.Right} id="right-target" className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: bgColor }} />
      <Handle type="source" position={Position.Right} id="right-source" className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: bgColor }} />
      
      {/* Bottom */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: bgColor }} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: bgColor }} />
      
      {/* Left */}
      <Handle type="target" position={Position.Left} id="left-target" className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: bgColor }} />
      <Handle type="source" position={Position.Left} id="left-source" className="!w-2.5 !h-2.5 !border-2 !border-background" style={{ backgroundColor: bgColor }} />

      {/* 선택 시 상단 툴바 */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div className="flex items-center gap-1 rounded-md border bg-background/95 px-1.5 py-1 shadow-sm backdrop-blur-sm">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              d.onAiSuggest?.();
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            AI 제안
          </Button>
          <div className="h-3.5 w-px bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              d.onEdit?.();
            }}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              d.onDelete?.();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </NodeToolbar>

      <span className="text-sm font-semibold truncate" style={{ color: bgColor }}>
        {d.label}
      </span>
    </div>
  );
}

export const TopicNode = memo(TopicNodeInner);
