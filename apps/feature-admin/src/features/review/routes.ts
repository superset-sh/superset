/**
 * Review Feature Routes
 */
import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { ReviewAdminPage } from "./routes/admin/review-admin-page";

export const REVIEW_ADMIN_PATH = "/review";

/**
 * Create admin routes for review management
 */
export function createReviewAdminRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createRoute({
      getParentRoute: () => parentRoute,
      path: "/review",
      component: ReviewAdminPage,
    }),
  ];
}
