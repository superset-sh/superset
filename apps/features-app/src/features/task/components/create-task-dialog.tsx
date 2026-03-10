/**
 * Create Task Dialog - 태스크 생성 다이얼로그
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Plus } from "lucide-react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import type { TaskStatus } from "@superbuilder/drizzle";
import { STATUS_DISPLAY_ORDER, PRIORITY_LABELS } from "../constants";
import { getStatusLabel } from "./task-status-icon";
import { useCreateTask, useTaskProjects, useTaskLabels } from "../hooks";

const createTaskFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().optional(),
  status: z.enum([
    "backlog",
    "todo",
    "in_progress",
    "in_review",
    "done",
    "canceled",
    "duplicate",
  ]).default("backlog"),
  priority: z.number().min(0).max(4).default(0),
  projectId: z.string().uuid().optional().nullable(),
  estimate: z.number().min(0).optional().nullable(),
  labelIds: z.array(z.string().uuid()).optional(),
});

type CreateTaskFormValues = z.infer<typeof createTaskFormSchema>;

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false);
  const createTask = useCreateTask();
  const { data: projects } = useTaskProjects();
  const { data: labels } = useTaskLabels();

  const form = useForm<CreateTaskFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: standardSchemaResolver(createTaskFormSchema) as any,
    defaultValues: {
      title: "",
      description: "",
      status: "backlog",
      priority: 0,
      projectId: null,
      estimate: null,
      labelIds: [],
    },
  });

  const watchedValues = form.watch();

  const onSubmit = (values: CreateTaskFormValues) => {
    createTask.mutate(
      {
        title: values.title,
        description: values.description ?? undefined,
        status: values.status,
        priority: values.priority,
        projectId: values.projectId ?? undefined,
        estimate: values.estimate ?? undefined,
        labelIds: values.labelIds,
      },
      {
        onSuccess: () => {
          setOpen(false);
          form.reset();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="size-4" />
        New Task
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Task title"
              autoFocus
              {...form.register("title")}
            />
            {form.formState.errors.title ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.title.message}
              </p>
            ) : null}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Add description..."
              rows={3}
              {...form.register("description")}
            />
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select
                value={watchedValues.status}
                onValueChange={(v) => {
                  if (v) form.setValue("status", v as CreateTaskFormValues["status"]);
                }}
              >
                <SelectTrigger>
                  <SelectValue>{getStatusLabel(watchedValues.status as TaskStatus)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_DISPLAY_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>
                      {getStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select
                value={String(watchedValues.priority)}
                onValueChange={(v) => {
                  if (v) form.setValue("priority", Number(v));
                }}
              >
                <SelectTrigger>
                  <SelectValue>{PRIORITY_LABELS[watchedValues.priority] ?? "None"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Project */}
          <div className="flex flex-col gap-1.5">
            <Label>Project</Label>
            <Select
              value={watchedValues.projectId ?? "none"}
              onValueChange={(v) =>
                form.setValue("projectId", v === "none" ? null : v)
              }
            >
              <SelectTrigger>
                <SelectValue>{projects?.find((p) => p.id === watchedValues.projectId)?.name ?? "No project"}</SelectValue>
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
          </div>

          {/* Estimate */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estimate">Estimate (points)</Label>
            <Input
              id="estimate"
              type="number"
              min={0}
              placeholder="0"
              {...form.register("estimate", { valueAsNumber: true })}
            />
          </div>

          {/* Labels */}
          {labels?.length ? (
            <div className="flex flex-col gap-1.5">
              <Label>Labels</Label>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((label) => {
                  const selected = watchedValues.labelIds?.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                        selected
                          ? "bg-primary/10 border-primary text-primary"
                          : "hover:bg-muted",
                      )}
                      onClick={() => {
                        const current = form.getValues("labelIds") ?? [];
                        const next = current.includes(label.id)
                          ? current.filter((id) => id !== label.id)
                          : [...current, label.id];
                        form.setValue("labelIds", next);
                      }}
                    >
                      <div
                        className="size-2 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {createTask.isError ? (
            <p className="text-sm text-destructive">
              Failed to create task. Please try again.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
