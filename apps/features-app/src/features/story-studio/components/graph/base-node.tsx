/**
 * BaseNode - 모든 그래프 노드의 공통 래퍼
 *
 * 4방향 핸들, "..." 액션 메뉴, 선택 상태를 공통 제공.
 * 각 노드 타입(Scene, Choice 등)은 children으로 컨텐츠만 담당.
 */
import type { ReactNode } from "react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { Handle, Position } from "@xyflow/react";
import { Copy, Edit, MessageSquare, MoreHorizontal, Trash2 } from "lucide-react";

interface BaseNodeProps {
  nodeId: string;
  nodeType: "scene" | "choice" | "condition" | "start" | "end" | "merge";
  selected: boolean;
  variant?: "rectangular" | "circular";
  handleColor: string;
  children: ReactNode;
  className?: string;
  isOrphan?: boolean;
  isIncomplete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onNavigateDialogue?: () => void;
}

export function BaseNode({
  nodeId: _nodeId,
  nodeType: _nodeType,
  selected,
  variant = "rectangular",
  handleColor,
  children,
  className,
  isOrphan,
  isIncomplete,
  onEdit,
  onDelete,
  onDuplicate,
  onNavigateDialogue,
}: BaseNodeProps) {
  const isCircular = variant === "circular";
  const borderRadius = isCircular ? "rounded-full" : "rounded-2xl";

  return (
    <div
      className={cn(
        "group bg-background/95 relative shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md",
        borderRadius,
        selected ? "ring-primary border-transparent ring-2 ring-offset-1" : "border",
        isOrphan && "border-dashed !border-red-400/70",
        isIncomplete && "border-dashed !border-amber-400/70",
        className,
      )}
    >
      {/* Incomplete warning indicator */}
      {isIncomplete ? (
        <div className="ring-background absolute -top-2 -left-2 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950 shadow-sm ring-2">
          !
        </div>
      ) : null}

      {/* 4-direction handles: target + source stacked at same position per side */}
      {/* Each side has one visible dot; target & source overlap so connections work both ways */}
      {/* Top handles */}
      <Handle
        id="top-target"
        type="target"
        position={Position.Top}
        className={cn(
          "!border-background !h-2.5 !w-2.5 !border-2 !opacity-0 transition-opacity group-hover:!opacity-100",
          handleColor,
        )}
      />
      <Handle
        id="top-source"
        type="source"
        position={Position.Top}
        className={cn(
          "!border-background !h-2.5 !w-2.5 !border-2 !opacity-0 transition-opacity group-hover:!opacity-100",
          handleColor,
        )}
      />

      {/* Bottom handles */}
      <Handle
        id="bottom-target"
        type="target"
        position={Position.Bottom}
        className={cn(
          "!border-background !h-2.5 !w-2.5 !border-2 !opacity-0 transition-opacity group-hover:!opacity-100",
          handleColor,
        )}
      />
      <Handle
        id="bottom-source"
        type="source"
        position={Position.Bottom}
        className={cn(
          "!border-background !h-2.5 !w-2.5 !border-2 !opacity-0 transition-opacity group-hover:!opacity-100",
          handleColor,
        )}
      />

      {/* Left handles */}
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        className={cn(
          "!border-background !h-2.5 !w-2.5 !border-2 !opacity-0 transition-opacity group-hover:!opacity-100",
          handleColor,
        )}
      />
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        className={cn(
          "!border-background !h-2.5 !w-2.5 !border-2 !opacity-0 transition-opacity group-hover:!opacity-100",
          handleColor,
        )}
      />

      {/* Right handles */}
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        className={cn(
          "!border-background !h-2.5 !w-2.5 !border-2 !opacity-0 transition-opacity group-hover:!opacity-100",
          handleColor,
        )}
      />
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        className={cn(
          "!border-background !h-2.5 !w-2.5 !border-2 !opacity-0 transition-opacity group-hover:!opacity-100",
          handleColor,
        )}
      />

      {/* Action menu */}
      <div className="absolute top-2 right-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="text-muted-foreground hover:bg-muted inline-flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {onEdit ? (
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="mr-2 h-3.5 w-3.5" />
                편집
              </DropdownMenuItem>
            ) : null}
            {onDuplicate ? (
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                복제
              </DropdownMenuItem>
            ) : null}
            {onNavigateDialogue ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onNavigateDialogue}>
                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                  대사 편집
                </DropdownMenuItem>
              </>
            ) : null}
            {onDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  삭제
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Node content (provided by each node type) */}
      {children}
    </div>
  );
}
