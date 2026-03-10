import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '../hooks';
import { NotificationItem } from './notification-item';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Loader2 } from 'lucide-react';
import type { NotificationItem as NotificationItemType } from '../types';

interface NotificationListProps {
  limit?: number;
  unreadOnly?: boolean;
  onItemClick?: (notification: NotificationItemType) => void;
}

/**
 * 알림 목록
 */
export function NotificationList({
  limit = 10,
  unreadOnly = false,
  onItemClick,
}: NotificationListProps) {
  const { data, isLoading } = useNotifications({ limit, unreadOnly });
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const handleItemClick = (notification: NotificationItemType) => {
    if (!notification.readAt) {
      markAsRead.mutate({ id: notification.id });
    }
    onItemClick?.(notification);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = (data?.items ?? []) as unknown as NotificationItemType[];
  const hasUnread = items.some((item) => !item.readAt);

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">알림이 없습니다</div>
    );
  }

  return (
    <div className="flex flex-col">
      {hasUnread && (
        <div className="flex justify-end border-b px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={markAllAsRead.isPending}
          >
            {markAllAsRead.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            전체 읽음
          </Button>
        </div>
      )}
      <div className="flex flex-col divide-y">
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onClick={handleItemClick}
          />
        ))}
      </div>
    </div>
  );
}
