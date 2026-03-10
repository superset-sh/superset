/**
 * Attachment Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useAttachments(courseId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.attachment.list.queryOptions({ courseId }),
    enabled: !!courseId,
  });
}

export function useCreateAttachment() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.attachment.create.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.course.attachment.list.queryKey({ courseId: variables.courseId }),
      });
    },
  });
}

export function useDeleteAttachment() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.attachment.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.attachment.list.queryKey() });
    },
  });
}

export function useReorderAttachments() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.attachment.reorder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.attachment.list.queryKey() });
    },
  });
}
