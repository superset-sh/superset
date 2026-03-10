/**
 * Story Studio - Project tRPC Hooks
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useProjects() {
  const trpc = useTRPC();
  return useQuery(trpc.storyStudio.project.list.queryOptions());
}

export function useProject(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.project.byId.queryOptions({ id }),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.project.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.project.list.queryKey(),
        });
      },
    }),
  );
}

export function useUpdateProject() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.project.update.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.project.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.project.byId.queryKey({ id: variables.id }),
        });
      },
    }),
  );
}

export function useDeleteProject() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.project.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.project.list.queryKey(),
        });
      },
    }),
  );
}

export function useExportProject(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.project.export.queryOptions({ id }),
    enabled: false,
  });
}

export function useValidateProject(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.project.validate.queryOptions({ id }),
    enabled: false,
  });
}
