import type { EmailLog, EmailStatus, EmailTemplateType } from '@superbuilder/drizzle';

export type { EmailLog, EmailStatus, EmailTemplateType };

/**
 * Email 로그 필터
 */
export interface EmailLogsFilters {
  page?: number;
  limit?: number;
  status?: EmailStatus;
  templateType?: EmailTemplateType;
  search?: string;
}

/**
 * 상태별 색상 매핑
 */
export const EMAIL_STATUS_COLORS: Record<EmailStatus, string> = {
  pending: 'gray',
  sending: 'blue',
  sent: 'blue',
  delivered: 'green',
  failed: 'red',
  bounced: 'orange',
  opened: 'purple',
};

/**
 * 상태별 레이블
 */
export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  pending: '대기 중',
  sending: '발송 중',
  sent: '발송됨',
  delivered: '배달됨',
  failed: '실패',
  bounced: '반송됨',
  opened: '열람됨',
};

/**
 * 템플릿별 레이블
 */
export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateType, string> = {
  welcome: '환영 이메일',
  'email-verification': '이메일 인증',
  'password-reset': '비밀번호 재설정',
  'password-changed': '비밀번호 변경',
  notification: '알림',
};
