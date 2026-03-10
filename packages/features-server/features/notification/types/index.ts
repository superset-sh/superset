/**
 * Notification Feature Types
 *
 * DB Types are imported from @superbuilder/drizzle:
 * import { Notification, NotificationSetting, NotificationType } from "@superbuilder/drizzle"
 */

// ============================================================================
// API Response Types
// ============================================================================

export interface NotificationWithMeta {
  id: string;
  userId: string;
  type: 'comment' | 'like' | 'follow' | 'mention' | 'system' | 'announcement';
  title: string;
  content: string | null;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationListResponse {
  items: NotificationWithMeta[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface UnreadCountResponse {
  count: number;
}

// ============================================================================
// Filter Types
// ============================================================================

export interface NotificationFilters {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  type?: string;
}

export interface SettingsFilters {
  type?: string;
}
