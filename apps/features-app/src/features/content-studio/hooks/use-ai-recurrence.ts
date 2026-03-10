import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useAiRecurrences(studioId: string) {
  const trpc = useTRPC();

  const { data, isLoading } = useQuery(
    trpc.contentStudio.ai.recurrence.list.queryOptions(
      { studioId },
      { enabled: !!studioId },
    )
  );

  return { data: data ?? [], isLoading };
}

export function useAiRecurrenceMutations(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const recurrenceKey = trpc.contentStudio.ai.recurrence.list.queryKey({ studioId });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: recurrenceKey });

  const create = useMutation(
    trpc.contentStudio.ai.recurrence.create.mutationOptions({ onSuccess: invalidate })
  );

  const update = useMutation(
    trpc.contentStudio.ai.recurrence.update.mutationOptions({ onSuccess: invalidate })
  );

  const remove = useMutation(
    trpc.contentStudio.ai.recurrence.delete.mutationOptions({ onSuccess: invalidate })
  );

  const toggle = useMutation(
    trpc.contentStudio.ai.recurrence.toggle.mutationOptions({ onSuccess: invalidate })
  );

  return { create, update, remove, toggle };
}
