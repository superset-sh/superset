/**
 * Data Tracker Admin Hooks
 *
 * Admin 전용 tRPC hooks (트래커 CRUD, 활성 토글)
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================================
// Queries
// ============================================================================

export function useDataTrackerAdminList() {
  const trpc = useTRPC();
  return useQuery(trpc.dataTracker.adminList.queryOptions());
}

export function useDataTrackerAdminGetById(id: string) {
  const trpc = useTRPC();
  return useQuery(trpc.dataTracker.adminGetById.queryOptions({ id }));
}

// ============================================================================
// Mutations
// ============================================================================

export function useDataTrackerAdminCreate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.dataTracker.adminCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dataTracker.adminList.queryKey(),
      });
    },
  });
}

export function useDataTrackerAdminUpdate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.dataTracker.adminUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dataTracker.adminList.queryKey(),
      });
    },
  });
}

export function useDataTrackerAdminDelete() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.dataTracker.adminDelete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dataTracker.adminList.queryKey(),
      });
    },
  });
}

export function useDataTrackerAdminToggleActive() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.dataTracker.adminToggleActive.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dataTracker.adminList.queryKey(),
      });
    },
  });
}
