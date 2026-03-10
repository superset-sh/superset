/**
 * Dialogue Page Route - /story-studio/$id/chapters/$chId/dialogue/$nodeId
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { DialogueEditor } from "../pages/dialogue-editor";

function DialoguePage() {
  return (
    <div className="container mx-auto py-8">
      <DialogueEditor />
    </div>
  );
}

export const createDialogueRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id/chapters/$chId/dialogue/$nodeId",
    component: DialoguePage,
  });
