import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useCallback } from 'react';

/**
 * 주문 환불 요청 (Admin)
 */
export function useRefundOrder() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...trpc.payment.admin.refundOrder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.payment.admin.getOrders.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.payment.admin.getRefundRequests.queryKey() });
    },
  });

  const refundOrder = useCallback(
    async (orderId: string, amount?: number, reason?: string) => {
      return mutation.mutateAsync({
        orderId,
        data: { amount, reason },
      });
    },
    [mutation],
  );

  return {
    refundOrder,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * 구독 환불 요청 (Admin)
 */
export function useRefundSubscription() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...trpc.payment.admin.refundSubscription.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.payment.admin.getSubscriptions.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.payment.admin.getRefundRequests.queryKey() });
    },
  });

  const refundSubscription = useCallback(
    async (subscriptionId: string, reason: string) => {
      return mutation.mutateAsync({
        subscriptionId,
        data: { reason },
      });
    },
    [mutation],
  );

  return {
    refundSubscription,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
