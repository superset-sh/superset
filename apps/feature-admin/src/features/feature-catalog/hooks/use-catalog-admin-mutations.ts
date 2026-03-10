/**
 * Feature Catalog Admin Mutation Hooks
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

/**
 * Create a new catalog feature
 */
export function useCreateCatalogFeature() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.featureCatalog.adminCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.featureCatalog.adminList.queryKey(),
      });
    },
  });
}

/**
 * Update a catalog feature
 */
export function useUpdateCatalogFeature() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.featureCatalog.adminUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.featureCatalog.adminList.queryKey(),
      });
    },
  });
}

/**
 * Toggle publish status of a catalog feature
 * Uses adminUpdate with isPublished field
 */
export function useToggleCatalogPublish() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.featureCatalog.adminUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.featureCatalog.adminList.queryKey(),
      });
    },
  });
}
