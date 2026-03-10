/**
 * useBoardDnd - 칸반 보드 드래그&드롭 로직
 *
 * sortOrder 계산, 컬럼 간/내 이동 처리, @dnd-kit 이벤트 핸들링
 */
import { useState } from "react";
import type {
  DragStartEvent,
  DragEndEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { TaskStatus } from "@superbuilder/drizzle";

interface TaskItem {
  id: string;
  status: TaskStatus;
  sortOrder: number;
}

interface UseBoardDndOptions {
  onMove: (
    updates: Array<{ id: string; status?: TaskStatus; sortOrder: number }>,
  ) => void;
}

export function useBoardDnd({ onMove }: UseBoardDndOptions) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (
    event: DragEndEvent,
    columns: Record<string, TaskItem[]>,
  ) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeTaskId = active.id as string;
    const overId = over.id as string;

    // Find source column
    const sourceColumn = findColumnForTask(activeTaskId, columns);
    if (!sourceColumn) return;

    // Determine target column
    let targetColumn: string;
    const overColumn = findColumnForTask(overId, columns);

    if (overColumn) {
      targetColumn = overColumn;
    } else if (columns[overId]) {
      // Dropped on an empty column
      targetColumn = overId;
    } else {
      return;
    }

    const sourceItems = columns[sourceColumn];
    if (!sourceItems) return;
    const sourceTasks = [...sourceItems];

    const targetItems = columns[targetColumn];
    if (!targetItems && sourceColumn !== targetColumn) return;
    const targetTasks =
      sourceColumn === targetColumn
        ? sourceTasks
        : [...(targetItems ?? [])];

    const oldIndex = sourceTasks.findIndex((t) => t.id === activeTaskId);
    if (oldIndex === -1) return;

    if (sourceColumn === targetColumn) {
      // Same column reorder
      const newIndex = targetTasks.findIndex((t) => t.id === overId);
      if (newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(targetTasks, oldIndex, newIndex);
      if (needsRenormalization(reordered, newIndex)) {
        onMove(renormalizeColumn(reordered, activeTaskId));
      } else {
        const updates = calculateSortOrders(reordered, newIndex);
        onMove(updates);
      }
    } else {
      // Cross-column move
      const movedTask = sourceTasks[oldIndex];
      if (!movedTask) return;
      sourceTasks.splice(oldIndex, 1);

      const overIndex = targetTasks.findIndex((t) => t.id === overId);
      const insertIndex = overIndex === -1 ? targetTasks.length : overIndex;
      targetTasks.splice(insertIndex, 0, movedTask);

      if (needsRenormalization(targetTasks, insertIndex)) {
        onMove(
          renormalizeColumn(targetTasks, activeTaskId, targetColumn as TaskStatus),
        );
      } else {
        const newSortOrder = calculateNewSortOrder(targetTasks, insertIndex);
        onMove([
          {
            id: activeTaskId,
            status: targetColumn as TaskStatus,
            sortOrder: newSortOrder,
          },
        ]);
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return {
    activeId,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}

/* Constants */

const SORT_ORDER_GAP = 1024;

/* Helpers */

function findColumnForTask(
  taskId: string,
  columns: Record<string, TaskItem[]>,
): string | null {
  for (const [columnId, tasks] of Object.entries(columns)) {
    if (tasks.some((t) => t.id === taskId)) {
      return columnId;
    }
  }
  return null;
}

/**
 * Check if the gap between adjacent items is too small for midpoint insertion.
 * When gap <= 1, Math.round produces a collision with prev or next.
 */
function needsRenormalization(tasks: TaskItem[], index: number): boolean {
  if (tasks.length <= 1) return false;
  const prev = tasks[index - 1];
  const next = tasks[index + 1];
  if (prev && next) return next.sortOrder - prev.sortOrder <= 1;
  if (!prev && next) return next.sortOrder <= 1;
  return false;
}

/**
 * Re-assign sortOrder for all items in the column with SORT_ORDER_GAP spacing.
 * Used when the gap between adjacent items collapses to <= 1.
 */
function renormalizeColumn(
  tasks: TaskItem[],
  changedId: string,
  statusOverride?: TaskStatus,
): Array<{ id: string; status?: TaskStatus; sortOrder: number }> {
  return tasks.map((t, i) => ({
    id: t.id,
    ...(t.id === changedId && statusOverride ? { status: statusOverride } : {}),
    sortOrder: (i + 1) * SORT_ORDER_GAP,
  }));
}

function calculateNewSortOrder(tasks: TaskItem[], index: number): number {
  if (tasks.length <= 1) return SORT_ORDER_GAP;

  const prev = tasks[index - 1];
  const next = tasks[index + 1];

  if (!prev) {
    const nextOrder = next?.sortOrder ?? SORT_ORDER_GAP;
    return Math.max(Math.round(nextOrder / 2), 1);
  }
  if (!next) return prev.sortOrder + SORT_ORDER_GAP;
  return Math.round((prev.sortOrder + next.sortOrder) / 2);
}

function calculateSortOrders(
  tasks: TaskItem[],
  changedIndex: number,
): Array<{ id: string; sortOrder: number }> {
  const task = tasks[changedIndex];
  if (!task) return [];
  const newOrder = calculateNewSortOrder(tasks, changedIndex);
  return [{ id: task.id, sortOrder: newOrder }];
}
