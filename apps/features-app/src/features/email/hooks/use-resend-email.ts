import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';

/**
 * 이메일 재발송 Hook
 */
export function useResendEmail() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.email.resend.mutationOptions(),
    onSuccess: () => {
      // 이메일 로그 목록 무효화하여 자동 갱신
      queryClient.invalidateQueries({
        queryKey: [['email', 'getLogs']],
      });
      queryClient.invalidateQueries({
        queryKey: [['email', 'getLog']],
      });
    },
  });
}
