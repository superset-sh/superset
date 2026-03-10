import { z } from 'zod';

const emailStatuses = ['pending', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'opened'] as const;
const emailTemplateTypes = [
  'welcome',
  'email-verification',
  'password-reset',
  'password-changed',
  'notification',
] as const;

export const queryLogsSchema = z.object({
  page: z.number().int().positive().default(1).describe('페이지 번호'),
  limit: z.number().int().positive().max(100).default(20).describe('페이지당 항목 수'),
  status: z.enum(emailStatuses).optional().describe('이메일 상태 필터'),
  templateType: z.enum(emailTemplateTypes).optional().describe('템플릿 타입 필터'),
  search: z.string().optional().describe('이메일 주소 검색'),
});

export type QueryLogsDto = z.infer<typeof queryLogsSchema>;
