/**
 * Enrollment Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery } from "@tanstack/react-query";

interface StudentListInput {
  courseId: string;
  page?: number;
  limit?: number;
}

export function useStudentList({ courseId, page = 1, limit = 20 }: StudentListInput) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.course.enrollment.adminList.queryOptions({ courseId, page, limit }),
    enabled: !!courseId,
  });
}
