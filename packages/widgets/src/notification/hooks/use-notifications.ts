import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@superbuilder/features-client/trpc-client';
import type { NotificationListFilters } from '../types';

/**
 * 알림 목록 조회 Hook
 */
export function useNotifications(filters: NotificationListFilters = {}) {
  const trpc = useTRPC();
  const { page = 1, limit = 20, unreadOnly = false, type } = filters;

  return useQuery({
    ...trpc.notification.list.queryOptions({
      page,
      limit,
      unreadOnly,
      type: type as any,
    }),
  });
}

/**
 * 읽지 않은 알림 수 조회 Hook
 */
export function useUnreadCount() {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.notification.unreadCount.queryOptions(),
    refetchInterval: 30000, // 30초마다 갱신
  });
}
