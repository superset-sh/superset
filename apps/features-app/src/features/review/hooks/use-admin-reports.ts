/**
 * Admin Report Hooks
 */
import { useTRPC } from "@superbuilder/features-client/trpc-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReportStatus } from "../types";

/**
 * Get reports, optionally filtered by status
 */
export function useAdminReports(status?: ReportStatus) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.review.adminGetReports.queryOptions({ status }),
  });
}

/**
 * Resolve a report
 */
export function useAdminResolveReport() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.review.adminResolveReport.mutationOptions(),
    onSuccess: () => {
      // Invalidate reports queries
      queryClient.invalidateQueries({
        queryKey: [["review", "adminGetReports"]],
      });
    },
  });
}
