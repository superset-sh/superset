// Module
export { EmailModule } from './email.module';

// Services
export { EmailService } from './service/email.service';
export { EmailTemplateService } from './service/email-template.service';

// Controllers
export { EmailController } from './controller/email.controller';

// tRPC Router
export { emailRouter, injectEmailService, type EmailRouter } from './trpc';

// Types
export type * from './types';
