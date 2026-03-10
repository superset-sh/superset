/**
 * Task Sidebar - 태스크 상세 우측 속성 패널
 *
 * 인라인 편집으로 속성 변경 시 useUpdateTask() 호출
 */
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Trash2, X } from "lucide-react";
import type { TaskStatus } from "@superbuilder/drizzle";
import { STATUS_DISPLAY_ORDER, PRIORITY_LABELS } from "../constants";
import { getStatusLabel } from "./task-status-icon";
import { useUpdateTask, useDeleteTask, useTaskProjects, useTaskCycles } from "../hooks";

interface TaskData {
  id: string;
  identifier: string;
  status: TaskStatus;
  priority: number;
  assignee?: {
    id: string;
    name: string;
    avatar?: string | null;
  } | null;
  project?: {
    id: string;
    name: string;
  } | null;
  cycle?: {
    id: string;
    name?: string | null;
    number: number;
  } | null;
  labels?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  estimate?: number | null;
  dueDate?: string | null;
}

interface Props {
  task: TaskData;
  onDelete?: () => void;
}

export function TaskSidebar({ task, onDelete }: Props) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: projects } = useTaskProjects();
  const { data: cycles } = useTaskCycles();

  const handleUpdate = (field: string, value: unknown) => {
    updateTask.mutate({ id: task.id, data: { [field]: value } });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-semibold text-muted-foreground">Properties</h3>

      <Separator />

      {/* Status */}
      <PropertyRow label="Status">
        <Select
          key={`status-${task.id}`}
          value={task.status}
          onValueChange={(v) => {
            if (v) handleUpdate("status", v);
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue>{getStatusLabel(task.status)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_DISPLAY_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {getStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {/* Priority */}
      <PropertyRow label="Priority">
        <Select
          key={`priority-${task.id}`}
          value={String(task.priority)}
          onValueChange={(v) => {
            if (v) handleUpdate("priority", Number(v));
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue>{PRIORITY_LABELS[task.priority] ?? "None"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {/* Assignee */}
      <PropertyRow label="Assignee">
        <p className="text-sm">
          {task.assignee ? task.assignee.name : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </p>
      </PropertyRow>

      {/* Labels */}
      <PropertyRow label="Labels">
        <div className="flex flex-wrap gap-1">
          {task.labels?.length ? (
            task.labels.map((label) => (
              <Badge
                key={label.id}
                variant="outline"
                className="text-xs gap-1"
                style={{ borderColor: label.color, color: label.color }}
              >
                {label.name}
                <button
                  type="button"
                  aria-label={`Remove ${label.name}`}
                  className="hover:opacity-70"
                  onClick={() => {
                    const remaining = task.labels
                      ?.filter((l) => l.id !== label.id)
                      .map((l) => l.id) ?? [];
                    handleUpdate("labelIds", remaining);
                  }}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">No labels</span>
          )}
        </div>
      </PropertyRow>

      {/* Project */}
      <PropertyRow label="Project">
        <Select
          key={`project-${task.id}`}
          value={task.project?.id ?? "none"}
          onValueChange={(v) =>
            handleUpdate("projectId", v === "none" ? null : v)
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue>{task.project?.name ?? "No project"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No project</SelectItem>
            {projects?.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {/* Cycle */}
      <PropertyRow label="Cycle">
        <Select
          key={`cycle-${task.id}`}
          value={task.cycle?.id ?? "none"}
          onValueChange={(v) =>
            handleUpdate("cycleId", v === "none" ? null : v)
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue>{task.cycle?.name ?? (task.cycle ? `Cycle ${task.cycle.number}` : "No cycle")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No cycle</SelectItem>
            {cycles?.map((cycle) => (
              <SelectItem key={cycle.id} value={cycle.id}>
                {cycle.name ?? `Cycle ${cycle.number}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {/* Estimate */}
      <PropertyRow label="Estimate">
        <Input
          key={`estimate-${task.id}`}
          type="number"
          min={0}
          className="h-8 text-xs w-20"
          defaultValue={task.estimate ?? ""}
          onBlur={(e) => {
            const val = e.target.value ? Number(e.target.value) : null;
            if (val !== task.estimate) {
              handleUpdate("estimate", val);
            }
          }}
        />
      </PropertyRow>

      {/* Due Date */}
      <PropertyRow label="Due Date">
        <Input
          key={`dueDate-${task.id}`}
          type="date"
          className="h-8 text-xs"
          defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ""}
          onBlur={(e) => {
            const val = e.target.value || null;
            const current = task.dueDate ? task.dueDate.slice(0, 10) : null;
            if (val !== current) {
              handleUpdate("dueDate", val);
            }
          }}
        />
      </PropertyRow>

      <Separator />

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start gap-2"
        onClick={() => {
          if (!window.confirm(`Delete "${task.identifier}"? This cannot be undone.`)) return;
          deleteTask.mutate(
            { id: task.id },
            { onSuccess: () => onDelete?.() },
          );
        }}
      >
        <Trash2 className="size-4" />
        Delete task
      </Button>
    </div>
  );
}

/* Components */

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
