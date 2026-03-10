/**
 * Notification Feature Client Types
 */

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'comment' | 'like' | 'follow' | 'mention' | 'system' | 'announcement';
  title: string;
  content: string | null;
  data?: unknown;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListFilters {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  type?: string;
}

export interface NotificationSetting {
  type: string;
  enabled: boolean;
  channels: string[];
}
