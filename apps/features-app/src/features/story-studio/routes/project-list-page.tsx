/**
 * Project List Page Route - /story-studio
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { ProjectList } from "../pages/project-list";

function ProjectListPage() {
  return (
    <div className="container mx-auto py-8">
      <ProjectList />
    </div>
  );
}

export const createProjectListRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio",
    component: ProjectListPage,
  });
