/**
 * Hello World Feature - Route Configs
 *
 * 템플릿 Feature의 라우트 정의
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { HelloWorldCard } from "./pages/hello-world-card";

// ============================================================================
// Route Paths (앱에서 메뉴 연결 시 참조)
// ============================================================================

export const HELLO_WORLD_PATH = "/hello-world";

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
 * Hello World의 모든 Public Routes 생성
 */
export function createHelloWorldRoutes<T extends AnyRoute>(parentRoute: T) {
  return [createHelloWorldRoute(parentRoute)];
}
