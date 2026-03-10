import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useCallback } from 'react';
import type { CreateCheckoutInput } from '@superbuilder/features-server/payment';

/**
 * Checkout 생성
 */
export function useCreateCheckout() {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.payment.createCheckout.mutationOptions());

  const createCheckout = useCallback(
    async (input: CreateCheckoutInput) => {
      const result = await mutation.mutateAsync(input);

      // 결제 페이지로 리다이렉트
      if (result && typeof result === 'object' && 'checkoutUrl' in result && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }

      return result;
    },
    [mutation],
  );

  return {
    createCheckout,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
