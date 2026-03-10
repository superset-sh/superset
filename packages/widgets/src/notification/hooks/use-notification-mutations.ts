import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@superbuilder/features-client/trpc-client';

/**
 * 알림 읽음 처리 Hook
 */
export function useMarkAsRead() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.notification.markAsRead.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.notification.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.notification.unreadCount.queryKey(),
      });
    },
  });
}

/**
 * 전체 읽음 처리 Hook
 */
export function useMarkAllAsRead() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.notification.markAllAsRead.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.notification.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.notification.unreadCount.queryKey(),
      });
    },
  });
}
