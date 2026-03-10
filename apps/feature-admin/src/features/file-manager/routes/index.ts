/**
 * File Manager Routes
 */
import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { FileManagerPage } from "../pages/file-manager-page";

export const FILE_MANAGER_ADMIN_PATH = "/files";

export function createFileManagerAdminRoutes<T extends AnyRoute>(parentRoute: T) {
  const fileManagerRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: "/files",
    component: FileManagerPage,
  });

  return [fileManagerRoute];
}
