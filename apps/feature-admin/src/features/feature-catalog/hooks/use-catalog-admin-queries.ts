/**
 * Feature Catalog Admin Query Hooks
 */
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

/**
 * Get all catalog features (including unpublished) for admin
 */
export function useAdminCatalogFeatures() {
  const trpc = useTRPC();

  return useQuery(trpc.featureCatalog.adminList.queryOptions());
}
