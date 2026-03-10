/**
 * Curriculum Hooks (Sections + Lessons)
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================================
// Sections
// ============================================================================

export function useSections(courseId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.section.list.queryOptions({ courseId }),
    enabled: !!courseId,
  });
}

export function useCreateSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.section.create.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.course.section.list.queryKey({ courseId: variables.courseId }),
      });
    },
  });
}

export function useUpdateSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.section.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.section.list.queryKey() });
    },
  });
}

export function useDeleteSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.section.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.section.list.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.course.adminList.queryKey() });
    },
  });
}

export function useReorderSections() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.section.reorder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.section.list.queryKey() });
    },
  });
}

// ============================================================================
// Lessons
// ============================================================================

export function useCreateLesson() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.lesson.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.section.list.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.course.adminList.queryKey() });
    },
  });
}

export function useUpdateLesson() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.lesson.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.section.list.queryKey() });
    },
  });
}

export function useDeleteLesson() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.lesson.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.section.list.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.course.adminList.queryKey() });
    },
  });
}

export function useSetLessonVideo() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.lesson.setVideo.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.section.list.queryKey() });
    },
  });
}

export function useRemoveLessonVideo() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.lesson.removeVideo.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.section.list.queryKey() });
    },
  });
}

export function useReorderLessons() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.lesson.reorder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.course.section.list.queryKey() });
    },
  });
}
