import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { ContentStudioAdminPage } from "./pages/content-studio-admin-page";

export const CONTENT_STUDIO_ADMIN_PATH = "/content-studio";

export function createContentStudioAdminRoutes(parentRoute: AnyRoute) {
  const contentStudioRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: "/content-studio",
    component: ContentStudioAdminPage,
  });

  return [contentStudioRoute];
}
