import { z } from 'zod';

export const updateSettingsSchema = z.object({
  type: z
    .enum(['comment', 'like', 'follow', 'mention', 'system', 'announcement'])
    .describe('알림 유형'),
  enabled: z.boolean().describe('활성화 여부'),
  channels: z
    .array(z.enum(['email', 'push', 'inapp']))
    .optional()
    .describe('수신 채널'),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type UpdateSettingsDto = UpdateSettingsInput;
