/**
 * Hello World Feature - Route Configs
 *
 * 템플릿 Feature의 라우트 정의
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { HelloWorldAdmin } from "./pages/hello-world-admin";
import { HelloWorldCard } from "./pages/hello-world-card";

// ============================================================================
// Route Paths (앱에서 메뉴 연결 시 참조)
// ============================================================================

export const HELLO_WORLD_PATH = "/hello-world";
export const HELLO_WORLD_ADMIN_PATH = "/hello-world";

// ============================================================================
// TanStack Router - Route 생성 함수
// ============================================================================

/**
 * Hello World Public Route 생성
 */
export const createHelloWorldRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: HELLO_WORLD_PATH,
    component: HelloWorldCard,
  });

/**
 * Hello World Admin Route 생성
 * Note: adminLayoutRoute의 자식으로 등록되므로 전체 경로 사용
 */
export const createHelloWorldAdminRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/hello-world",
    component: HelloWorldAdmin,
  });

/**
 * Hello World의 모든 Public Routes 생성
 */
export function createHelloWorldRoutes<T extends AnyRoute>(parentRoute: T) {
  return [createHelloWorldRoute(parentRoute)];
}

/**
 * Hello World의 모든 Admin Routes 생성
 */
export function createHelloWorldAdminRoutes<T extends AnyRoute>(parentRoute: T) {
  return [createHelloWorldAdminRoute(parentRoute)];
}
