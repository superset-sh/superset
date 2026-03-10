/**
 * Task Filter Bar - Popover 기반 필터 + 정렬
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@superbuilder/feature-ui/shadcn/popover";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Filter, ArrowUpDown, X } from "lucide-react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import type { TaskStatus } from "@superbuilder/drizzle";
import { STATUS_DISPLAY_ORDER, PRIORITY_LABELS } from "../constants";
import type { FilterState, SortByField } from "../constants";
import { getStatusLabel } from "./task-status-icon";
import { useTaskProjects, useTaskLabels } from "../hooks";

interface Props {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  sortBy: SortByField;
  onSortByChange: (sortBy: SortByField) => void;
  hideSortBy?: boolean;
  className?: string;
}

export function TaskFilterBar({
  filters,
  onFiltersChange,
  sortBy,
  onSortByChange,
  hideSortBy,
  className,
}: Props) {
  const activeFilterCount =
    filters.statuses.length +
    filters.priorities.length +
    (filters.projectId ? 1 : 0) +
    filters.labelIds.length;

  const handleClearAll = () => {
    onFiltersChange({
      statuses: [],
      priorities: [],
      projectId: null,
      labelIds: [],
    });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2",
        className,
      )}
    >
      <Filter className="size-4 text-muted-foreground shrink-0" />

      <StatusFilterPopover
        selected={filters.statuses}
        onChange={(statuses) => onFiltersChange({ ...filters, statuses })}
      />

      <PriorityFilterPopover
        selected={filters.priorities}
        onChange={(priorities) => onFiltersChange({ ...filters, priorities })}
      />

      <ProjectFilterPopover
        selected={filters.projectId}
        onChange={(projectId) => onFiltersChange({ ...filters, projectId })}
      />

      <LabelFilterPopover
        selected={filters.labelIds}
        onChange={(labelIds) => onFiltersChange({ ...filters, labelIds })}
      />

      {activeFilterCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
          onClick={handleClearAll}
        >
          <X className="size-3" />
          Clear
        </Button>
      ) : null}

      <div className="flex-1" />

      {/* Sort (hidden in board view — board uses manual ordering) */}
      {hideSortBy ? null : (
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
          <Select
            value={sortBy}
            onValueChange={(v) => {
              if (v) onSortByChange(v as SortByField);
            }}
          >
            <SelectTrigger className="h-7 text-xs w-[120px]">
              <SelectValue>{SORT_LABELS[sortBy] ?? sortBy}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Created</SelectItem>
              <SelectItem value="updatedAt">Updated</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="dueDate">Due Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

/* Constants */

const SORT_LABELS: Record<SortByField, string> = {
  createdAt: "Created",
  updatedAt: "Updated",
  priority: "Priority",
  dueDate: "Due Date",
};

/* Components */

function StatusFilterPopover({
  selected,
  onChange,
}: {
  selected: TaskStatus[];
  onChange: (v: TaskStatus[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const handleToggle = (status: TaskStatus) => {
    const next = selected.includes(status)
      ? selected.filter((s) => s !== status)
      : [...selected, status];
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-7 text-xs gap-1" />}>
        Status
        {selected.length > 0 ? (
          <Badge variant="secondary" className="ml-0.5 px-1 py-0 text-[10px]">
            {selected.length}
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-2">
        <div className="flex flex-col gap-1">
          {STATUS_DISPLAY_ORDER.map((status) => (
            <label
              key={status}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(status)}
                onCheckedChange={() => handleToggle(status)}
              />
              <span className="text-sm">{getStatusLabel(status)}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PriorityFilterPopover({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (v: number[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const handleToggle = (priority: number) => {
    const next = selected.includes(priority)
      ? selected.filter((p) => p !== priority)
      : [...selected, priority];
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-7 text-xs gap-1" />}>
        Priority
        {selected.length > 0 ? (
          <Badge variant="secondary" className="ml-0.5 px-1 py-0 text-[10px]">
            {selected.length}
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-2">
        <div className="flex flex-col gap-1">
          {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(Number(key))}
                onCheckedChange={() => handleToggle(Number(key))}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProjectFilterPopover({
  selected,
  onChange,
}: {
  selected: string | null;
  onChange: (v: string | null) => void;
}) {
  const { data: projects, isLoading } = useTaskProjects();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-7 text-xs gap-1" />}>
        Project
        {selected ? (
          <Badge variant="secondary" className="ml-0.5 px-1 py-0 text-[10px]">
            1
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-2">
        <div className="flex flex-col gap-1">
          <label
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
          >
            <Checkbox
              checked={selected === null}
              onCheckedChange={() => onChange(null)}
            />
            <span className="text-sm text-muted-foreground">All Projects</span>
          </label>
          {projects?.map((project) => (
            <label
              key={project.id}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={selected === project.id}
                onCheckedChange={() =>
                  onChange(selected === project.id ? null : project.id)
                }
              />
              <span className="text-sm">{project.name}</span>
            </label>
          ))}
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              Loading...
            </p>
          ) : !projects?.length ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              No projects
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LabelFilterPopover({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const { data: labels, isLoading } = useTaskLabels();
  const [open, setOpen] = useState(false);

  const handleToggle = (labelId: string) => {
    const next = selected.includes(labelId)
      ? selected.filter((id) => id !== labelId)
      : [...selected, labelId];
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-7 text-xs gap-1" />}>
        Label
        {selected.length > 0 ? (
          <Badge variant="secondary" className="ml-0.5 px-1 py-0 text-[10px]">
            {selected.length}
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-2">
        <div className="flex flex-col gap-1">
          {labels?.map((label) => (
            <label
              key={label.id}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(label.id)}
                onCheckedChange={() => handleToggle(label.id)}
              />
              <div className="flex items-center gap-1.5">
                <div
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="text-sm">{label.name}</span>
              </div>
            </label>
          ))}
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              Loading...
            </p>
          ) : !labels?.length ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              No labels
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
