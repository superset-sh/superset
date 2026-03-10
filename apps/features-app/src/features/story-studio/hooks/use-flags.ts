/**
 * Story Studio - Flag tRPC Hooks
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useFlags(projectId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.flag.byProject.queryOptions({ projectId }),
    enabled: !!projectId,
  });
}

export function useCreateFlag(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.flag.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.flag.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}

export function useUpdateFlag(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.flag.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.flag.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}

export function useDeleteFlag(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.flag.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.flag.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}
