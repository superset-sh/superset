/**
 * Task Query Hooks
 *
 * 태스크, 프로젝트, 사이클, 라벨, 댓글, 활동 이력 조회 훅
 */
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import type { TaskStatus } from "@superbuilder/drizzle";

/** Reference data (projects, cycles, labels) rarely changes — 5 min staleTime */
const REFERENCE_STALE_TIME = 5 * 60 * 1000;

/** Task list data changes more frequently — 30s staleTime to reduce refetches on mount */
const TASK_LIST_STALE_TIME = 30 * 1000;

// ============================================================================
// Task
// ============================================================================

interface TaskListParams {
  status?: TaskStatus[];
  priority?: number[];
  assigneeId?: string | null;
  labelIds?: string[];
  projectId?: string | null;
  cycleId?: string | null;
  parentId?: string | null;
  query?: string;
  sortBy?: "createdAt" | "updatedAt" | "priority" | "dueDate" | "sortOrder";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export function useTasks(input?: TaskListParams, options?: { enabled?: boolean }) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.task.list.queryOptions(input),
    staleTime: TASK_LIST_STALE_TIME,
    ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
  });
}

export function useTaskByIdentifier(identifier: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.task.byIdentifier.queryOptions({ identifier }),
    enabled: !!identifier,
    retry: false,
  });
}

// ============================================================================
// Project
// ============================================================================

export function useTaskProjects() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.task.projectList.queryOptions(),
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useTaskProjectById(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.task.projectById.queryOptions({ id }),
    enabled: !!id,
  });
}

// ============================================================================
// Cycle
// ============================================================================

export function useTaskCycles() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.task.cycleList.queryOptions(),
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useTaskCycleById(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.task.cycleById.queryOptions({ id }),
    enabled: !!id,
  });
}

// ============================================================================
// Label
// ============================================================================

export function useTaskLabels() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.task.labelList.queryOptions(),
    staleTime: REFERENCE_STALE_TIME,
  });
}

// ============================================================================
// Comment
// ============================================================================

export function useTaskComments(taskId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.task.commentList.queryOptions({ taskId }),
    enabled: !!taskId,
  });
}

// ============================================================================
// Activity
// ============================================================================

export function useTaskActivities(taskId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.task.activityList.queryOptions({ taskId }),
    enabled: !!taskId,
  });
}
