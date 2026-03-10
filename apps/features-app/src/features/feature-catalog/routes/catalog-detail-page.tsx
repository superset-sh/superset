import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { useParams } from "@tanstack/react-router";
import { CatalogDetailPage } from "../pages/catalog-detail";

function CatalogDetailPageWrapper() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  return <CatalogDetailPage slug={slug} />;
}

export const CatalogDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/features/$slug",
    component: CatalogDetailPageWrapper,
  });
