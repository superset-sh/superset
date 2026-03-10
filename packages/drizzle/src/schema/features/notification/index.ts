import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  pgEnum,
  index,
  boolean,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { baseColumns } from '../../../utils';
import { profiles } from '../../core/profiles';

// ============================================================================
// Enums
// ============================================================================

/**
 * Notification Type Enum
 * 알림 유형 정의
 */
export const notificationTypeEnum = pgEnum('notification_type', [
  'comment',       // 댓글 알림
  'like',          // 좋아요 알림
  'follow',        // 팔로우 알림
  'mention',       // 멘션 알림
  'system',        // 시스템 알림
  'announcement',  // 공지사항
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Notifications Table
 * 사용자별 알림 저장
 */
export const notifications = pgTable(
  'notification_notifications',
  {
    ...baseColumns(),

    // 수신자 정보
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    // 알림 정보
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    content: text('content'),

    // 관련 데이터 (링크, ID 등)
    data: jsonb('data'),

    // 읽음 상태
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index('idx_notifications_user_id').on(table.userId, table.createdAt),
    typeIdx: index('idx_notifications_type').on(table.type, table.createdAt),
    readAtIdx: index('idx_notifications_read_at').on(table.userId, table.readAt),
  })
);

/**
 * Notification Settings Table
 * 사용자별 알림 설정
 */
export const notificationSettings = pgTable(
  'notification_settings',
  {
    ...baseColumns(),

    // 사용자
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    // 알림 유형
    type: notificationTypeEnum('type').notNull(),

    // 활성화 여부
    enabled: boolean('enabled').notNull().default(true),

    // 수신 채널 (inapp, email, push)
    channels: jsonb('channels').$type<string[]>().default(['inapp']),
  },
  (table) => ({
    userTypeUniqueIdx: index('idx_notification_settings_user_type').on(table.userId, table.type),
  })
);

// ============================================================================
// Relations
// ============================================================================

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(profiles, {
    fields: [notifications.userId],
    references: [profiles.id],
  }),
}));

export const notificationSettingsRelations = relations(notificationSettings, ({ one }) => ({
  user: one(profiles, {
    fields: [notificationSettings.userId],
    references: [profiles.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type NewNotificationSetting = typeof notificationSettings.$inferInsert;
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
