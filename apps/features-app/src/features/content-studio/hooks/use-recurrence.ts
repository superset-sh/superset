import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useRecurrences(studioId: string) {
  const trpc = useTRPC();

  const { data, isLoading } = useQuery(
    trpc.contentStudio.recurrenceList.queryOptions(
      { studioId },
      { enabled: !!studioId },
    )
  );

  return { data: data ?? [], isLoading };
}

export function useRecurrenceMutations(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const recurrenceKey = trpc.contentStudio.recurrenceList.queryKey({ studioId });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: recurrenceKey });

  const create = useMutation(
    trpc.contentStudio.createRecurrence.mutationOptions({ onSuccess: invalidate })
  );

  const update = useMutation(
    trpc.contentStudio.updateRecurrence.mutationOptions({ onSuccess: invalidate })
  );

  const remove = useMutation(
    trpc.contentStudio.deleteRecurrence.mutationOptions({ onSuccess: invalidate })
  );

  const toggle = useMutation(
    trpc.contentStudio.toggleRecurrence.mutationOptions({ onSuccess: invalidate })
  );

  const execute = useMutation(
    trpc.contentStudio.executeRecurrence.mutationOptions({ onSuccess: invalidate })
  );

  return { create, update, remove, toggle, execute };
}
