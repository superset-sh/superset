import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@superbuilder/features-client/trpc-client';

/**
 * 알림 설정 조회 Hook
 */
export function useNotificationSettings() {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.notification.getSettings.queryOptions(),
  });
}

/**
 * 알림 설정 업데이트 Hook
 */
export function useUpdateNotificationSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.notification.updateSettings.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.notification.getSettings.queryKey(),
      });
    },
  });
}
