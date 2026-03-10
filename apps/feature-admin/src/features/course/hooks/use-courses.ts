/**
 * Course Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface AdminListInput {
  page?: number;
  limit?: number;
  status?: "draft" | "published";
  topicId?: string;
  search?: string;
}

export function useAdminCourseList(input: AdminListInput = {}) {
  const trpc = useTRPC();
  return useQuery(trpc.course.adminList.queryOptions(input));
}

export function useAdminCourseById(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.adminById.queryOptions({ id }),
    enabled: !!id,
  });
}

export function useCreateCourse() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.adminList.queryKey() });
    },
  });
}

export function useUpdateCourse() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.update.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: trpc.course.adminList.queryKey() });
      queryClient.invalidateQueries({
        queryKey: trpc.course.adminById.queryKey({ id: variables.id }),
      });
    },
  });
}

export function useDeleteCourse() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.adminList.queryKey() });
    },
  });
}

export function usePublishCourse() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.publish.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: trpc.course.adminList.queryKey() });
      queryClient.invalidateQueries({
        queryKey: trpc.course.adminById.queryKey({ id: variables.id }),
      });
    },
  });
}

export function useUnpublishCourse() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.unpublish.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: trpc.course.adminList.queryKey() });
      queryClient.invalidateQueries({
        queryKey: trpc.course.adminById.queryKey({ id: variables.id }),
      });
    },
  });
}
