/**
 * Beats Page Route - /story-studio/$id/beats
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { BeatBoard } from "../pages/beat-board";

function BeatsPage() {
  return (
    <div className="container mx-auto py-8">
      <BeatBoard />
    </div>
  );
}

export const createBeatsRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id/beats",
    component: BeatsPage,
  });
