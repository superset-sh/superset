import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { AiImagePage } from "../pages/ai-image-page";

export const AI_IMAGE_PATH = "/ai-image";

export function createAiImageRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createRoute({
      getParentRoute: () => parentRoute,
      path: "/ai-image",
      component: AiImagePage,
    }),
  ];
}
