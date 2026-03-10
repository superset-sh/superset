/**
 * Story Studio - Chapter tRPC Hooks
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useChapters(projectId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.chapter.byProject.queryOptions({ projectId }),
    enabled: !!projectId,
  });
}

export function useChapter(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.chapter.byId.queryOptions({ id }),
    enabled: !!id,
  });
}

export function useCreateChapter() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.chapter.create.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.chapter.byProject.queryKey({
            projectId: variables.projectId,
          }),
        });
      },
    }),
  );
}

export function useUpdateChapter() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.chapter.update.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.chapter.byId.queryKey({ id: variables.id }),
        });
      },
    }),
  );
}

export function useReorderChapters() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.chapter.reorder.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.chapter.byProject.queryKey({
            projectId: variables.projectId,
          }),
        });
      },
    }),
  );
}

export function useDeleteChapter(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.chapter.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.chapter.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}
