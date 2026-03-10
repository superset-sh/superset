import { useQuery, useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/**
 * 특정 사용자 크레딧 잔액 조회 (Admin)
 */
export function useUserCredits(userId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.payment.admin.getUserCredits.queryOptions({ userId }),
    enabled: !!userId,
  });
}

/**
 * 특정 사용자 트랜잭션 내역 조회 (Admin)
 */
export function useUserTransactions(userId: string, page: number, limit: number) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.payment.admin.getUserTransactions.queryOptions({ userId, page, limit }),
    enabled: !!userId,
  });
}

/**
 * 관리자 수동 크레딧 조정 (Admin)
 */
export function useAdjustCredits() {
  const trpc = useTRPC();
  return useMutation(trpc.payment.admin.adjustCredits.mutationOptions());
}
