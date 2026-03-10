import { Module, OnModuleInit } from '@nestjs/common';
import { AuditLogService } from './service/audit-log.service';
import { AuditLogController } from './controller/audit-log.controller';
import { injectAuditLogService } from './audit-log.router';

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule implements OnModuleInit {
  constructor(private readonly auditLogService: AuditLogService) {}

  onModuleInit() {
    // tRPC 서비스 주입
    injectAuditLogService(this.auditLogService);
  }
}
