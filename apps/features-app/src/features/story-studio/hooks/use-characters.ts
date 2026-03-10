/**
 * Story Studio - Character tRPC Hooks
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useCharacters(projectId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.character.byProject.queryOptions({ projectId }),
    enabled: !!projectId,
  });
}

export function useCharacter(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.character.byId.queryOptions({ id }),
    enabled: !!id,
  });
}

export function useCreateCharacter(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.character.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.character.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}

export function useUpdateCharacter(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.character.update.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.character.byId.queryKey({
            id: variables.id,
          }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.character.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}

export function useDeleteCharacter(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.character.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.character.byProject.queryKey({ projectId }),
        });
      },
    }),
  );
}
