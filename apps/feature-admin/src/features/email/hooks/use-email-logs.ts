import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';
import type { EmailLogsFilters } from '../types';

/**
 * 이메일 로그 목록 조회 Hook
 */
export function useEmailLogs(filters: EmailLogsFilters = {}) {
  const trpc = useTRPC();
  const { page = 1, limit = 20, status, templateType, search } = filters;

  return useQuery({
    ...trpc.email.getLogs.queryOptions({
      page,
      limit,
      status,
      templateType,
      search,
    }),
  });
}
