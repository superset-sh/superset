import { z } from 'zod';

export const createTermSchema = z.object({
  name: z.string().min(1, '약관 이름은 필수입니다').max(200).describe('약관 이름'),
  url: z.string().url('올바른 URL 형식이 아닙니다').describe('약관 URL'),
  isRequired: z.boolean().default(true).describe('필수 여부'),
  sortOrder: z.number().int().min(0).default(0).describe('정렬 순서'),
});

export type CreateTermInput = z.infer<typeof createTermSchema>;
