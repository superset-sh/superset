import { z } from 'zod';

export const broadcastSchema = z.object({
  title: z.string().min(1).max(200).describe('공지 제목'),
  content: z.string().min(1).describe('공지 내용'),
  targetUserIds: z
    .array(z.string().uuid())
    .optional()
    .describe('대상 사용자 ID 목록 (없으면 전체)'),
});

export type BroadcastInput = z.infer<typeof broadcastSchema>;
export type BroadcastDto = BroadcastInput;
