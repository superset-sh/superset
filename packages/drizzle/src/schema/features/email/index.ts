import { pgTable, text, integer, uuid, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { baseColumns } from '../../../utils';
import { profiles } from '../../core/profiles';

/**
 * Email Status Enum
 */
export const emailStatusEnum = pgEnum('email_status', [
  'pending',    // 대기 중
  'sending',    // 발송 중
  'sent',       // 발송 완료
  'delivered',  // 배달 완료
  'failed',     // 발송 실패
  'bounced',    // 반송됨
  'opened',     // 열람됨
]);

/**
 * Email Template Type Enum
 */
export const emailTemplateEnum = pgEnum('email_template_type', [
  'welcome',              // 환영 이메일
  'email-verification',   // 이메일 인증
  'password-reset',       // 비밀번호 재설정
  'password-changed',     // 비밀번호 변경 완료
  'notification',         // 일반 알림
]);

/**
 * Email Logs Table
 *
 * 발송된 모든 이메일의 로그를 저장
 */
export const emailLogs = pgTable(
  'email_logs',
  {
    ...baseColumns(),

    // 수신자 정보
    recipientEmail: text('recipient_email').notNull(),
    recipientName: text('recipient_name'),
    recipientId: uuid('recipient_id').references(() => profiles.id, { onDelete: 'set null' }),

    // 이메일 정보
    templateType: emailTemplateEnum('template_type').notNull(),
    subject: text('subject').notNull(),

    // 발송 상태
    status: emailStatusEnum('status').notNull().default('pending'),
    providerMessageId: text('provider_message_id'), // Resend message ID
    failureReason: text('failure_reason'),
    retryCount: integer('retry_count').notNull().default(0),

    // 시간 추적
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),

    // 메타데이터 (템플릿 변수, 추가 정보)
    metadata: jsonb('metadata'),
  },
  (table) => ({
    recipientEmailIdx: index('idx_email_logs_recipient').on(table.recipientEmail, table.createdAt),
    statusIdx: index('idx_email_logs_status').on(table.status, table.createdAt),
    templateIdx: index('idx_email_logs_template').on(table.templateType, table.createdAt),
  })
);

// Relations
export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  recipient: one(profiles, {
    fields: [emailLogs.recipientId],
    references: [profiles.id],
  }),
}));

// Type Exports
export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;
export type EmailStatus = typeof emailStatusEnum.enumValues[number];
export type EmailTemplateType = typeof emailTemplateEnum.enumValues[number];
