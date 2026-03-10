/**
 * Story Studio - Event tRPC Hooks
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useEvents(projectId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.event.byProject.queryOptions({ projectId }),
    enabled: !!projectId,
  });
}

export function useEvent(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.event.byId.queryOptions({ id }),
    enabled: !!id,
  });
}

export function useCreateEvent(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.event.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.event.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}

export function useUpdateEvent(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.event.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.event.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}

export function useDeleteEvent(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.event.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.event.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}
