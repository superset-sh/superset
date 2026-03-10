/**
 * Chapter Detail Page Route - /story-studio/$id/chapters/$chId
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { ChapterDetail } from "../pages/chapter-detail";

function ChapterDetailPage() {
  return (
    <div className="container mx-auto py-8">
      <ChapterDetail />
    </div>
  );
}

export const createChapterDetailRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id/chapters/$chId",
    component: ChapterDetailPage,
  });
