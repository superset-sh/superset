import type { EmailLog, EmailTemplateType, EmailStatus } from '@superbuilder/drizzle';
import type { QueryLogsDto } from '../dto/query-logs.dto';

/**
 * Email Service Interface
 * 서버의 실제 EmailService가 이 인터페이스를 구현
 */
export interface IEmailService {
  getEmailLogs(filters: QueryLogsDto): Promise<EmailLog[]>;
  getEmailLog(logId: string): Promise<EmailLog | null>;
  resendEmail(logId: string): Promise<EmailLog>;
}

/**
 * 이메일 발송 입력
 */
export interface SendEmailInput {
  recipientEmail: string;
  recipientName?: string;
  recipientId?: string;
  templateType: EmailTemplateType;
  subject: string;
  variables: Record<string, any>;
}

/**
 * 이메일 발송 결과
 */
export interface SendEmailResult {
  messageId: string;
  success: boolean;
}

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
 * 이메일 제공자 설정
 */
export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * 이메일 제공자 인터페이스
 */
export interface EmailProvider {
  send(options: SendEmailOptions): Promise<SendEmailResult>;
}

/**
 * 템플릿 변수 타입
 */
export interface WelcomeEmailVariables {
  userName: string;
  loginUrl: string;
}

export interface EmailVerificationVariables {
  userName: string;
  verifyUrl: string;
}

export interface PasswordResetVariables {
  userName: string;
  resetUrl: string;
  expiresIn: string;
}

export interface PasswordChangedVariables {
  userName: string;
  changedAt: string;
}

export interface NotificationVariables {
  userName: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}
