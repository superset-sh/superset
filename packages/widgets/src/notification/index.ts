/**
 * Notification Widget
 *
 * Connected components for notification display and management.
 * Admin components (BroadcastForm, Stats) remain in apps/app.
 */

// Hooks
export {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useNotificationSettings,
  useUpdateNotificationSettings,
  useNotificationSocket,
} from './hooks';

// Pages/Components
export { NotificationBell } from './pages/notification-bell';
export { NotificationDropdown } from './pages/notification-dropdown';
export { NotificationList } from './pages/notification-list';
export { NotificationItem } from './pages/notification-item';
export { NotificationSettings } from './pages/notification-settings';

// Shared Components
export { NotificationTypeBadge } from './components';

// Types
export type * from './types';
