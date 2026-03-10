import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useCatalogFeatures(input?: {
  group?: string;
  search?: string;
  tags?: string[];
}) {
  const trpc = useTRPC();
  return useQuery(trpc.featureCatalog.list.queryOptions(input));
}

export function useCatalogFeatureBySlug(slug: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.featureCatalog.getBySlug.queryOptions(slug, {
      enabled: !!slug,
    }),
  );
}

export function useDependencyGraph(slugs: string[]) {
  const trpc = useTRPC();
  return useQuery(
    trpc.featureCatalog.getDependencyGraph.queryOptions(slugs, {
      enabled: slugs.length > 0,
    }),
  );
}

export function useValidateSelection(slugs: string[]) {
  const trpc = useTRPC();
  return useQuery(
    trpc.featureCatalog.validateSelection.queryOptions(slugs, {
      enabled: slugs.length > 0,
    }),
  );
}
