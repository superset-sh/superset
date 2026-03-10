/**
 * Story Studio - Dialogue tRPC Hooks
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useDialoguesByNode(branchNodeId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.dialogue.byNode.queryOptions({ branchNodeId }),
    enabled: !!branchNodeId,
  });
}

export function useCreateDialogue(branchNodeId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.dialogue.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.dialogue.byNode.queryKey({ branchNodeId }),
        });
      },
    }),
  );
}

export function useUpdateDialogue(branchNodeId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.dialogue.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.dialogue.byNode.queryKey({ branchNodeId }),
        });
      },
    }),
  );
}

export function useReorderDialogues(branchNodeId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.dialogue.reorder.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.dialogue.byNode.queryKey({ branchNodeId }),
        });
      },
    }),
  );
}

export function useDeleteDialogue(branchNodeId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.dialogue.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.dialogue.byNode.queryKey({ branchNodeId }),
        });
      },
    }),
  );
}

export function useBulkCreateDialogues(branchNodeId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.dialogue.bulkCreate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.dialogue.byNode.queryKey({ branchNodeId }),
        });
      },
    }),
  );
}
