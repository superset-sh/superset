/**
 * Notification Feature - Client
 *
 * Public components/hooks re-exported from @superbuilder/widgets/notification.
 * Admin-only components remain local.
 */

// Widget re-exports (public components + hooks)
export {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useNotificationSettings,
  useUpdateNotificationSettings,
  useNotificationSocket,
  NotificationBell,
  NotificationDropdown,
  NotificationList,
  NotificationItem,
  NotificationSettings,
  NotificationTypeBadge,
} from '@superbuilder/widgets/notification';

// Admin-only components (local)
export { NotificationBroadcastForm } from './pages/notification-broadcast-form';
export { NotificationStats } from './pages/notification-stats';

// Types
export type * from '@superbuilder/widgets/notification';
