import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useCallback } from 'react';

/**
 * LS → Plans 동기화 (Admin)
 */
export function useSyncPlans() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(trpc.payment.admin.syncPlans.mutationOptions());

  const sync = useCallback(async () => {
    const result = await mutation.mutateAsync();
    queryClient.invalidateQueries({ queryKey: trpc.payment.admin.getAllPlans.queryKey() });
    return result;
  }, [mutation, queryClient, trpc]);

  return {
    sync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * 전체 플랜 목록 조회 (Admin)
 */
export function usePlans() {
  const trpc = useTRPC();
  return useQuery(trpc.payment.admin.getAllPlans.queryOptions());
}

/**
 * 플랜 생성 (Admin)
 */
export function useCreatePlan() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(trpc.payment.admin.createPlan.mutationOptions());

  const create = useCallback(
    async (input: Parameters<typeof mutation.mutateAsync>[0]) => {
      const result = await mutation.mutateAsync(input);
      queryClient.invalidateQueries({ queryKey: trpc.payment.admin.getAllPlans.queryKey() });
      return result;
    },
    [mutation, queryClient, trpc],
  );

  return {
    create,
    isPending: mutation.isPending,
    error: mutation.error,
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
  };
}

/**
 * 플랜 수정 (Admin)
 */
export function useUpdatePlan() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(trpc.payment.admin.updatePlan.mutationOptions());

  const update = useCallback(
    async (input: Parameters<typeof mutation.mutateAsync>[0]) => {
      const result = await mutation.mutateAsync(input);
      queryClient.invalidateQueries({ queryKey: trpc.payment.admin.getAllPlans.queryKey() });
      return result;
    },
    [mutation, queryClient, trpc],
  );

  return {
    update,
    isPending: mutation.isPending,
    error: mutation.error,
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
  };
}

/**
 * DB → Provider 동기화 (Admin)
 */
export function usePushPlansToProvider() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(trpc.payment.admin.pushPlansToProvider.mutationOptions());

  const push = useCallback(async () => {
    const result = await mutation.mutateAsync();
    queryClient.invalidateQueries({ queryKey: trpc.payment.admin.getAllPlans.queryKey() });
    return result;
  }, [mutation, queryClient, trpc]);

  return {
    push,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * 사용자에게 플랜 할당 (Admin)
 */
export function useAssignPlan() {
  const trpc = useTRPC();
  return useMutation(trpc.payment.admin.assignPlan.mutationOptions());
}
