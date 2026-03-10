/**
 * BoardCard - 칸반 카드 컴포넌트 (Compact / Full 모드)
 */
import { Link } from "@tanstack/react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { TaskStatusIcon } from "./task-status-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import type { CardSize, BoardCardData } from "../constants";
import { getInitials, formatShortDate } from "../helpers";
import { useDragClickGuard } from "../hooks/use-drag-click-guard";

interface Props {
  task: BoardCardData;
  cardSize: CardSize;
}

export function BoardCard({ task, cardSize }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  const { guardClick } = useDragClickGuard(isDragging);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-lg bg-card p-3 cursor-grab active:cursor-grabbing",
        "hover:bg-accent/50 transition-colors",
        isDragging && "opacity-40",
      )}
    >
      <Link
        to="/tasks/$identifier"
        params={{ identifier: task.identifier }}
        search={{ from: "board" }}
        className="block"
        onClick={guardClick}
      >
        <CardContent task={task} cardSize={cardSize} />
      </Link>
    </div>
  );
}

/** Drag overlay용 - useSortable 없이 순수 렌더링 */
export function BoardCardOverlay({
  task,
  cardSize,
}: {
  task: BoardCardData;
  cardSize: CardSize;
}) {
  return (
    <div className="rounded-lg bg-card p-3 shadow-lg scale-105 rotate-1">
      <div className="block">
        <CardContent task={task} cardSize={cardSize} />
      </div>
    </div>
  );
}

/* Components */

function CardContent({ task, cardSize }: { task: BoardCardData; cardSize: CardSize }) {
  return (
    <>
      {/* Row 1: Status + Identifier + Priority + Title */}
      <div className="flex items-center gap-1.5">
        <TaskStatusIcon status={task.status} size={14} />
        <span className="text-[11px] text-muted-foreground font-mono shrink-0">
          {task.identifier}
        </span>
        <TaskPriorityIcon priority={task.priority} size={12} />
        <span className="text-sm truncate min-w-0 font-medium">
          {task.title}
        </span>
      </div>

      {/* Full mode extras */}
      {cardSize === "full" ? (
        <>
          {task.labels && task.labels.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-2">
              {task.labels.slice(0, 3).map((label) => (
                <Badge
                  key={label.id}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4"
                  style={{ borderColor: label.color, color: label.color }}
                >
                  {label.name}
                </Badge>
              ))}
            </div>
          ) : null}

          {task.description ? (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
              {task.description}
            </p>
          ) : null}

          <div className="flex items-center justify-between mt-2">
            {task.assignee ? (
              <Avatar className="size-5">
                {task.assignee.avatar ? (
                  <AvatarImage
                    src={task.assignee.avatar}
                    alt={task.assignee.name}
                  />
                ) : null}
                <AvatarFallback className="text-[9px]">
                  {getInitials(task.assignee.name)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div />
            )}
            {task.dueDate ? (
              <span className="text-[11px] text-muted-foreground">
                {formatShortDate(task.dueDate)}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
