import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useCallback } from 'react';

/**
 * 내 크레딧 잔액 조회
 */
export function useMyBalance() {
  const trpc = useTRPC();
  return useQuery(trpc.payment.getMyBalance.queryOptions());
}

/**
 * 내 크레딧 트랜잭션 내역
 */
export function useMyTransactions(page: number, limit: number) {
  const trpc = useTRPC();
  return useQuery(trpc.payment.getMyTransactions.queryOptions({ page, limit }));
}

/**
 * 내 주문(결제) 내역
 */
export function useMyOrders(page: number, limit: number) {
  const trpc = useTRPC();
  return useQuery(trpc.payment.getMyOrders.queryOptions({ page, limit }));
}

/**
 * 자동 충전 설정 업데이트
 */
export function useUpdateAutoRecharge() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(trpc.payment.updateAutoRecharge.mutationOptions());

  const updateAutoRecharge = useCallback(
    async (input: { autoRecharge: boolean; autoRechargeThreshold?: number; autoRechargeAmount?: number }) => {
      const result = await mutation.mutateAsync(input);
      queryClient.invalidateQueries({ queryKey: trpc.payment.getMyBalance.queryKey() });
      return result;
    },
    [mutation, queryClient, trpc],
  );

  return {
    updateAutoRecharge,
    isPending: mutation.isPending,
    error: mutation.error,
    mutateAsync: mutation.mutateAsync,
  };
}
