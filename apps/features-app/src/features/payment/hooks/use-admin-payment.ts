import { useQuery, useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useCallback } from 'react';
import type {
  SubscriptionQueryInput,
  OrderQueryInput,
  LicenseQueryInput,
} from '@superbuilder/features-server/payment';

/**
 * 제품 동기화 (Admin)
 */
export function useSyncProducts() {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.payment.admin.syncProducts.mutationOptions());

  const syncProducts = useCallback(async () => {
    return mutation.mutateAsync();
  }, [mutation]);

  return {
    syncProducts,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * 구독 목록 (Admin)
 */
export function useAdminSubscriptions(input: SubscriptionQueryInput) {
  const trpc = useTRPC();
  return useQuery(trpc.payment.admin.getSubscriptions.queryOptions(input));
}

/**
 * 구독 통계 (Admin)
 */
export function useSubscriptionStats() {
  const trpc = useTRPC();
  return useQuery(trpc.payment.admin.getSubscriptionStats.queryOptions());
}

/**
 * 주문 목록 (Admin)
 */
export function useAdminOrders(input: OrderQueryInput) {
  const trpc = useTRPC();
  return useQuery(trpc.payment.admin.getOrders.queryOptions(input));
}

/**
 * 라이선스 목록 (Admin)
 */
export function useAdminLicenses(input: LicenseQueryInput) {
  const trpc = useTRPC();
  return useQuery(trpc.payment.admin.getLicenses.queryOptions(input));
}

/**
 * 환불 요청 목록 (Admin)
 */
export function useRefundRequests() {
  const trpc = useTRPC();
  return useQuery(trpc.payment.admin.getRefundRequests.queryOptions());
}
