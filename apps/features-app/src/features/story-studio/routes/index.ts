/**
 * Story Studio Routes
 */
import type { AnyRoute } from "@tanstack/react-router";
import { createBeatsRoute } from "./beats-page";
import { createChapterDetailRoute } from "./chapter-detail-page";
import { createCharactersRoute } from "./characters-page";
import { createDialogueRoute } from "./dialogue-page";
import { createEndingsRoute } from "./endings-page";
import { createEventsRoute } from "./events-page";
import { createFlagsRoute } from "./flags-page";
import { createGraphRoute } from "./graph-page";
import { createPreviewRoute } from "./preview-page";
import { createProjectDashboardRoute } from "./project-dashboard-page";
import { createProjectListRoute } from "./project-list-page";

// ============================================================================
// Route Paths
// ============================================================================

export const STORY_STUDIO_PATH = "/story-studio";

// ============================================================================
// Route Groups
// ============================================================================

/** Story Studio의 모든 Auth Routes */
export function createStoryStudioRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createProjectListRoute(parentRoute),
    createProjectDashboardRoute(parentRoute),
    createChapterDetailRoute(parentRoute),
    createGraphRoute(parentRoute),
    createDialogueRoute(parentRoute),
    createFlagsRoute(parentRoute),
    createCharactersRoute(parentRoute),
    createPreviewRoute(parentRoute),
    // Phase 1
    createBeatsRoute(parentRoute),
    createEndingsRoute(parentRoute),
    createEventsRoute(parentRoute),
  ];
}
