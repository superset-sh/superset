/**
 * Flags Page Route - /story-studio/$id/flags
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { FlagList } from "../pages/flag-list";

function FlagsPage() {
  return (
    <div className="container mx-auto py-8">
      <FlagList />
    </div>
  );
}

export const createFlagsRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id/flags",
    component: FlagsPage,
  });
