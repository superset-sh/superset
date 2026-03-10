/**
 * Notification Feature - NestJS Module
 */

import { Module, OnModuleInit } from '@nestjs/common';

// Services
import { NotificationService } from './service/notification.service';
import { NotificationEmitterService } from './service/notification-emitter.service';

// Gateway
import { NotificationGateway } from './gateway/notification.gateway';

// Controllers
import { NotificationController } from './controller/notification.controller';

// Router
import { injectNotificationService } from './notification.router';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationGateway,
    NotificationEmitterService,
  ],
  exports: [
    NotificationService,
    NotificationGateway,
    NotificationEmitterService,
  ],
})
export class NotificationModule implements OnModuleInit {
  constructor(private readonly notificationService: NotificationService) {}

  onModuleInit() {
    // Inject service into tRPC router
    injectNotificationService(this.notificationService);
  }
}
