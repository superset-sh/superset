/**
 * Data Tracker Feature - Routes
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { TrackerListPage } from "./tracker-list-page";
import { TrackerDetailPage } from "./tracker-detail-page";

// ============================================================================
// Route Paths
// ============================================================================

export const DATA_TRACKER_PATH = "/data-tracker";

// ============================================================================
// Auth Routes
// ============================================================================

/** 트래커 목록 */
export const createTrackerListRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/data-tracker",
    component: TrackerListPage,
  });

/** 트래커 상세 */
export const createTrackerDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/data-tracker/$slug",
    component: TrackerDetailPage,
  });

// ============================================================================
// Route Groups
// ============================================================================

/** Data Tracker의 모든 Auth Routes */
export function createDataTrackerRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createTrackerListRoute(parentRoute),
    createTrackerDetailRoute(parentRoute),
  ];
}
