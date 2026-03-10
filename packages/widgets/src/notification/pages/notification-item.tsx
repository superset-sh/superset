import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@superbuilder/feature-ui/lib/utils';
import { NotificationTypeBadge } from '../components/notification-type-badge';
import type { NotificationItem as NotificationItemType } from '../types';

interface NotificationItemProps {
  notification: NotificationItemType;
  onClick?: (notification: NotificationItemType) => void;
}

/**
 * 알림 아이템
 */
export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const isUnread = !notification.readAt;

  const handleClick = () => {
    onClick?.(notification);
  };

  return (
    <div
      className={cn(
        'flex cursor-pointer flex-col gap-1 rounded-lg p-3 transition-colors hover:bg-muted',
        isUnread && 'bg-muted/50'
      )}
      onClick={handleClick}
    >
      <div className="flex items-center justify-between gap-2">
        <NotificationTypeBadge type={notification.type} />
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
            locale: ko,
          })}
        </span>
      </div>
      <h4 className={cn('text-sm', isUnread && 'font-medium')}>{notification.title}</h4>
      {notification.content && (
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.content}</p>
      )}
    </div>
  );
}
