/**
 * Project Dashboard Page Route - /story-studio/$id
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { ProjectDashboard } from "../pages/project-dashboard";

function ProjectDashboardPage() {
  return (
    <div className="container mx-auto py-8">
      <ProjectDashboard />
    </div>
  );
}

export const createProjectDashboardRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id",
    component: ProjectDashboardPage,
  });
