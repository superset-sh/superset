/**
 * Endings Page Route - /story-studio/$id/endings
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { EndingList } from "../pages/ending-list";

function EndingsPage() {
  return (
    <div className="container mx-auto py-8">
      <EndingList />
    </div>
  );
}

export const createEndingsRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id/endings",
    component: EndingsPage,
  });
