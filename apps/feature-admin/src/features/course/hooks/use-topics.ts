/**
 * Topic Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useTopics(includeInactive = true) {
  const trpc = useTRPC();
  return useQuery(trpc.course.topic.list.queryOptions({ includeInactive }));
}

export function useCreateTopic() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.topic.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.topic.list.queryKey() });
    },
  });
}

export function useUpdateTopic() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.topic.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.topic.list.queryKey() });
    },
  });
}

export function useDeleteTopic() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.topic.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.topic.list.queryKey() });
    },
  });
}

export function useReorderTopics() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.topic.reorder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.topic.list.queryKey() });
    },
  });
}
