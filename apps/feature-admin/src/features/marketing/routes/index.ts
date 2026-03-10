/**
 * Marketing Feature - Routes
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { MarketingDashboardPage } from "./marketing-dashboard-page";
import { CampaignDetailPage } from "./campaign-detail-page";
import { CampaignCreatePage } from "./campaign-create-page";
import { ContentEditorPage, ContentCreatePage } from "./content-editor-page";
import { CalendarPage } from "./calendar-page";
import { AccountPage } from "./account-page";
import { MarketingAdminPage } from "./admin/marketing-admin-page";

// ============================================================================
// Route Paths
// ============================================================================

export const MARKETING_PATH = "/marketing";
export const MARKETING_ADMIN_PATH = "/marketing";

// ============================================================================
// Auth Routes (로그인 필요)
// ============================================================================

/** 마케팅 대시보드 (캠페인 목록) */
export const createMarketingDashboardRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/marketing",
    component: MarketingDashboardPage,
  });

/** 캠페인 생성 */
export const createCampaignCreateRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/marketing/campaigns/new",
    component: CampaignCreatePage,
  });

/** 캠페인 상세 */
export const createCampaignDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/marketing/campaigns/$id",
    component: CampaignDetailPage,
  });

/** 콘텐츠 생성 */
export const createContentCreateRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/marketing/contents/new",
    component: ContentCreatePage,
  });

/** 콘텐츠 편집 */
export const createContentEditorRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/marketing/contents/$id/edit",
    component: ContentEditorPage,
  });

/** 발행 캘린더 */
export const createCalendarRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/marketing/calendar",
    component: CalendarPage,
  });

/** SNS 계정 관리 */
export const createAccountRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/marketing/accounts",
    component: AccountPage,
  });

// ============================================================================
// Admin Routes
// ============================================================================

/** Admin 마케팅 관리 */
export const createMarketingAdminRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/marketing",
    component: MarketingAdminPage,
  });

// ============================================================================
// Route Groups
// ============================================================================

/** Marketing의 모든 Auth Routes */
export function createMarketingRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createMarketingDashboardRoute(parentRoute),
    createCampaignCreateRoute(parentRoute),
    createCampaignDetailRoute(parentRoute),
    createContentCreateRoute(parentRoute),
    createContentEditorRoute(parentRoute),
    createCalendarRoute(parentRoute),
    createAccountRoute(parentRoute),
  ];
}

/** Marketing의 모든 Admin Routes */
export function createMarketingAdminRoutes<T extends AnyRoute>(parentRoute: T) {
  return [createMarketingAdminRoute(parentRoute)];
}
