import { z } from 'zod';

export const updateTermSchema = z.object({
  name: z.string().min(1).max(200).optional().describe('약관 이름'),
  url: z.string().url().optional().describe('약관 URL'),
  isRequired: z.boolean().optional().describe('필수 여부'),
  sortOrder: z.number().int().min(0).optional().describe('정렬 순서'),
  isActive: z.boolean().optional().describe('활성 여부'),
});

export type UpdateTermInput = z.infer<typeof updateTermSchema>;
