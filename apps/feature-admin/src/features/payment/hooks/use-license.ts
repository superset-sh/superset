import { useQuery, useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useCallback } from 'react';

/**
 * 내 라이선스 목록
 */
export function useMyLicenses() {
  const trpc = useTRPC();
  return useQuery(trpc.payment.getMyLicenses.queryOptions());
}

/**
 * 라이선스 검증
 */
export function useValidateLicense() {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.payment.validateLicense.mutationOptions());

  const validateLicense = useCallback(
    async (licenseKey: string) => {
      return mutation.mutateAsync({ licenseKey });
    },
    [mutation],
  );

  return {
    validateLicense,
    isLoading: mutation.isPending,
    error: mutation.error,
    result: mutation.data,
  };
}
