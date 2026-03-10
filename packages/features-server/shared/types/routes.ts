/**
 * Route Config 타입
 *
 * Feature에서 라우트를 정의할 때 사용
 */
import type { ComponentType } from "react";

export interface RouteConfig {
  /**
   * 라우트 경로 (TanStack Router 형식)
   * 예: "/blog", "/blog/$slug", "/admin/blog/$id/edit"
   */
  path: string;

  /**
   * 컴포넌트 (lazy import 함수 또는 직접 컴포넌트)
   */
  component: ComponentType<unknown> | (() => Promise<{ default: ComponentType<unknown> }>);

  /**
   * 레이아웃 (옵션)
   * 예: "admin" -> AdminLayout 적용
   */
  layout?: "admin" | "public";
}
