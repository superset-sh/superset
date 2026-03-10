/**
 * Course Public Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery } from "@tanstack/react-query";

interface CourseListInput {
  page?: number;
  limit?: number;
  topicId?: string;
  sort?: "latest" | "order";
}

export function useCourseList(input: CourseListInput = {}) {
  const trpc = useTRPC();
  return useQuery(trpc.course.list.queryOptions(input));
}

export function useCourseBySlug(slug: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.bySlug.queryOptions({ slug }),
    enabled: !!slug,
  });
}

export function useCourseCurriculum(courseId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.section.list.queryOptions({ courseId }),
    enabled: !!courseId,
  });
}

export function useTopicList() {
  const trpc = useTRPC();
  return useQuery(trpc.course.topic.list.queryOptions({ includeInactive: false }));
}

export function useCourseAttachments(courseId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.attachment.list.queryOptions({ courseId }),
    enabled: !!courseId,
  });
}
