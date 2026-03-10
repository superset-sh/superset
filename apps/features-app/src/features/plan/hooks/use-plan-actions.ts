import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useCallback } from 'react';

/**
 * 플랜 변경 (업그레이드/다운그레이드)
 */
export function useChangePlan() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...trpc.payment.changePlan.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.payment.getMySubscription.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.payment.getMyBalance.queryKey() });
    },
  });

  const changePlan = useCallback(
    async (targetPlanId: string) => {
      return mutation.mutateAsync({ targetPlanId });
    },
    [mutation],
  );

  return {
    changePlan,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
