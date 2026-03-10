/**
 * Email Feature Routes
 */
import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { EmailLogsPage } from './routes/admin/email-logs-page';

export const EMAIL_ADMIN_PATH = '/email-logs';

/**
 * Create admin routes for email logs management
 */
export function createEmailAdminRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createRoute({
      getParentRoute: () => parentRoute,
      path: '/email-logs',
      component: EmailLogsPage,
    }),
  ];
}
