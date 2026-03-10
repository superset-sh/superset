import { z } from 'zod';

const emailTemplateTypes = [
  'welcome',
  'email-verification',
  'password-reset',
  'password-changed',
  'notification',
] as const;

export const sendEmailSchema = z.object({
  recipientEmail: z.string().email().describe('수신자 이메일'),
  recipientName: z.string().optional().describe('수신자 이름'),
  recipientId: z.string().uuid().optional().describe('수신자 프로필 ID'),
  templateType: z.enum(emailTemplateTypes).describe('이메일 템플릿 타입'),
  subject: z.string().min(1).max(200).describe('이메일 제목'),
  variables: z.record(z.string(), z.any()).describe('템플릿 변수'),
});

export type SendEmailDto = z.infer<typeof sendEmailSchema>;
