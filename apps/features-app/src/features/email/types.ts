/**
 * Email Feature Types
 *
 * tRPC를 통해 전달되는 데이터는 Date 객체가 string으로 직렬화됩니다.
 */
import type { EmailStatus, EmailTemplateType, EmailLog as DrizzleEmailLog } from '@superbuilder/drizzle';

/**
 * 이메일 로그 (Frontend)
 * Date 필드가 string으로 직렬화됨
 */
export type EmailLog = Omit<DrizzleEmailLog, 'createdAt' | 'updatedAt' | 'sentAt' | 'deliveredAt' | 'openedAt' | 'metadata'> & {
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  metadata?: unknown;
};

/**
 * 이메일 로그 필터
 */
export interface EmailLogsFilters {
  page?: number;
  limit?: number;
  status?: EmailStatus;
  templateType?: EmailTemplateType;
  search?: string;
}

/**
 * Re-export from Drizzle
 */
export type { EmailStatus, EmailTemplateType };

/**
 * 이메일 상태 레이블
 */
export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  pending: '대기중',
  sending: '발송중',
  sent: '발송완료',
  delivered: '전달완료',
  failed: '실패',
  bounced: '반송',
  opened: '열람',
};

/**
 * 이메일 상태 색상
 */
export const EMAIL_STATUS_COLORS: Record<EmailStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  sending: 'default',
  sent: 'default',
  delivered: 'default',
  failed: 'destructive',
  bounced: 'destructive',
  opened: 'default',
};

/**
 * 이메일 템플릿 레이블
 */
export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateType, string> = {
  welcome: '환영 이메일',
  'email-verification': '이메일 인증',
  'password-reset': '비밀번호 재설정',
  'password-changed': '비밀번호 변경 알림',
  notification: '알림',
};
