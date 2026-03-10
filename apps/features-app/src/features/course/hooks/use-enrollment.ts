/**
 * Enrollment Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useIsEnrolled(courseId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.enrollment.isEnrolled.queryOptions({ courseId }),
    enabled: !!courseId,
  });
}

export function useMyCourses() {
  const trpc = useTRPC();
  return useQuery(trpc.course.enrollment.myCourses.queryOptions());
}

export function useCourseProgress(courseId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.enrollment.courseProgress.queryOptions({ courseId }),
    enabled: !!courseId,
  });
}

export function useEnroll() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.enrollment.enroll.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.course.enrollment.isEnrolled.queryKey({ courseId: variables.courseId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.course.enrollment.myCourses.queryKey(),
      });
    },
  });
}

export function useCancelEnrollment() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.enrollment.cancel.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.course.enrollment.isEnrolled.queryKey({ courseId: variables.courseId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.course.enrollment.myCourses.queryKey(),
      });
    },
  });
}

export function useToggleLessonComplete() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.enrollment.toggleLessonComplete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.course.enrollment.courseProgress.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.course.enrollment.myCourses.queryKey(),
      });
    },
  });
}

export function useUpdateProgress() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.course.enrollment.updateProgress.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.course.enrollment.courseProgress.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.course.enrollment.myCourses.queryKey(),
      });
    },
  });
}
