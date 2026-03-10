/**
 * Family Group & Member Mutations
 */
import { useTRPC } from "../../../lib/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreateGroup() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.createGroup.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.family.getMyGroups.queryKey() });
    },
  });
}

export function useUpdateGroup() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.updateGroup.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: trpc.family.getMyGroups.queryKey() });
      queryClient.invalidateQueries({
        queryKey: trpc.family.getGroup.queryKey({ groupId: variables.groupId }),
      });
    },
  });
}

export function useDeleteGroup() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.deleteGroup.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.family.getMyGroups.queryKey() });
    },
  });
}

export function useInviteMember() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.inviteMember.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.family.getGroup.queryKey({ groupId: variables.groupId }),
      });
    },
  });
}

export function useAcceptInvitation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.acceptInvitation.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.family.getMyGroups.queryKey() });
    },
  });
}

export function useRejectInvitation() {
  const trpc = useTRPC();

  return useMutation({
    ...trpc.family.rejectInvitation.mutationOptions(),
  });
}

export function useUpdateMemberRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.updateMemberRole.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.family.getGroup.queryKey({ groupId: variables.groupId }),
      });
    },
  });
}

export function useRemoveMember() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.removeMember.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.family.getGroup.queryKey({ groupId: variables.groupId }),
      });
    },
  });
}

export function useLeaveGroup() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.family.leaveGroup.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.family.getMyGroups.queryKey() });
    },
  });
}
