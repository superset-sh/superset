/**
 * Graph Page Route - /story-studio/$id/chapters/$chId/graph
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { GraphCanvas } from "../pages/graph-canvas";

export const createGraphRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id/chapters/$chId/graph",
    component: GraphCanvas,
  });
