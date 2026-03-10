import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/**
 * 구독자 목록 조회 (Admin)
 */
export function useSubscribers(input: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  planName?: string;
}) {
  const trpc = useTRPC();
  return useQuery(trpc.payment.admin.getSubscribers.queryOptions(input));
}
