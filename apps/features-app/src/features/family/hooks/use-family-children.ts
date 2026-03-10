/**
 * Family Children Queries & Mutations
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

// ============================================================================
// Queries
// ============================================================================

export function useFamilyChildren(groupId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.family.getChildren.queryOptions({ groupId }),
    enabled: !!groupId,
  });
}

export function useFamilyChild(childId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.family.getChild.queryOptions({ childId }),
    enabled: !!childId,
  });
}

export function useChildAssignments(childId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.family.getChildAssignments.queryOptions({ childId }),
    enabled: !!childId,
  });
}

// ============================================================================
// Mutations
// ============================================================================

export function useCreateChild() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.createChild.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.family.getChildren.queryKey({ groupId: variables.groupId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.family.getGroup.queryKey({ groupId: variables.groupId }),
      });
    },
  });
}

export function useUpdateChild() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.updateChild.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.family.getChild.queryKey({ childId: variables.childId }),
      });
    },
  });
}

export function useDeactivateChild() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.deactivateChild.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.family.getChild.queryKey({ childId: variables.childId }),
      });
      queryClient.invalidateQueries({ queryKey: trpc.family.getMyGroups.queryKey() });
    },
  });
}

export function useReactivateChild() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.reactivateChild.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.family.getChild.queryKey({ childId: variables.childId }),
      });
      queryClient.invalidateQueries({ queryKey: trpc.family.getMyGroups.queryKey() });
    },
  });
}

export function useAssignTherapist() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.assignTherapist.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.family.getChildAssignments.queryKey({ childId: variables.childId }),
      });
    },
  });
}

export function useUnassignTherapist() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.unassignTherapist.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.family.getChildAssignments.queryKey({ childId: variables.childId }),
      });
    },
  });
}
