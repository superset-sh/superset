/**
 * Course Feature - Routes
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { CourseList } from "../pages/course-list";
import { CourseDetail } from "../pages/course-detail";
import { MyCourses } from "../pages/my-courses";
import { CourseLearn } from "../pages/course-learn";

// ============================================================================
// Route Paths
// ============================================================================

export const COURSE_PATH = "/course";
export const MY_COURSES_PATH = "/my/courses";
export const COURSE_LEARN_PATH = "/course/$slug/learn";

// ============================================================================
// Public Routes
// ============================================================================

/** 강의 목록 */
export const createCourseListRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/course",
    component: CourseList,
  });

/** 강의 상세 */
export const createCourseDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/course/$slug",
    component: CourseDetail,
  });

// ============================================================================
// Auth Routes (로그인 필요)
// ============================================================================

/** 내 수강 목록 */
export const createMyCoursesRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/my/courses",
    component: MyCourses,
  });

/** 학습 뷰어 */
export const createCourseLearnRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/course/$slug/learn",
    component: CourseLearn,
    validateSearch: (search: Record<string, unknown>) => ({
      lessonId: (search.lessonId as string) || undefined,
    }),
  });

// ============================================================================
// Route Groups
// ============================================================================

/** Course의 모든 Public Routes */
export function createCourseRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createCourseListRoute(parentRoute),
    createCourseDetailRoute(parentRoute),
  ];
}

/** Course의 Auth Routes (로그인 필요) */
export function createCourseAuthRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createMyCoursesRoute(parentRoute),
    createCourseLearnRoute(parentRoute),
  ];
}
