/**
 * Feature Catalog Admin Routes
 */
import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { FeatureCatalogAdminPage } from "./routes/admin/feature-catalog-admin-page";

export const FEATURE_CATALOG_ADMIN_PATH = "/feature-catalog";

/**
 * Create admin routes for feature catalog management
 */
export function createFeatureCatalogAdminRoutes<T extends AnyRoute>(
  parentRoute: T,
) {
  return [
    createRoute({
      getParentRoute: () => parentRoute,
      path: "/feature-catalog",
      component: FeatureCatalogAdminPage,
    }),
  ];
}
