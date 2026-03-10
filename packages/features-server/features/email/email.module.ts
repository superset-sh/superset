import { Module, OnModuleInit } from '@nestjs/common';
import { EmailService } from './service/email.service';
import { EmailProviderService } from './service/email-provider.service';
import { EmailTemplateService } from './service/email-template.service';
import { EmailController } from './controller/email.controller';
import { injectEmailService } from './trpc';

/**
 * Email Feature Module
 *
 * 이메일 발송 및 로그 관리 기능을 제공
 */
@Module({
  controllers: [EmailController],
  providers: [EmailService, EmailProviderService, EmailTemplateService],
  exports: [EmailService, EmailTemplateService],
})
export class EmailModule implements OnModuleInit {
  constructor(private readonly emailService: EmailService) {}

  onModuleInit() {
    // tRPC 라우터에 서비스 인스턴스 주입
    injectEmailService(this.emailService);
    console.log('[EmailModule] Initialized successfully');
  }
}
