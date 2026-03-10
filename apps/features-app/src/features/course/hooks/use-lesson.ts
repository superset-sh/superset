/**
 * Lesson Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery } from "@tanstack/react-query";

export function useLessonWithVideo(lessonId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.lesson.withVideo.queryOptions({ id: lessonId }),
    enabled: !!lessonId,
  });
}
