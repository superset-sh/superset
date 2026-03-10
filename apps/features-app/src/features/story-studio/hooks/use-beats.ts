/**
 * Story Studio - Beat & BeatTemplate tRPC Hooks
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

// ============================================================================
// Beat Queries
// ============================================================================

export function useBeatsByChapter(chapterId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.beat.byChapter.queryOptions({ chapterId }),
    enabled: !!chapterId,
  });
}

export function useBeatsByProject(projectId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.beat.byProject.queryOptions({ projectId }),
    enabled: !!projectId,
  });
}

export function useBeat(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.beat.byId.queryOptions({ id }),
    enabled: !!id,
  });
}

// ============================================================================
// Beat Mutations
// ============================================================================

export function useCreateBeat(projectId: string, chapterId?: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.beat.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.beat.byProject.queryKey({ projectId }),
        });
        if (chapterId) {
          queryClient.invalidateQueries({
            queryKey: trpc.storyStudio.beat.byChapter.queryKey({ chapterId }),
          });
        }
      },
    }),
  );
}

export function useUpdateBeat(projectId: string, chapterId?: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.beat.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.beat.byProject.queryKey({ projectId }),
        });
        if (chapterId) {
          queryClient.invalidateQueries({
            queryKey: trpc.storyStudio.beat.byChapter.queryKey({ chapterId }),
          });
        }
      },
    }),
  );
}

export function useReorderBeats(projectId: string, chapterId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.beat.reorder.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.beat.byChapter.queryKey({ chapterId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.beat.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}

export function useDeleteBeat(projectId: string, chapterId?: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.beat.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.beat.byProject.queryKey({ projectId }),
        });
        if (chapterId) {
          queryClient.invalidateQueries({
            queryKey: trpc.storyStudio.beat.byChapter.queryKey({ chapterId }),
          });
        }
      },
    }),
  );
}

// ============================================================================
// Beat Template Queries
// ============================================================================

export function useBeatTemplates() {
  const trpc = useTRPC();
  return useQuery(trpc.storyStudio.beat.templates.queryOptions());
}

export function useBeatTemplate(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.beat.templateById.queryOptions({ id }),
    enabled: !!id,
  });
}

// ============================================================================
// Beat Template Mutations
// ============================================================================

export function useCreateBeatTemplate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.beat.createTemplate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.beat.templates.queryKey(),
        });
      },
    }),
  );
}

export function useUpdateBeatTemplate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.beat.updateTemplate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.beat.templates.queryKey(),
        });
      },
    }),
  );
}

export function useDeleteBeatTemplate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.beat.deleteTemplate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.beat.templates.queryKey(),
        });
      },
    }),
  );
}
