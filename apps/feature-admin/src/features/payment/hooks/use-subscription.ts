import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useCallback } from 'react';
import type { UpdateSubscriptionInput } from '@superbuilder/features-server/payment';

/**
 * 내 구독 정보 조회
 */
export function useMySubscription() {
  const trpc = useTRPC();
  return useQuery(trpc.payment.getMySubscription.queryOptions());
}

/**
 * 구독 업데이트
 */
export function useUpdateSubscription() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...trpc.payment.updateSubscription.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.payment.getMySubscription.queryKey() });
    },
  });

  const updateSubscription = useCallback(
    async (id: string, data: UpdateSubscriptionInput) => {
      return mutation.mutateAsync({ id, data });
    },
    [mutation],
  );

  return {
    updateSubscription,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * 구독 취소
 */
export function useCancelSubscription() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...trpc.payment.cancelSubscription.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.payment.getMySubscription.queryKey() });
    },
  });

  const cancelSubscription = useCallback(
    async (id: string, reason?: string) => {
      return mutation.mutateAsync({
        id,
        data: { reason },
      });
    },
    [mutation],
  );

  return {
    cancelSubscription,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * 구독 상태 체크
 */
export function useSubscriptionStatus() {
  const { data: subscription, isLoading } = useMySubscription();

  return {
    subscription,
    isLoading,
    hasActiveSubscription: subscription?.status === 'active',
    isOnTrial: subscription?.status === 'on_trial',
    isCancelled: subscription?.status === 'cancelled',
    isExpired: subscription?.status === 'expired',
  };
}
