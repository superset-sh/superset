import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';

/**
 * 이메일 로그 상세 조회 Hook
 */
export function useEmailLog(logId: string | undefined) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.email.getLog.queryOptions({ logId: logId || '' }),
    enabled: !!logId,
  });
}
