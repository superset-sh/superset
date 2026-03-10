// Feature Admin Routes
import type { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { createAgentAdminRoutes, createAgentAuthRoutes } from "./features/agent";
import { createAnalyticsAdminRoutes } from "./features/analytics";
import { createAuditLogAdminRoutes } from "./features/audit-log";
import { createAuthAdminRoutes, createAuthRoutes } from "./features/auth";
import { createBoardAdminRoutes, createBoardRoutes } from "./features/board";
import { createBookingAdminRoutes } from "./features/booking";
import { createCommunityAdminRoutes, createCommunityRoutes } from "./features/community";
import { createContentStudioAdminRoutes } from "./features/content-studio";
import { createCouponAdminRoutes } from "./features/coupon/routes";
import { createCourseAdminRoutes } from "./features/course";
import { createDataTrackerAdminRoutes } from "./features/data-tracker";
import { createFeatureCatalogAdminRoutes } from "./features/feature-catalog";
import { createEmailAdminRoutes } from "./features/email";
import { createFileManagerAdminRoutes } from "./features/file-manager";
import { createHelloWorldAdminRoutes, createHelloWorldRoutes } from "./features/hello-world";
import { createMarketingAdminRoutes, createMarketingRoutes } from "./features/marketing";
import {
  createPaymentAdminRoutes,
  createPaymentAuthRoutes,
  createPaymentRoutes,
} from "./features/payment/routes";
import { createProfileAuthRoutes } from "./features/profile";
import { createReviewAdminRoutes } from "./features/review";
import {
  createRolePermissionAdminRoutes,
  createRolePermissionAuthRoutes,
} from "./features/role-permission";
import { createScheduledJobAdminRoutes } from "./features/scheduled-job";
import { AdminLayout } from "./layouts";
import { AdminDashboard } from "./pages";

// ============================================================================
// Root Route
// ============================================================================

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </>
  ),
});

// ============================================================================
// Admin Routes
// ============================================================================

// Admin Layout (AdminGuard 포함)
const adminLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "admin-layout",
  component: AdminLayout,
});

// "/" - Admin Dashboard (index)
const adminIndexRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/",
  component: AdminDashboard,
});

// ============================================================================
// Route Tree 구성
// ============================================================================

const routeTree = rootRoute.addChildren([
  // Admin Login (public: /login) - AdminGuard 밖에 있어야 함
  ...createAuthAdminRoutes(rootRoute),

  // Admin Layout + Protected Routes (AdminGuard 적용)
  adminLayoutRoute.addChildren([
    adminIndexRoute,
    // Feature Admin Routes
    ...createBoardAdminRoutes(adminLayoutRoute),
    ...createCommunityAdminRoutes(adminLayoutRoute),
    ...createHelloWorldAdminRoutes(adminLayoutRoute),
    ...createFileManagerAdminRoutes(adminLayoutRoute),
    ...createReviewAdminRoutes(adminLayoutRoute),
    ...createPaymentAdminRoutes(adminLayoutRoute),
    ...createRolePermissionAdminRoutes(adminLayoutRoute),
    ...createEmailAdminRoutes(adminLayoutRoute),
    ...createAgentAdminRoutes(adminLayoutRoute),
    ...createMarketingAdminRoutes(adminLayoutRoute),
    ...createScheduledJobAdminRoutes(adminLayoutRoute),
    ...createAuditLogAdminRoutes(adminLayoutRoute),
    ...createAnalyticsAdminRoutes(adminLayoutRoute),
    ...createContentStudioAdminRoutes(adminLayoutRoute),
    ...createCourseAdminRoutes(adminLayoutRoute),
    ...createBookingAdminRoutes(adminLayoutRoute),
    ...createDataTrackerAdminRoutes(adminLayoutRoute),
    ...createCouponAdminRoutes(adminLayoutRoute),
    ...createFeatureCatalogAdminRoutes(adminLayoutRoute),
    // Profile Routes (auth required)
    ...createProfileAuthRoutes(adminLayoutRoute),
  ]),

  // Public/Auth Routes (타입 안전성을 위해 등록 — admin 앱에서 직접 사용하지 않음)
  ...createAuthRoutes(rootRoute),
  ...createBoardRoutes(rootRoute),
  ...createCommunityRoutes(rootRoute),
  ...createPaymentRoutes(rootRoute),
  ...createPaymentAuthRoutes(rootRoute),
  ...createAgentAuthRoutes(rootRoute),
  ...createMarketingRoutes(rootRoute),
  ...createRolePermissionAuthRoutes(rootRoute),
  ...createHelloWorldRoutes(rootRoute),
]);

// ============================================================================
// Router Export
// ============================================================================

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
