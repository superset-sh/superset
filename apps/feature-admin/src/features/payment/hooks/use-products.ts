import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/**
 * 활성 제품 목록 조회
 */
export function useProducts() {
  const trpc = useTRPC();
  return useQuery(trpc.payment.getActiveProducts.queryOptions());
}

/**
 * 제품 목록 (로딩 상태 포함)
 */
export function useProductsWithLoading() {
  const query = useProducts();

  return {
    products: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
