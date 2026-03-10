import { Bell } from 'lucide-react';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { useUnreadCount } from '../hooks';

interface NotificationBellProps {
  onClick?: () => void;
}

/**
 * 알림 벨 아이콘 (헤더에 표시)
 */
export function NotificationBell({ onClick }: NotificationBellProps) {
  const { data } = useUnreadCount();
  const unreadCount = data?.count ?? 0;

  return (
    <Button variant="ghost" size="icon" className="relative" onClick={onClick}>
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  );
}
