export * from './notification.module';
export { notificationRouter, injectNotificationService, type NotificationRouter } from './notification.router';
export * from './types';
export * from './dto';
export * from './service/notification.service';
export * from './service/notification-emitter.service';
export * from './gateway/notification.gateway';

// Schema - centralized in @superbuilder/drizzle
// Use: import { notifications, notificationSettings } from "@superbuilder/drizzle"
