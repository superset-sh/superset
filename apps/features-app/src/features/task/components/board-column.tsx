/**
 * BoardColumn - 칸반 보드 상태별 컬럼
 */
import { useState } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { ChevronDown } from "lucide-react";
import type { TaskStatus } from "@superbuilder/drizzle";
import { TaskStatusIcon, getStatusLabel } from "./task-status-icon";
import { BoardCard } from "./board-card";
import type { CardSize, BoardCardData } from "../constants";
import { COLLAPSED_BY_DEFAULT } from "../constants";

interface Props {
  status: TaskStatus;
  tasks: BoardCardData[];
  cardSize: CardSize;
  isLoading?: boolean;
}

const COLLAPSE_STORAGE_KEY = "task-board-collapsed";

function getPersistedCollapse(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function BoardColumn({ status, tasks, cardSize, isLoading }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    const persisted = getPersistedCollapse();
    if (status in persisted) return persisted[status]!;
    return COLLAPSED_BY_DEFAULT.includes(status);
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      const persisted = getPersistedCollapse();
      persisted[status] = next;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Ignore localStorage write failures (quota exceeded, private mode, etc.)
    }
  };

  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: "column", status },
  });

  const isCollapsedEmpty = collapsed && tasks.length === 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg bg-muted/30 h-full shrink-0 transition-all snap-start",
        isCollapsedEmpty
          ? "min-w-[44px] w-[44px]"
          : "min-w-[280px] w-[280px]",
        isOver && "bg-primary/10",
      )}
    >
      {/* Column Header */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className={cn(
          "flex items-center gap-2 text-left hover:bg-muted/50 rounded-t-lg transition-colors",
          isCollapsedEmpty
            ? "flex-col px-1.5 py-3"
            : "px-3 py-2.5",
        )}
      >
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            collapsed && "-rotate-90",
          )}
        />
        <TaskStatusIcon status={status} size={14} />
        {isCollapsedEmpty ? (
          <span className="text-[10px] font-medium text-muted-foreground [writing-mode:vertical-lr]">
            {getStatusLabel(status)}
          </span>
        ) : (
          <>
            <span className="text-sm font-medium">{getStatusLabel(status)}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {tasks.length}
            </span>
          </>
        )}
      </button>

      {/* Column Body */}
      {collapsed ? null : (
        <div className="flex-1 flex flex-col px-2 pb-2 min-h-0">
          <div className="space-y-2 overflow-y-auto">
            {isLoading ? (
              <CardSkeletons count={3} />
            ) : (
              <SortableContext
                items={tasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {tasks.map((task) => (
                  <BoardCard key={task.id} task={task} cardSize={cardSize} />
                ))}
              </SortableContext>
            )}
          </div>

          {/* Drop zone — fills remaining column space */}
          <div className="flex-1 min-h-[80px] rounded-md transition-colors" />
        </div>
      )}
    </div>
  );
}

/* Components */

function CardSkeletons({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg bg-card p-3">
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="size-3" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        </div>
      ))}
    </>
  );
}
