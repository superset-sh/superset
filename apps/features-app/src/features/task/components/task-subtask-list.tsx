/**
 * Task Subtask List - 하위 태스크 목록
 */
import { Link } from "@tanstack/react-router";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { TaskStatusIcon } from "./task-status-icon";
import { useTasks } from "../hooks";
import type { TaskStatus } from "@superbuilder/drizzle";

interface Props {
  taskId: string;
  className?: string;
}

export function TaskSubtaskList({ taskId, className }: Props) {
  const { data: result, isLoading, isError } = useTasks({ parentId: taskId, limit: 50 });
  const subtasks = result?.tasks ?? [];

  if (isError) {
    return (
      <div className={cn("py-2", className)}>
        <p className="text-sm text-destructive">Failed to load subtasks.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn("py-2", className)}>
        <p className="text-sm text-muted-foreground">Loading subtasks...</p>
      </div>
    );
  }

  if (subtasks.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-sm font-semibold">
        Sub-tasks ({subtasks.length})
      </h3>
      <div className="rounded-md border">
        {subtasks.map((subtask) => (
          <Link
            key={subtask.id}
            to="/tasks/$identifier"
            params={{ identifier: subtask.identifier }}
            search={{ from: "list" }}
            className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors border-b last:border-b-0"
          >
            <TaskStatusIcon
              status={subtask.status as TaskStatus}
              size={14}
            />
            <span className="text-xs text-muted-foreground font-mono">
              {subtask.identifier}
            </span>
            <span className="text-sm truncate flex-1">
              {subtask.title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
