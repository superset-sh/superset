/**
 * Task Row - 태스크 목록의 단일 행
 *
 * [GripHandle] [StatusIcon] TASK-123 [PriorityIcon] [Labels...] Title [@avatar] [date]
 */
import { Link } from "@tanstack/react-router";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@superbuilder/feature-ui/shadcn/avatar";
import { GripVertical } from "lucide-react";
import { TaskStatusIcon } from "./task-status-icon";
import { TaskPriorityIcon } from "./task-priority-icon";
import type { TaskRowData } from "../constants";
import { getInitials, formatShortDate } from "../helpers";
import { useDragClickGuard } from "../hooks/use-drag-click-guard";

interface Props {
  task: TaskRowData;
  className?: string;
  draggable?: boolean;
}

export function TaskRow({ task, className, draggable }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: task.id,
    data: { type: "task", task },
    disabled: !draggable,
  });

  const { guardClick } = useDragClickGuard(isDragging);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center",
        isDragging && "opacity-40",
      )}
    >
      {draggable ? (
        <button
          type="button"
          className="shrink-0 px-1 py-2 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      ) : null}
      <Link
        to="/tasks/$identifier"
        params={{ identifier: task.identifier }}
        search={{ from: "list" }}
        className={cn(
          "group flex flex-1 items-center gap-2 px-4 py-2 hover:bg-muted/50 rounded-md transition-colors",
          draggable && "pl-1",
          className,
        )}
        onClick={guardClick}
      >
        {/* Status Icon */}
        <TaskStatusIcon status={task.status} size={16} />

        {/* Identifier */}
        <span className="text-xs text-muted-foreground font-mono shrink-0">
          {task.identifier}
        </span>

        {/* Priority Icon */}
        <TaskPriorityIcon priority={task.priority} size={14} />

        {/* Labels */}
        {task.labels?.length ? (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {task.labels.slice(0, 3).map((label) => (
              <Badge
                key={label.id}
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 border"
                style={{
                  borderColor: label.color,
                  color: label.color,
                }}
              >
                {label.name}
              </Badge>
            ))}
            {task.labels.length > 3 ? (
              <span className="text-[10px] text-muted-foreground">
                +{task.labels.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Title */}
        <span className="flex-1 text-sm truncate min-w-0">
          {task.title}
        </span>

        {/* Assignee Avatar */}
        {task.assignee ? (
          <Avatar className="size-5 shrink-0">
            {task.assignee.avatar ? (
              <AvatarImage src={task.assignee.avatar} alt={task.assignee.name} />
            ) : null}
            <AvatarFallback className="text-[10px]">
              {getInitials(task.assignee.name)}
            </AvatarFallback>
          </Avatar>
        ) : null}

        {/* Due Date */}
        {task.dueDate ? (
          <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">
            {formatShortDate(task.dueDate)}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

/** Drag overlay용 - 드래그 중 표시되는 행 */
export function TaskRowOverlay({ task }: { task: TaskRowData }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-md shadow-lg border">
      <TaskStatusIcon status={task.status} size={16} />
      <span className="text-xs text-muted-foreground font-mono shrink-0">
        {task.identifier}
      </span>
      <TaskPriorityIcon priority={task.priority} size={14} />
      <span className="text-sm truncate min-w-0">{task.title}</span>
    </div>
  );
}

