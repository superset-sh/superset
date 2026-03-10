import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useCallback } from 'react';

/**
 * 모델 가격 목록 조회 (Admin)
 */
export function useModelPricing() {
  const trpc = useTRPC();
  return useQuery(trpc.payment.admin.getModelPricing.queryOptions());
}

/**
 * 모델 가격 upsert (Admin)
 */
export function useUpsertModelPricing() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(trpc.payment.admin.upsertModelPricing.mutationOptions());

  const upsert = useCallback(
    async (input: Parameters<typeof mutation.mutateAsync>[0]) => {
      const result = await mutation.mutateAsync(input);
      queryClient.invalidateQueries({ queryKey: trpc.payment.admin.getModelPricing.queryKey() });
      return result;
    },
    [mutation, queryClient, trpc],
  );

  return {
    upsert,
    isPending: mutation.isPending,
    error: mutation.error,
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
  };
}
