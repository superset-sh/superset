// Feature Routes
import type { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { createAgentAuthRoutes } from "./features/agent";
import { createAgentDeskRoutes, createAgentDeskStandaloneRoutes } from "./features/agent-desk";
import { createAiImageRoutes } from "./features/ai-image";
import { createAuthRoutes } from "./features/auth";
import { createBoardRoutes } from "./features/board";
import {
  createBookingAuthRoutes,
  createBookingProviderRoutes,
  createBookingRoutes,
} from "./features/booking";
import { createCommunityRoutes } from "./features/community";
import { createContentStudioRoutes } from "./features/content-studio";
import { createCourseAuthRoutes, createCourseRoutes } from "./features/course";
import { createDataTrackerRoutes } from "./features/data-tracker";
import { createFeatureCatalogRoutes } from "./features/feature-catalog";
import { createFamilyAuthRoutes } from "./features/family";
import { createMarketingRoutes } from "./features/marketing";
import { createMobileRegistrationRoutes } from "./features/mobile-registration";
import { createPaymentAuthRoutes, createPaymentRoutes } from "./features/payment/routes";
import { createPlanAuthRoutes, createPlanRoutes } from "./features/plan";
import { createProfileAuthRoutes } from "./features/profile";
import { createRolePermissionAuthRoutes } from "./features/role-permission";
// TODO: blog feature has pre-existing broken imports (@radix-ui/react-icons, tRPC v10 patterns)
// import { blogRoutes } from "./features/blog/routes";
import { createStoryStudioRoutes } from "./features/story-studio";
import { createTaskRoutes } from "./features/task";
import { AppLayout } from "./layouts";
// App Pages & Layouts
import { UserHome } from "./pages";
import { ComponentGallery } from "./pages/gallery/component-gallery";

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
// App Routes
// ============================================================================

// App Layout (AuthGuard 포함 - 인증된 유저용 Shell)
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app-layout",
  component: AppLayout,
});

// "/" - 인증된 유저 대시보드
const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: UserHome,
});

// "/gallery" - Component Gallery
const galleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gallery",
  component: ComponentGallery,
});

// ============================================================================
// Route Tree 구성
// ============================================================================

const routeTree = rootRoute.addChildren([
  // App Layout + Protected Routes (AuthGuard 적용)
  appLayoutRoute.addChildren([
    indexRoute,
    ...createAgentAuthRoutes(appLayoutRoute),
    ...createMarketingRoutes(appLayoutRoute),
    ...createProfileAuthRoutes(appLayoutRoute),
    ...createContentStudioRoutes(appLayoutRoute),
    ...createPlanAuthRoutes(appLayoutRoute),
    ...createCourseAuthRoutes(appLayoutRoute),
    ...createBookingAuthRoutes(appLayoutRoute),
    ...createBookingProviderRoutes(appLayoutRoute),
    ...createDataTrackerRoutes(appLayoutRoute),
    ...createAgentDeskRoutes(appLayoutRoute),
    ...createFamilyAuthRoutes(appLayoutRoute),
    ...createAiImageRoutes(appLayoutRoute),
    ...createTaskRoutes(appLayoutRoute),
    ...createStoryStudioRoutes(appLayoutRoute),
    ...createFeatureCatalogRoutes(appLayoutRoute),
  ]),

  // Agent Desk — AppShellAgent 탭 밖에서 독립 렌더링하는 라우트 (Designer 등)
  ...createAgentDeskStandaloneRoutes(rootRoute),

  // Public Routes
  galleryRoute,

  // Auth Feature Routes (public: /sign-in, /sign-up)
  ...createAuthRoutes(rootRoute),

  // Board Feature Routes (public: /board, /board/$slug, etc.)
  ...createBoardRoutes(rootRoute),

  // Community Feature Routes (public: /communities, /c/:slug, /home, etc.)
  ...createCommunityRoutes(rootRoute),

  // Payment Feature Routes (public: /payment/products, auth: /payment/subscription)
  ...createPaymentRoutes(rootRoute),
  ...createPaymentAuthRoutes(rootRoute),

  // Plan Feature Routes (public: /pricing)
  ...createPlanRoutes(rootRoute),

  // Course Feature Routes (public: /course, /course/$slug)
  ...createCourseRoutes(rootRoute),

  // Booking Feature Routes (public: /booking, /booking/provider/$providerId)
  ...createBookingRoutes(rootRoute),

  // Role Permission Feature Routes (auth: /my-permissions)
  ...createRolePermissionAuthRoutes(rootRoute),

  // Mobile Registration Feature Routes (process example: /register)
  ...createMobileRegistrationRoutes(rootRoute),

  // Blog Feature Routes (disabled — pre-existing broken imports)
  // ...blogRoutes,
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
