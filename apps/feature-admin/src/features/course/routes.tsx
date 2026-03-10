/**
 * Course Feature - Routes
 */
import { createRoute, type AnyRoute } from "@tanstack/react-router";
import {
  CourseAdmin,
  TopicManagement,
  CourseCreate,
  CourseDetail,
} from "./pages";

// ============================================================================
// Route Paths
// ============================================================================

export const COURSE_ADMIN_PATH = "/course";
export const COURSE_ADMIN_TOPICS_PATH = "/course/topics";

// ============================================================================
// Admin Routes
// ============================================================================

/** Admin 강의 목록 */
export const createCourseAdminRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/course",
    component: CourseAdmin,
  });

/** Admin 주제 관리 */
export const createTopicAdminRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/course/topics",
    component: TopicManagement,
  });

/** 새 강의 생성 */
export const createCourseCreateRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/course/new",
    component: CourseCreate,
  });

/** 강의 상세 (편집/커리큘럼/수강생/첨부파일) */
export const createCourseDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/course/$courseId",
    component: CourseDetail,
  });

// ============================================================================
// Route Groups
// ============================================================================

/** Course의 모든 Admin Routes */
export function createCourseAdminRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createCourseAdminRoute(parentRoute),
    createTopicAdminRoute(parentRoute),
    createCourseCreateRoute(parentRoute),
    createCourseDetailRoute(parentRoute),
  ];
}
