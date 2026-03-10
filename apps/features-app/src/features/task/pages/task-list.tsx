/**
 * TaskList - 태스크 목록 (상태별 그룹핑 + 드래그&드롭 상태 이동)
 */
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@superbuilder/feature-ui/shadcn/collapsible";
import { ChevronDown } from "lucide-react";
import type { TaskStatus } from "@superbuilder/drizzle";
import { STATUS_DISPLAY_ORDER, STATUS_CATEGORY_MAP } from "../constants";
import type { FilterState, TaskRowData, SortByField } from "../constants";
import { TaskRow, TaskRowOverlay } from "../components/task-row";
import { TaskFilterBar } from "../components/task-filter-bar";
import { getStatusLabel } from "../components/task-status-icon";
import { TaskStatusIcon } from "../components/task-status-icon";
import { useTasks, useUpdateTask } from "../hooks";

interface TaskListProps {
  filters?: FilterState;
  onFiltersChange?: (filters: FilterState) => void;
  sortBy?: SortByField;
  onSortByChange?: (sortBy: SortByField) => void;
  filterBarOnly?: boolean;
  hideSortBy?: boolean;
}

export function TaskList({
  filters: externalFilters,
  onFiltersChange: externalOnFiltersChange,
  sortBy: externalSortBy,
  onSortByChange: externalOnSortByChange,
  filterBarOnly,
  hideSortBy,
}: TaskListProps = {}) {
  const [localFilters, setLocalFilters] = useState<FilterState>({
    statuses: [],
    priorities: [],
    projectId: null,
    labelIds: [],
  });
  const [localSortBy, setLocalSortBy] = useState<SortByField>("createdAt");

  const filters = externalFilters ?? localFilters;
  const setFilters = externalOnFiltersChange ?? setLocalFilters;
  const sortBy = externalSortBy ?? localSortBy;
  const setSortBy = externalOnSortByChange ?? setLocalSortBy;

  // priority/dueDate → asc (urgent first, nearest date first)
  // createdAt/updatedAt → desc (newest first)
  const sortOrder = sortBy === "priority" || sortBy === "dueDate" ? "asc" : "desc";

  const { data: result, isLoading, error } = useTasks(
    {
      status: filters.statuses.length > 0 ? filters.statuses : undefined,
      priority: filters.priorities.length > 0 ? filters.priorities : undefined,
      projectId: filters.projectId,
      labelIds: filters.labelIds.length > 0 ? filters.labelIds : undefined,
      sortBy,
      sortOrder,
      limit: 100,
    },
    { enabled: !filterBarOnly },
  );

  const tasks = result?.tasks ?? [];

  if (filterBarOnly) {
    return (
      <TaskFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        hideSortBy={hideSortBy}
      />
    );
  }

  // Group tasks by status
  const groupedTasks = groupByStatus(tasks);

  return (
    <div className="flex flex-col">
      <TaskFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        sortBy={sortBy}
        onSortByChange={setSortBy}
      />

      {error ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-destructive">Failed to load tasks.</p>
        </div>
      ) : isLoading ? (
        <TaskListSkeleton />
      ) : tasks.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No tasks found.</p>
        </div>
      ) : (
        <DndTaskList groupedTasks={groupedTasks} />
      )}
    </div>
  );
}

/* Components */

function DndTaskList({
  groupedTasks,
}: {
  groupedTasks: Record<TaskStatus, TaskRowData[]>;
}) {
  const updateTask = useUpdateTask();
  const [activeTask, setActiveTask] = useState<TaskRowData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as TaskRowData | undefined;
    setActiveTask(task ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const task = active.data.current?.task as TaskRowData | undefined;
    if (!task) return;

    const targetStatus = over.data.current?.status as TaskStatus | undefined;
    if (!targetStatus || targetStatus === task.status) return;

    updateTask.mutate({ id: task.id, data: { status: targetStatus } });
  };

  const handleDragCancel = () => {
    setActiveTask(null);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col">
        {STATUS_DISPLAY_ORDER.map((status) => {
          const statusTasks = groupedTasks[status] ?? [];
          if (statusTasks.length === 0 && !activeTask) return null;

          const category = STATUS_CATEGORY_MAP[status];
          const defaultCollapsed =
            category === "completed" || category === "canceled";

          return (
            <StatusGroup
              key={status}
              status={status}
              tasks={statusTasks}
              defaultCollapsed={defaultCollapsed}
              isDragging={!!activeTask}
              isActiveStatus={activeTask?.status === status}
            />
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? <TaskRowOverlay task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function StatusGroup({
  status,
  tasks,
  defaultCollapsed,
  isDragging,
  isActiveStatus,
}: {
  status: TaskStatus;
  tasks: TaskRowData[];
  defaultCollapsed: boolean;
  isDragging: boolean;
  isActiveStatus: boolean;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);

  const { setNodeRef, isOver } = useDroppable({
    id: `status-${status}`,
    data: { type: "status-group", status },
  });

  const isEmpty = tasks.length === 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md transition-colors",
        isDragging && !isActiveStatus && "ring-1 ring-muted-foreground/20",
        isOver && !isActiveStatus && "bg-accent/30 ring-2 ring-primary/40",
      )}
    >
      <Collapsible open={isDragging ? true : open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2 hover:bg-muted/30 rounded-md transition-colors">
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              !(isDragging ? true : open) && "-rotate-90",
            )}
          />
          <TaskStatusIcon status={status} size={14} />
          <span className="text-sm font-medium">{getStatusLabel(status)}</span>
          <span className="text-xs text-muted-foreground">({tasks.length})</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {isEmpty ? (
            <div className="py-3 px-8 text-xs text-muted-foreground">
              Drop here to change status
            </div>
          ) : (
            tasks.map((task) => (
              <TaskRow key={task.id} task={task} draggable />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function TaskListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-2">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* Helpers */

function groupByStatus(
  tasks: TaskRowData[],
): Record<TaskStatus, TaskRowData[]> {
  const groups: Record<string, TaskRowData[]> = {};
  for (const task of tasks) {
    const s = task.status as string;
    if (!groups[s]) {
      groups[s] = [];
    }
    groups[s].push(task);
  }
  return groups as Record<TaskStatus, TaskRowData[]>;
}
