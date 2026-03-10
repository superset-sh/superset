import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { CatalogListPage } from "../pages/catalog-list";
import { CatalogDetailRoute } from "./catalog-detail-page";

export const FEATURE_CATALOG_PATH = "/features";

export function createFeatureCatalogRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createRoute({
      getParentRoute: () => parentRoute,
      path: FEATURE_CATALOG_PATH,
      component: CatalogListPage,
    }),
    CatalogDetailRoute(parentRoute),
  ];
}
