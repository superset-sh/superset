import { createRoute, useParams, Outlet, type AnyRoute } from "@tanstack/react-router";
import { StudioListPage } from "../pages/studio-list-page";
import { CalendarPage } from "../pages/calendar-page";
import { CanvasPage } from "../pages/canvas-page";
import { EditorPage } from "../pages/editor-page";
import { BrandVoicePage } from "../pages/brand-voice-page";
import { LayoutGroup } from "motion/react";

export const CONTENT_STUDIO_PATH = "/content-studio";
export const CONTENT_STUDIO_CALENDAR_PATH = "/content-studio/calendar";

export const createStudioListRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/content-studio",
    component: StudioListPage,
  });

// 캘린더 라우트
export const createCalendarRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/content-studio/calendar",
    component: CalendarPage,
  });

// 브랜드 보이스 라우트
export const createBrandVoiceRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/content-studio/$studioId/brand-voice",
    component: BrandVoiceRouteComponent,
  });

export function createContentStudioRoutes<T extends AnyRoute>(parentRoute: T) {
  // To make shared layout animations work, Canvas needs to stay mounted when Editor is active.
  // Here we modify the structure so Canvas is the parent, and Editor is its child
  const canvasRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: "/content-studio/$studioId",
    component: CanvasLayoutComponent,
  });

  const canvasIndexRoute = createRoute({
    getParentRoute: () => canvasRoute,
    path: "/",
    component: () => null, // Just renders the layout
  });

  const editorRoute = createRoute({
    getParentRoute: () => canvasRoute,
    path: "/$contentId/edit",
    component: EditorRouteComponent,
  });

  canvasRoute.addChildren([canvasIndexRoute, editorRoute]);

  return [
    createStudioListRoute(parentRoute),
    createCalendarRoute(parentRoute),
    createBrandVoiceRoute(parentRoute),
    canvasRoute,
  ];
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

// This layout component keeps CanvasPage mounted while EditorPage is open
function CanvasLayoutComponent() {
  const { studioId } = useParams({ strict: false }) as { studioId: string };
  return (
    <LayoutGroup id={`studio-${studioId}`}>
      {/* 
        CanvasPage is always rendered. It will show the nodes.
        When a child route (Editor) is active, Outlet will render the Editor overlay ON TOP of CanvasPage.
      */}
      <CanvasPage studioId={studioId} />
      <Outlet />
    </LayoutGroup>
  );
}

function BrandVoiceRouteComponent() {
  const { studioId } = useParams({ strict: false }) as { studioId: string };
  return <BrandVoicePage studioId={studioId} />;
}

function EditorRouteComponent() {
  const { studioId, contentId } = useParams({ strict: false }) as {
    studioId: string;
    contentId: string;
  };
  return <EditorPage studioId={studioId} contentId={contentId} />;
}
