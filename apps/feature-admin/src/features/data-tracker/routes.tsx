import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { DataTrackerAdminPage, DataTrackerFormPage } from "./pages";

export const DATA_TRACKER_ADMIN_PATH = "/data-tracker";

export function createDataTrackerAdminRoutes(parentRoute: AnyRoute) {
  const listRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: "/data-tracker",
    component: DataTrackerAdminPage,
  });

  const createRoute_ = createRoute({
    getParentRoute: () => parentRoute,
    path: "/data-tracker/new",
    component: DataTrackerFormPage,
  });

  const editRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: "/data-tracker/$trackerId/edit",
    component: DataTrackerFormPage,
  });

  return [listRoute, createRoute_, editRoute];
}
