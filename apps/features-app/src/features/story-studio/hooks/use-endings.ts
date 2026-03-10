/**
 * Story Studio - Ending tRPC Hooks
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useEndings(projectId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.ending.byProject.queryOptions({ projectId }),
    enabled: !!projectId,
  });
}

export function useEnding(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.ending.byId.queryOptions({ id }),
    enabled: !!id,
  });
}

export function useCreateEnding(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.ending.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.ending.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}

export function useUpdateEnding(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.ending.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.ending.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}

export function useDeleteEnding(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.ending.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.ending.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}
