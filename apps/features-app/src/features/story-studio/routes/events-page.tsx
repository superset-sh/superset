/**
 * Events Page Route - /story-studio/$id/events
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { EventList } from "../pages/event-list";

function EventsPage() {
  return (
    <div className="container mx-auto py-8">
      <EventList />
    </div>
  );
}

export const createEventsRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id/events",
    component: EventsPage,
  });
