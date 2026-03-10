/**
 * Characters Page Route - /story-studio/$id/characters
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { CharacterList } from "../pages/character-list";

function CharactersPage() {
  return (
    <div className="container mx-auto py-8">
      <CharacterList />
    </div>
  );
}

export const createCharactersRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/story-studio/$id/characters",
    component: CharactersPage,
  });
