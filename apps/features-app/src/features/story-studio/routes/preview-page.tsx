/**
 * Preview Page Route - /story-studio/$id/preview
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { StoryPreview } from "../pages/story-preview";

export const createPreviewRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id/preview",
    component: StoryPreview,
  });
