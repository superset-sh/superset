import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/** 감사 로그 목록 조회 (필터 + 페이지네이션) */
export function useAuditLogs(filters: {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const trpc = useTRPC();
  return useQuery(
    trpc.auditLog.listLogs.queryOptions({
      page: filters.page ?? 1,
      limit: filters.limit ?? 20,
      userId: filters.userId || undefined,
      action: filters.action || undefined,
      resourceType: filters.resourceType || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    }),
  );
}

/** 감사 로그 상세 조회 */
export function useAuditLog(id: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.auditLog.getLog.queryOptions({ id: id! }),
    enabled: !!id,
  });
}
