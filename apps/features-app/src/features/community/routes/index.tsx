/**
 * Community Feature Routes
 */
import { createRoute } from "@tanstack/react-router";
import { CommunityListPage } from "./community-list-page";
import { CommunityHomePage } from "./community-home-page";
import { PostDetailPage } from "./post-detail-page";
import { PostSubmitPage } from "./post-submit-page";
import { CreateCommunityPage } from "./create-community-page";
import { HomeFeedPage } from "./home-feed-page";
import { ModDashboardPage } from "./mod-dashboard-page";
import { ModQueuePage } from "./mod-queue-page";
import { ModReportsPage } from "./mod-reports-page";
import { ModLogsPage } from "./mod-logs-page";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCommunityRoutes(rootRoute: any) {
  const communityListRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/communities",
    component: CommunityListPage,
  });

  const createCommunityRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/communities/create",
    component: CreateCommunityPage,
  });

  const homeFeedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/home",
    component: HomeFeedPage,
  });

  const communityHomeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/c/$slug",
    component: CommunityHomePage,
  });

  const postDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/c/$slug/post/$postId",
    component: PostDetailPage,
  });

  const postSubmitRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/c/$slug/submit",
    component: PostSubmitPage,
  });

  // Moderator routes
  const modDashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/c/$slug/mod",
    component: ModDashboardPage,
  });

  const modQueueRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/c/$slug/mod/queue",
    component: ModQueuePage,
  });

  const modReportsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/c/$slug/mod/reports",
    component: ModReportsPage,
  });

  const modLogsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/c/$slug/mod/logs",
    component: ModLogsPage,
  });

  return [
    communityListRoute,
    createCommunityRoute,
    homeFeedRoute,
    communityHomeRoute,
    postDetailRoute,
    postSubmitRoute,
    modDashboardRoute,
    modQueueRoute,
    modReportsRoute,
    modLogsRoute,
  ];
}
