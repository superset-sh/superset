/**
 * TaskBoard - 칸반 보드 메인 컴포넌트
 *
 * @dnd-kit DndContext로 전체 D&D 관리.
 * status별 컬럼 + 카드 배치 + 드래그 오버레이.
 */
import {
  DndContext,
  closestCorners,
  pointerWithin,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { STATUS_DISPLAY_ORDER } from "../constants";
import type { CardSize, FilterState } from "../constants";
import { BoardColumn } from "./board-column";
import { BoardCardOverlay } from "./board-card";
import { useBoardDnd } from "../hooks/use-board-dnd";
import { useBulkUpdateOrder } from "../hooks/use-task-mutations";
import { useTasks } from "../hooks/use-task-queries";

interface Props {
  filters: FilterState;
  cardSize: CardSize;
}

export function TaskBoard({ filters, cardSize }: Props) {
  // Board always sorts by sortOrder (manual ordering via D&D)
  const { data: result, isLoading, error } = useTasks({
    status: filters.statuses.length > 0 ? filters.statuses : undefined,
    priority: filters.priorities.length > 0 ? filters.priorities : undefined,
    projectId: filters.projectId,
    labelIds: filters.labelIds.length > 0 ? filters.labelIds : undefined,
    sortBy: "sortOrder",
    sortOrder: "asc",
    limit: 200,
  });

  const bulkUpdate = useBulkUpdateOrder();

  const tasks = result?.tasks ?? [];

  // Group tasks by status into columns
  const columns: Record<string, typeof tasks> = {};
  for (const status of STATUS_DISPLAY_ORDER) {
    columns[status] = [];
  }
  for (const task of tasks) {
    const col = columns[task.status as string];
    if (col) {
      col.push(task);
    }
  }

  // Sort each column by sortOrder
  for (const col of Object.values(columns)) {
    col.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  const { activeId, handleDragStart, handleDragEnd, handleDragCancel } =
    useBoardDnd({
      onMove: (updates) => {
        bulkUpdate.mutate({ updates });
      },
    });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeTask = activeId
    ? tasks.find((t) => t.id === activeId)
    : null;

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">Failed to load tasks.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={kanbanCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={(event: DragEndEvent) => handleDragEnd(event, columns)}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-3 overflow-x-auto px-1 snap-x snap-proximity scroll-smooth h-[calc(100vh-220px)]">
        {STATUS_DISPLAY_ORDER.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={columns[status] ?? []}
            cardSize={cardSize}
            isLoading={isLoading}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <BoardCardOverlay task={activeTask} cardSize={cardSize} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* Constants */

/**
 * Kanban collision detection: pointerWithin first (catches empty columns),
 * then closestCorners (precise sorting within columns).
 */
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCorners(args);
};
