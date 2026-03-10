/**
 * TaskDetail - 태스크 상세 (2컬럼 레이아웃)
 */
import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { TaskSidebar } from "../components/task-sidebar";
import { TaskActivityFeed } from "../components/task-activity-feed";
import { TaskCommentInput } from "../components/task-comment-input";
import { TaskSubtaskList } from "../components/task-subtask-list";
import { TaskStatusIcon } from "../components/task-status-icon";
import { useTaskByIdentifier, useUpdateTask } from "../hooks";
import type { TaskStatus } from "@superbuilder/drizzle";

interface Props {
  identifier: string;
}

export function TaskDetail({ identifier }: Props) {
  const { data: task, isLoading, error } = useTaskByIdentifier(identifier);
  const updateTask = useUpdateTask();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { from?: string };

  if (isLoading) {
    return <TaskDetailSkeleton />;
  }

  if (error || !task) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-destructive">Task not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Main Content */}
      <div className="lg:grid lg:grid-cols-3 flex-1 min-h-0">
        {/* Left 2/3: Content */}
        <div className="lg:col-span-2 overflow-y-auto p-6">
          <div className="flex flex-col gap-6 max-w-2xl">
            {/* Status + Identifier */}
            <div className="flex items-center gap-2">
              <TaskStatusIcon status={task.status as TaskStatus} size={18} />
              <span className="text-sm text-muted-foreground font-mono">
                {task.identifier}
              </span>
            </div>

            {/* Editable Title */}
            <EditableTitle
              key={`title-${task.id}`}
              title={task.title}
              onSave={(title) => updateTask.mutate({ id: task.id, data: { title } })}
            />

            {/* Editable Description */}
            <EditableDescription
              key={`desc-${task.id}`}
              description={task.description}
              onSave={(description) =>
                updateTask.mutate({ id: task.id, data: { description } })
              }
            />

            <Separator />

            {/* Subtasks */}
            <TaskSubtaskList taskId={task.id} />

            {/* Activity Feed */}
            <TaskActivityFeed taskId={task.id} />

            <Separator />

            {/* Comment Input */}
            <TaskCommentInput taskId={task.id} />
          </div>
        </div>

        {/* Right 1/3: Sidebar */}
        <div className="lg:col-span-1 border-l overflow-y-auto bg-muted/10">
          <TaskSidebar
            task={task}
            onDelete={() => navigate({ to: "/tasks", search: { view: search.from === "board" ? "board" : undefined } })}
          />
        </div>
      </div>
    </div>
  );
}

/* Components */

function EditableTitle({
  title,
  onSave,
}: {
  title: string;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);

  // Sync value when prop changes externally (e.g. optimistic update from sidebar)
  if (!editing && value !== title) {
    setValue(title);
  }

  const handleBlur = () => {
    if (!editing) return;
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) {
      onSave(trimmed);
    } else {
      setValue(title);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setValue(title);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        className="text-2xl font-bold border-none shadow-none px-0 focus-visible:ring-0 h-auto"
      />
    );
  }

  return (
    <h1
      className="text-2xl font-bold cursor-text hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring rounded px-1 -mx-1 py-0.5 transition-colors outline-none"
      tabIndex={0}
      role="button"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {title}
    </h1>
  );
}

function EditableDescription({
  description,
  onSave,
}: {
  description?: string | null;
  onSave: (description: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description ?? "");

  // Sync value when prop changes externally
  const normalizedDesc = description ?? "";
  if (!editing && value !== normalizedDesc) {
    setValue(normalizedDesc);
  }

  const handleBlur = () => {
    if (!editing) return;
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed !== (description ?? "").trim()) {
      onSave(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setValue(description ?? "");
      setEditing(false);
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  if (editing) {
    return (
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        rows={4}
        className="resize-none"
        placeholder="Add a description..."
      />
    );
  }

  return (
    <div
      className={cn(
        "text-sm cursor-text min-h-[60px] rounded px-1 -mx-1 py-1 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring transition-colors whitespace-pre-wrap outline-none",
        !description && "text-muted-foreground",
      )}
      tabIndex={0}
      role="button"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {description ? description : "Add a description..."}
    </div>
  );
}

function TaskDetailSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="lg:grid lg:grid-cols-3 flex-1 min-h-0">
        <div className="lg:col-span-2 p-6">
          <div className="flex flex-col gap-6 max-w-2xl">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
        <div className="lg:col-span-1 border-l p-4">
          <div className="flex flex-col gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
