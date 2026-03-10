import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/**
 * 활성 플랜 목록 조회
 */
export function usePlans() {
  const trpc = useTRPC();
  return useQuery(trpc.payment.getPlans.queryOptions());
}
