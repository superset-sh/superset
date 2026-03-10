import { z } from 'zod';

export const createNotificationSchema = z.object({
  userId: z.string().uuid().describe('수신자 ID'),
  type: z
    .enum(['comment', 'like', 'follow', 'mention', 'system', 'announcement'])
    .describe('알림 유형'),
  title: z.string().min(1).max(200).describe('알림 제목'),
  content: z.string().optional().describe('알림 내용'),
  data: z.record(z.any()).optional().describe('추가 데이터 (링크, ID 등)'),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type CreateNotificationDto = CreateNotificationInput;
