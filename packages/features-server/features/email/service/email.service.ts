import { Injectable, InternalServerErrorException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { emailLogs, type EmailLog, type EmailTemplateType } from '@superbuilder/drizzle';
import { eq, and, gte, desc, ilike } from 'drizzle-orm';
import { EmailProviderService } from './email-provider.service';
import { EmailTemplateService } from './email-template.service';
import type { SendEmailInput, EmailLogsFilters } from '../types';

/**
 * Email Service
 *
 * 이메일 발송 및 로그 관리를 담당하는 핵심 서비스
 */
@Injectable()
export class EmailService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly providerService: EmailProviderService,
    private readonly templateService: EmailTemplateService,
  ) {}

  /**
   * 이메일 발송 (메인 메서드)
   */
  async sendEmail(input: SendEmailInput): Promise<EmailLog> {
    // 1. 중복 발송 체크 (1분 이내)
    await this.checkDuplicateSend(input.recipientEmail, input.templateType);

    // 2. 템플릿 렌더링
    const html = await this.templateService.render(input.templateType, input.variables);

    // 3. 로그 생성
    const [log] = await this.db
      .insert(emailLogs)
      .values({
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName,
        recipientId: input.recipientId,
        templateType: input.templateType,
        subject: input.subject,
        status: 'pending',
        metadata: input.variables,
      })
      .returning();

    if (!log) {
      throw new InternalServerErrorException("이메일 로그 생성에 실패했습니다");
    }

    // 4. 발송 시도
    try {
      const result = await this.providerService.send({
        to: input.recipientEmail,
        subject: input.subject,
        html,
      });

      // 5. 발송 성공 시 로그 업데이트
      await this.updateLogStatus(log.id, {
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: result.messageId,
      });

      console.log(`[EmailService] Email sent successfully: ${log.id}`);
    } catch (error) {
      // 6. 발송 실패 시 로그 업데이트
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.updateLogStatus(log.id, {
        status: 'failed',
        failureReason: errorMessage,
        retryCount: log.retryCount + 1,
      });

      console.error(`[EmailService] Email send failed: ${log.id}`, error);

      // 7. 재시도 로직 (최대 3회)
      if (log.retryCount < 3) {
        // TODO: 큐에 재발송 작업 추가 (BullMQ)
        console.log(`[EmailService] Scheduling retry for: ${log.id}`);
      }

      throw error;
    }

    return log;
  }

  /**
   * 환영 이메일 발송
   */
  async sendWelcomeEmail(user: { email: string; name: string; id?: string }): Promise<EmailLog> {
    const appUrl = process.env.APP_URL || 'https://atlas.com';

    return this.sendEmail({
      recipientEmail: user.email,
      recipientName: user.name,
      recipientId: user.id,
      templateType: 'welcome',
      subject: `${user.name}님, 환영합니다!`,
      variables: {
        userName: user.name,
        loginUrl: `${appUrl}/login`,
      },
    });
  }

  /**
   * 비밀번호 재설정 이메일 발송
   */
  async sendPasswordResetEmail(
    user: { email: string; name: string; id?: string },
    resetToken: string,
  ): Promise<EmailLog> {
    const appUrl = process.env.APP_URL || 'https://atlas.com';
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

    return this.sendEmail({
      recipientEmail: user.email,
      recipientName: user.name,
      recipientId: user.id,
      templateType: 'password-reset',
      subject: '비밀번호 재설정 요청',
      variables: {
        userName: user.name,
        resetUrl,
        expiresIn: '1시간',
      },
    });
  }

  /**
   * 이메일 인증 발송
   */
  async sendEmailVerification(
    user: { email: string; name: string; id?: string },
    verificationToken: string,
  ): Promise<EmailLog> {
    const appUrl = process.env.APP_URL || 'https://atlas.com';
    const verifyUrl = `${appUrl}/verify-email?token=${verificationToken}`;

    return this.sendEmail({
      recipientEmail: user.email,
      recipientName: user.name,
      recipientId: user.id,
      templateType: 'email-verification',
      subject: '이메일 주소를 인증해주세요',
      variables: {
        userName: user.name,
        verifyUrl,
      },
    });
  }

  /**
   * 이메일 로그 조회 (관리자)
   */
  async getEmailLogs(filters: EmailLogsFilters): Promise<EmailLog[]> {
    const { page = 1, limit = 20, status, templateType, search } = filters;

    const conditions: any[] = [];

    if (status) {
      conditions.push(eq(emailLogs.status, status));
    }
    if (templateType) {
      conditions.push(eq(emailLogs.templateType, templateType));
    }
    if (search) {
      conditions.push(ilike(emailLogs.recipientEmail, `%${search}%`));
    }

    const logs = await this.db.query.emailLogs.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit,
      offset: (page - 1) * limit,
      orderBy: desc(emailLogs.createdAt),
    });

    return logs;
  }

  /**
   * 이메일 로그 상세 조회
   */
  async getEmailLog(logId: string): Promise<EmailLog | null> {
    const log = await this.db.query.emailLogs.findFirst({
      where: eq(emailLogs.id, logId),
    });

    return log || null;
  }

  /**
   * 이메일 재발송 (관리자)
   */
  async resendEmail(logId: string): Promise<EmailLog> {
    const log = await this.getEmailLog(logId);

    if (!log) {
      throw new NotFoundException("이메일 로그를 찾을 수 없습니다");
    }

    const html = await this.templateService.render(
      log.templateType,
      (log.metadata as Record<string, any>) || {},
    );

    try {
      const result = await this.providerService.send({
        to: log.recipientEmail,
        subject: log.subject,
        html,
      });

      await this.updateLogStatus(log.id, {
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: result.messageId,
        retryCount: log.retryCount + 1,
      });

      console.log(`[EmailService] Email resent successfully: ${log.id}`);

      return (await this.getEmailLog(log.id))!;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.updateLogStatus(log.id, {
        status: 'failed',
        failureReason: errorMessage,
        retryCount: log.retryCount + 1,
      });

      throw error;
    }
  }

  /**
   * 중복 발송 체크
   */
  private async checkDuplicateSend(
    email: string,
    templateType: EmailTemplateType,
  ): Promise<void> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const recentLog = await this.db.query.emailLogs.findFirst({
      where: and(
        eq(emailLogs.recipientEmail, email),
        eq(emailLogs.templateType, templateType),
        gte(emailLogs.createdAt, oneMinuteAgo),
      ),
    });

    if (recentLog) {
      throw new ConflictException("이미 발송된 이메일이 있습니다. 1분 후 다시 시도해주세요.");
    }
  }

  /**
   * 로그 상태 업데이트
   */
  private async updateLogStatus(logId: string, update: Partial<EmailLog>): Promise<void> {
    await this.db
      .update(emailLogs)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(emailLogs.id, logId));
  }
}
