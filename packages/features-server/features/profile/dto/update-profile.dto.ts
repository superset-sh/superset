import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(1, '이름은 필수입니다').max(50).describe('이름'),
  avatar: z.string().url().nullable().optional().describe('아바타 URL'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
