/**
 * Task Feature - Routes
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { TaskListPage } from "./task-list-page";
import { TaskDetailPage } from "./task-detail-page";

// ============================================================================
// Route Paths
// ============================================================================

export const TASK_PATH = "/tasks";

// ============================================================================
// Auth Routes
// ============================================================================

/** 태스크 목록 */
export const createTaskListRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/tasks",
    component: TaskListPage,
    validateSearch: (search: Record<string, unknown>) => ({
      view: (search.view as string) || undefined,
    }),
  });

/** 태스크 상세 */
export const createTaskDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/tasks/$identifier",
    component: TaskDetailPage,
  });

// ============================================================================
// Route Groups
// ============================================================================

/** Task의 모든 Auth Routes */
export function createTaskRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createTaskListRoute(parentRoute),
    createTaskDetailRoute(parentRoute),
  ];
}
