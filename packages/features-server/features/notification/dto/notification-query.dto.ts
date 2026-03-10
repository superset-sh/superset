import { z } from 'zod';

export const notificationQuerySchema = z.object({
  page: z.number().int().positive().default(1).describe('페이지 번호'),
  limit: z.number().int().positive().max(100).default(20).describe('페이지당 항목 수'),
  unreadOnly: z.boolean().default(false).describe('읽지 않은 알림만'),
  type: z
    .enum(['comment', 'like', 'follow', 'mention', 'system', 'announcement'])
    .optional()
    .describe('알림 유형 필터'),
});

// Input type (before parsing, with optional fields)
export type NotificationQueryInput = z.input<typeof notificationQuerySchema>;
// Output type (after parsing, with defaults applied)
export type NotificationQueryDto = z.infer<typeof notificationQuerySchema>;
